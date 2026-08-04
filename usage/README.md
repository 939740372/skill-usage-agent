# usage-agent 自助安装指南

本文档面向负责安装的 Agent。目标是：在不覆盖用户已有配置的前提下，安装本地 `usage-agent`，完成 Usage SSO，接入当前 Claude Code，并验证一次真实 Skill 调用。

## Agent 执行规则

1. 先检查当前操作系统、Node.js、npm、Claude Code 和工作目录。
2. 先读取本 README、`AGENTS.md`、`docs/authentication.md` 和 `docs/host-adapters.md`。
3. 检查项目级和用户级 Claude 配置，必须增量合并，不能覆盖已有设置。
4. 不保存或输出密码、Access Token、Refresh Token、Client Secret 或 SSH 私钥。
5. 需要浏览器登录时，打开登录流程并提示用户完成 SSO，不要索要密码。
6. 真实调用一次 Skill，再执行 `usage-agent flush`，最后报告成功项、失败项和待用户操作项。

## 1. 安装本地采集器

在仓库根目录执行：

```bash
cd usage/collector
npm install
npm link
command -v usage-agent
usage-agent status
```

要求 Node.js 20 或更高版本。`keytar` 是可选依赖，但登录必须有可用的操作系统安全凭据存储。

如果找不到 `usage-agent`，检查 `npm config get prefix` 对应的 `bin` 目录是否在 `PATH` 中，然后重新执行 `npm link`。不要使用明文文件保存 Token。

## 2. 配置认证参数

当前开发环境：

```bash
export USAGE_API_BASE_URL="http://10.133.5.15:18080"
export USAGE_OIDC_ISSUER="http://10.130.79.3:8080/realms/test"
export USAGE_OIDC_CLIENT_ID="skill-usage"
export USAGE_OIDC_REDIRECT_URI="http://127.0.0.1:8765/callback"
```

这些变量不包含密码或 Token。部署环境不同的时候，使用管理员提供的 REST API 和 OIDC Issuer 替换它们。

### Keycloak 必须满足

- `skill-usage` 是 Public Client，Client authentication 关闭。
- Standard/Authorization Code Flow 开启。
- PKCE 使用 `S256`。
- Valid Redirect URI 精确为 `http://127.0.0.1:8765/callback`。
- Scope 至少包含 `openid profile email`。
- Audience Mapper 配置如下：

```text
Mapper type: Audience
Included Client Audience: skill-usage
Add to access token: On
```

本机回调不是 `10.133.5.15:18080/callback`。浏览器先回到本机 `127.0.0.1:8765`，之后 Hook 才调用远端 REST API。

## 3. 登录并检查状态

```bash
usage-agent login
usage-agent status
```

登录成功后 `status` 应显示：

```json
{
  "authenticated": true
}
```

如果刚修改过 Audience Mapper，必须重新获取 Token：

```bash
usage-agent logout
usage-agent login
```

## 4. 安装 Claude Code 适配器

```bash
usage-agent install --host claude-code
```

该命令只创建：

```text
~/.skill-usage/adapters/claude-code.json
```

它不会自动覆盖 Claude Code 的设置，也不会修改现有插件。

获取采集器的绝对路径：

```bash
USAGE_AGENT_BIN="$(command -v usage-agent)"
printf '%s\n' "$USAGE_AGENT_BIN"
```

在目标项目创建或增量修改 `.claude/settings.local.json`，将 `<USAGE_AGENT_BIN>` 替换为上一步的绝对路径。完整示例见：

```text
usage/examples/claude-code-settings.local.json
```

核心 Hook 必须包含 `PreToolUse`、`PostToolUse` 和 `PostToolUseFailure`，并使用 `matcher: "Skill"`：

```json
{
  "env": {
    "USAGE_API_BASE_URL": "http://10.133.5.15:18080",
    "USAGE_OIDC_ISSUER": "http://10.130.79.3:8080/realms/test",
    "USAGE_OIDC_CLIENT_ID": "skill-usage",
    "USAGE_OIDC_REDIRECT_URI": "http://127.0.0.1:8765/callback"
  },
  "hooks": {
    "PreToolUse": [{
      "matcher": "Skill",
      "hooks": [{
        "type": "command",
        "command": "<USAGE_AGENT_BIN> record --host claude-code --stdin",
        "timeout": 3
      }]
    }],
    "PostToolUse": [{
      "matcher": "Skill",
      "hooks": [{
        "type": "command",
        "command": "<USAGE_AGENT_BIN> record --host claude-code --stdin",
        "timeout": 3
      }]
    }],
    "PostToolUseFailure": [{
      "matcher": "Skill",
      "hooks": [{
        "type": "command",
        "command": "<USAGE_AGENT_BIN> record --host claude-code --stdin",
        "timeout": 3
      }]
    }]
  }
}
```

如果 `.claude/settings.local.json` 已存在，必须保留原有 `env`、`hooks` 和其他键，只合并新增条目；不要直接替换整个文件。此文件通常是本机配置，不要把真实 Token 写入其中。

## 5. 真实验证

从包含 `.claude/settings.local.json` 的项目目录启动 Claude Code，执行一次明确的 Skill 调用。自动化验证可以使用：

```bash
claude --settings .claude/settings.local.json \
  -p 'Please invoke the Skill tool for superpowers:brainstorming on this trivial task: return exactly USAGE_EVENT_OK and do not edit files. Do not merely describe the skill; actually invoke it.' \
  --output-format stream-json \
  --include-hook-events \
  --no-session-persistence \
  --permission-mode dontAsk \
  --verbose
```

验收标准：

- Claude Code 实际调用 `Skill`，不是只描述 Skill。
- 能看到 `PreToolUse:Skill` 和 `PostToolUse:Skill` Hook 事件。
- Agent 任务正常完成。
- 执行 `usage-agent flush` 后没有失败事件。

```bash
usage-agent flush
```

一次 Skill 调用只产生一条逻辑统计。Hook 重试、开始/完成事件通过调用标识幂等合并，不应重复计数。

## 6. Outbox 与故障降级

网络或服务不可用时，Hook 不阻塞 Agent，事件写入：

```text
~/.skill-usage/outbox/
```

服务恢复后执行：

```bash
usage-agent flush
```

不可重试的事件会移动到：

```text
~/.skill-usage/failed/
```

常用命令：

```bash
usage-agent status
usage-agent login
usage-agent logout
usage-agent flush
usage-agent install --host claude-code
```

## 7. 其他宿主

可以先创建适配器清单：

```bash
usage-agent install --host codex
usage-agent install --host cursor
usage-agent install --host opencode
usage-agent install --host workbuddy
usage-agent install --host trae
```

这些命令不会自动修改宿主配置。只有确认实际版本提供稳定的 Skill Hook/Plugin 事件，并验证 Skill 名称、调用 ID、会话 ID 和结果状态后，才能继续接入。

| 宿主 | 当前策略 |
| --- | --- |
| Codex | 先验证宿主 Hook 是否提供 Skill 专属事件 |
| Cursor | 不能把普通工具调用当作 Skill 调用 |
| OpenCode | 使用 Plugin 的 Skill 工具前后事件 |
| WorkBuddy | 优先尝试 Claude Code 兼容 Hook |
| TRAE | 没有稳定事件时标记为不支持可靠统计，不使用模型自报 |

## 常见问题

### `Invalid parameter: redirect_uri`

在 Keycloak 的 `skill-usage` Client 中精确添加：

```text
http://127.0.0.1:8765/callback
```

不要添加末尾斜杠，也不要填写 5.15 的地址。

### 登录成功但 `flush` 返回 HTTP 401

检查 Audience Mapper 是否已经把 `skill-usage` 写入 Access Token，然后重新登录：

```bash
usage-agent logout
usage-agent login
usage-agent flush
```

### Hook 不执行

检查：

```bash
command -v usage-agent
cat ~/.skill-usage/adapters/claude-code.json
```

确认 Claude Code 从正确项目目录启动，`.claude/settings.local.json` 是合法 JSON，Hook 命令使用绝对路径，并且 matcher 是 `Skill`。


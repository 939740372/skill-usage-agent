# skill-usage-agent

独立的 Skill Usage V1 本地采集器和宿主安装说明。

## 快速安装

Node.js 20+ 环境下，直接从 npm 安装：

```bash
npm install --global @ryantorres/skill-usage-agent
usage-agent setup --host claude-code --project-dir "$PWD"
usage-agent login
usage-agent status
```

如果所在环境无法访问 npm，也可以直接从 GitHub 安装：

```bash
npm install --global github:939740372/skill-usage-agent
```

`setup` 会创建本地 Usage 配置、写入 adapter manifest，并增量合并项目的 `.claude/settings.local.json`；不会删除已有配置，也不会写入 Token。

如果要交给 Claude Code、Codex 或其他 Agent 执行安装，请让它阅读：

```text
usage/README.md
```

推荐直接使用以下提示词：

```text
请阅读当前仓库的 usage/README.md，按文档实际完成 usage-agent 快速安装并接入当前 Claude Code：先检查 Node.js 和已有配置，只做增量修改；执行 npm install -g @ryantorres/skill-usage-agent、usage-agent setup --host claude-code --project-dir 当前项目目录，启动 SSO 登录（需要我在浏览器操作时提示我），然后执行 status、真实调用一次 Skill 和 flush 验证链路；不要覆盖已有配置，不要保存或输出任何密码、Token，最后报告每一步结果和未完成项。
```

仓库内容：

- `usage/README.md`：面向 Agent 的完整安装、认证、Claude Code 接入和验收流程。
- `package.json`：可从 npm 或 GitHub 全局安装的包入口。
- `usage/collector/`：Node.js 20+ 本地采集器、OIDC/PKCE 登录、OS 安全凭据存储、outbox 和宿主适配器。
- `usage/docs/`：认证和宿主适配补充说明。
- `usage/examples/`：Claude Code Hook 配置示例。

已通过 `npm link` 安装时，可直接使用 `usage-agent update` 从 GitHub 更新当前 checkout 并安装依赖；命令要求本地工作区没有未提交改动。

本仓库不包含数据库密码、Token、SSH 私钥或服务端数据库初始化脚本。

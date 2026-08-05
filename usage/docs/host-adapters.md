# 宿主适配器

所有宿主适配器最终调用：

```bash
usage-agent record --host <host> --stdin
```

事件从 stdin 读取。采集器只保留 Skill 名称、版本、宿主、调用 ID、会话 ID、结果和白名单元数据，不采集 Prompt、代码、文件内容或宿主内部 Token。

Claude Code 快速接入：

```bash
usage-agent setup --host claude-code --project-dir <project-dir>
```

该命令会保留已有设置，并增量加入 `Skill` 工具生命周期 Hook 和直接 Slash 的 `UserPromptExpansion` Hook；只需要 adapter 清单时才使用 `usage-agent install --host <host>`。

## 当前状态

| 宿主 | 接入方式 | 状态 |
| --- | --- | --- |
| Claude Code | `Skill` 工具生命周期 Hook + 直接 Slash 的 `UserPromptExpansion` Hook | 已完成运行级验证 |
| Codex | 宿主 Hook → `usage-agent record --host codex --stdin` | 需要按实际版本探针 |
| Cursor | 宿主 Hook/Plugin → `usage-agent record --host cursor --stdin` | 需要按实际版本探针 |
| OpenCode | Plugin 的 Skill 工具前后事件 → `usage-agent record --host opencode --stdin` | 需要按实际版本探针 |
| WorkBuddy | 优先使用 Claude Code 兼容 Hook | 需要按实际版本探针 |
| TRAE | 仅在存在稳定 Skill Hook/Plugin 时接入 | 默认不承诺可靠统计 |

`usage-agent install --host <host>` 只创建 `~/.skill-usage/adapters/<host>.json` 清单，不会自动覆盖宿主配置。

## 事件判定

- 只有确认事件目标确实是 Skill 时才上报；普通工具调用不计数。
- Claude Code 的 `Skill` 工具 `PreToolUse` 和直接 Slash 的 `UserPromptExpansion` 统一记录为 `started`；工具的明确成功、失败、拒绝事件可以使用同一 `eventId` 更新终态。
- `UserPromptExpansion` 仅接受 `expansion_type=slash_command`，从 `command_name` 获取 Skill 名称，支持 `plugin:skill` 命名空间；`mcp_prompt` 和普通 Prompt 不计入 Skill 使用。
- 直接 Slash 没有稳定宿主调用 ID，因此每次 Hook 生成独立事件 ID；采集器重试同一个已归一化事件时仍复用该事件 ID。
- 不采集 Prompt、参数或项目路径。没有稳定 Skill 专属事件时，不能用模型自报补齐统计。

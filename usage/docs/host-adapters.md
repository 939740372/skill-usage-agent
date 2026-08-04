# 宿主适配器

所有宿主适配器最终调用：

```bash
usage-agent record --host <host> --stdin
```

事件从 stdin 读取。采集器只保留 Skill 名称、版本、宿主、调用 ID、会话 ID、结果和白名单元数据，不采集 Prompt、代码、文件内容或宿主内部 Token。

## 当前状态

| 宿主 | 接入方式 | 状态 |
| --- | --- | --- |
| Claude Code | `Skill` 工具的 `PreToolUse`、`PostToolUse`、`PostToolUseFailure` Hook | 已完成运行级验证 |
| Codex | 宿主 Hook → `usage-agent record --host codex --stdin` | 需要按实际版本探针 |
| Cursor | 宿主 Hook/Plugin → `usage-agent record --host cursor --stdin` | 需要按实际版本探针 |
| OpenCode | Plugin 的 Skill 工具前后事件 → `usage-agent record --host opencode --stdin` | 需要按实际版本探针 |
| WorkBuddy | 优先使用 Claude Code 兼容 Hook | 需要按实际版本探针 |
| TRAE | 仅在存在稳定 Skill Hook/Plugin 时接入 | 默认不承诺可靠统计 |

`usage-agent install --host <host>` 只创建 `~/.skill-usage/adapters/<host>.json` 清单，不会自动覆盖宿主配置。

只有确认事件目标确实是 Skill 时才上报。没有稳定 Skill 专属事件时，不能用模型自报补齐统计。


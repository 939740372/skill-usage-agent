# usage-agent 安装约定

- 先阅读 `README.md`、`docs/authentication.md` 和 `docs/host-adapters.md`。
- Node.js 要求 20 或更高版本。
- 安装时必须保留现有宿主配置，只做增量合并。
- 不把密码、Access Token、Refresh Token 或 SSH 私钥写入项目、日志或 Git。
- Refresh Token 只能使用操作系统安全凭据存储；不能写入项目文件。
- Hook/Plugin 上报失败必须 fail-open，事件进入 `~/.skill-usage/outbox`，不能阻塞 Agent。
- 未确认稳定 Skill 事件的宿主不能宣称已完成接入，也不能用模型自报替代宿主事件。


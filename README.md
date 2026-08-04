# skill-usage-agent

独立的 Skill Usage V1 本地采集器和宿主安装说明。

如果要交给 Claude Code、Codex 或其他 Agent 执行安装，请让它阅读：

```text
usage/README.md
```

推荐直接使用以下提示词：

```text
请阅读当前仓库的 usage/README.md，按文档实际完成 usage-agent 安装并接入当前 Claude Code：先检查环境和已有配置，只做增量修改；执行 npm install、npm link、usage-agent install --host claude-code，配置项目级 Hook，启动 SSO 登录（需要我在浏览器操作时提示我），然后执行 status、真实调用一次 Skill 和 flush 验证链路；不要覆盖已有配置，不要保存或输出任何密码、Token，最后报告每一步结果和未完成项。
```

仓库内容：

- `usage/README.md`：面向 Agent 的完整安装、认证、Claude Code 接入和验收流程。
- `usage/collector/`：Node.js 20+ 本地采集器、OIDC/PKCE 登录、OS 安全凭据存储、outbox 和宿主适配器。
- `usage/docs/`：认证和宿主适配补充说明。
- `usage/examples/`：Claude Code Hook 配置示例。

本仓库不包含数据库密码、Token、SSH 私钥或服务端数据库初始化脚本。


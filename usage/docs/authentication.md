# Usage SSO 认证

## 当前开发环境

| 配置 | 值 |
| --- | --- |
| Usage REST API | `http://10.133.5.15:18080` |
| OIDC Issuer | `http://10.130.79.3:8080/realms/test` |
| OIDC Discovery | `http://10.130.79.3:8080/realms/test/.well-known/openid-configuration` |
| Client ID | `skill-usage` |
| Redirect URI | `http://127.0.0.1:8765/callback` |
| Access Token Audience | `skill-usage` |

部署环境不同的时候，用管理员提供的地址替换这些配置；不要把密码或 Client Secret 写入仓库。

## Keycloak Client

`skill-usage` 应配置为公开 OIDC Client：

- Client authentication：关闭（Public Client）。
- Standard/Authorization Code Flow：开启。
- PKCE：使用 `S256`。
- Valid Redirect URI：精确添加 `http://127.0.0.1:8765/callback`。
- Scopes：至少包含 `openid profile email`。

本机 CLI 的回调必须是 loopback 地址，不是 REST 服务地址。登录过程是：

```text
本机 usage-agent
  → 浏览器登录 Keycloak
  → 127.0.0.1:8765/callback
  → 本机保存 Token
  → Hook 调用 Usage REST API
```

## Audience Mapper

服务端校验 Access Token 的 `aud`，因此必须在 `skill-usage` Client 的 dedicated client scope 或默认 client scope 中配置：

```text
Mapper type: Audience
Included Client Audience: skill-usage
Add to access token: On
```

不需要开启 `Add to ID token` 或 `Add to userinfo`。修改 Mapper 后必须重新登录获取新 Token：

```bash
usage-agent logout
usage-agent login
```

## Token 存储

`usage-agent login` 使用 Authorization Code + PKCE。Refresh Token 存放在 macOS Keychain、Windows Credential Manager 或 Linux 可用的安全凭据存储中；没有安全存储时登录失败，不降级写明文文件。


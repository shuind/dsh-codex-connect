# @shuind/dsh-codex-connect

给 DeepSeek Harness（DSH）用的 ChatGPT OAuth / Codex 模型提供方插件：免 API Key 使用 ChatGPT 订阅接入 `openai-codex` 模型，支持多账号切换（含多个 Team 账号）、配额查看、速度模式、独立作用域代理，以及按需开启的原生上下文压缩、GPT Image 生图/改图和联网搜索。

本仓库是从上游 `dsh-codex-connect` fork 并精简重构后的独立维护版本，移除了已废弃或过重的实验模块，按 `shared / platform / features / client` 分层维护。

当前版本 `0.2.0` 适配 **DeepSeek Harness `0.2.2-rc.1`–`0.2.2-rc.5`**（`engines.dsh: >=0.2.2-rc.1 <=0.2.2-rc.5`，已在 `0.2.2-rc.5` 上完整验证）。

## 安装

### 从插件市场 / npm 安装

在 Harness 的 **插件 → 添加插件** 中输入 `@shuind/dsh-codex-connect`（或指定 `@shuind/dsh-codex-connect@0.2.0`），安装后按提示重启 Harness 即可。

也可以在 Web profile 下通过 CLI 安装：

```sh
dsh plugin --profile web add @shuind/dsh-codex-connect
```

### 从离线包安装（GitHub Release）

1. 在 [Releases](https://github.com/shuind/dsh-codex-connect/releases) 页面下载对应版本的 `.tgz` 安装包（如 `shuind-dsh-codex-connect-0.2.0.tgz`）。
2. 打开 Harness 桌面端的 **插件 → 添加插件**，填入该 `.tgz` 文件的本地路径确认安装，然后重启 Harness。

> 桌面端请直接在软件内的插件页面安装或升级，不要用命令行里可能存在的旧版 `dsh` 去改桌面端的 `desktop` profile。

### 授权登录

1. 打开 **设置 → 模型 → Openai-Codex → 授权**（或 **设置 → 插件 → Codex Connect**），在浏览器中完成 ChatGPT 登录。
2. 远程浏览器无法直连 `localhost` 回调端口时，可展开页面中的回调 URL 表单粘贴完整跳转地址完成授权；也可以在主机终端运行 `dsh-codex-connect login`。
3. OAuth 凭据独立保存在 `$DSH_HOME/.openai-codex-auth.json`，不会读写 `~/.codex/auth.json`；安装插件不会改动原有默认模型或搜索路由。

## 功能概览

- **多账号与实时配额**：
  - 支持在主机上保存最多 16 个 ChatGPT 账号并手动切换当前账号；账号变更只作用于后续新请求，不影响进行中的回合。
  - 在设置页与输入框右侧实时展示 `5h` / `7d` 额度窗口及重置时间。
- **模型目录、上下文预算与推理强度**：
  - 内置最新 Codex 模型目录（含 `gpt-6.2-sol`、`gpt-6.2-astra` 等），可在设置页勾选模型选择器中显示的模型。
  - 支持按单个模型覆写客户端上下文预算（隐藏模型仍保留其配置），以及设置默认推理强度（`low` / `medium` / `high` / `xhigh` / `max`）。
- **会话速度控制（Standard / Fast）**：
  - 输入框右侧可直接切换当前对话的速度档位；设置页支持分别配置新建主对话与新建子代理的默认速度。
- **独立作用域 HTTP(S) 代理**：
  - 默认直连；需要时可在网络页一键扫描常见本机代理端口，或手动输入并探测代理地址。
  - 代理仅作用于 Codex Connect 自身流量，不影响宿主及其他插件的请求，代理失败也不会静默回退直连。
- **按需开启的可选能力（默认全部关闭）**：
  - **Codex 原生上下文管理（`enableNativeCompaction`）**：长对话达到上下文阈值时使用 Codex 原生压缩并保存加密 checkpoint，不可用时自动回退到 Harness 常规摘要。
  - **GPT Image 生图与改图（`enableImageGeneration`）**：无需切换聊天模型（使用 DeepSeek 等模型时也能直接调用），对话尾部直接展示生成结果，支持选图句柄多轮修改与原图下载。
  - **Codex 联网搜索（`enableSearch`）**：启用期间临时接管当前 profile 的 Web 搜索路由，停用后自动恢复原路由。
- **轻量更新提醒与 CLI 工具**：
  - 优先查询 npm（`@shuind/dsh-codex-connect`），查不到时回退 GitHub Releases；发现新版本仅在顶部提示一行，同一版本只提醒一次。
  - 提供独立 CLI：`dsh-codex-connect <doctor|login|logout|status|trust-origin|trusted-origins|untrust-origin>`。

## 与 dsh-codex-harness 配合

本插件保持独立插件形态，与 [@shuind/dsh-codex-harness](https://github.com/shuind/dsh-codex-harness) 直接配合使用：

- `dsh-codex-harness` 会自动识别 `openai-codex` 提供方，将模型目录、逐模型上下文上限、`Fast` 档位、联网搜索和原生压缩交由本插件处理，无需额外配置。
- 输入框右下角的上下文容量按钮与 `dsh-codex-connect` 的逐模型预算设置直接联动。

## 更多说明

- 安装、升级与离线部署：[INSTALL.md](INSTALL.md)
- 配置项、远程授权与故障排查：[docs/reference.zh.md](docs/reference.zh.md) / [docs/reference.md](docs/reference.md)
- 架构与边界设计：[docs/design.zh.md](docs/design.zh.md) / [docs/design.md](docs/design.md)
- 版本兼容与迁移：[MIGRATION.md](MIGRATION.md) · [VERSIONING.md](VERSIONING.md)

## License

Apache-2.0。保留上游原作者版权声明，详见 [LICENSE](LICENSE) 与 [NOTICE](NOTICE)。

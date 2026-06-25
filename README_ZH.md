<h1 align="center">DidaSync</h1>

<p align="center"><b>Obsidian 与滴答清单 / TickTick 的任务双向同步插件。</b></p>

<p align="center">

一个将 Dida365 或 TickTick 任务带入 Obsidian 的任务同步插件，提供时间线、时间块、番茄钟和侧边栏管理视图。

感谢大家的任何issue和PR，这是我第一个收到issue和PR的开源项目，你们的建议就是我维护DidaSync开源项目的动力。

</p>

<p align="center"><a href="https://github.com/CYZice/Obsidian-DidaSync/stargazers">

<img src="https://img.shields.io/github/stars/CYZice/Obsidian-DidaSync?style=flat-square&color=6c5ce7" alt="GitHub Stars">

</a>

<a href="https://github.com/CYZice/Obsidian-DidaSync/releases/latest">

<img src="https://img.shields.io/github/v/release/CYZice/Obsidian-DidaSync?style=flat-square&color=00b894" alt="Latest Release">

</a>

<a href="https://github.com/CYZice/Obsidian-DidaSync/releases">

<img src="https://img.shields.io/github/downloads/CYZice/Obsidian-DidaSync/total?style=flat-square&color=0984e3" alt="Downloads">

</a>

<a href="https://github.com/CYZice/Obsidian-DidaSync/blob/main/LICENSE">

<img src="https://img.shields.io/github/license/CYZice/Obsidian-DidaSync?style=flat-square&color=636e72" alt="License">

</a>

</p>

<p align="center">

<a href="./README.md">English</a> | <b>简体中文</b>

</p>

## 为什么用 DidaSync

- 更快的同步策略：在 Obsidian 与 Dida365 / TickTick 之间保持实时双向同步。
- 更原生的可视化：用侧边栏、时间块、时间线和番茄钟视图管理任务。
- 更智能的任务工作流：支持原生任务、任务同步到笔记、Markdown 回跳和可选 MCP 集成。

## 产品概览

| 时间块视图 | 列表视图 |
|:--:|:--:|
| ![Time Block View](./assets/time-block-view.png) | ![Timeline View](./assets/timeline-view.png) |
| 按天安排和拖拽任务。 | 快速查看进度与截止时间。 |

## 核心能力

| 能力 | 说明 |
|---------|-------------|
| 🔄 **双向同步与原生任务联动** | 在 Obsidian 与 Dida365 / TickTick 之间同步任务状态、内容和详情，也可从原生 `- [ ]` 任务语法创建和联动任务。 |
| 🗓️ **多视图任务管理** | 提供侧边栏、时间块、时间线和番茄钟视图，覆盖查看、排程和专注三类场景。 |
| 🌲 **任务结构整理** | 支持子任务嵌套、拖拽排序、拖成子任务、跨项目移动，更自然地整理复杂任务结构。 |
| ✅ **已完成任务查看** | 查看已完成任务，按时间范围筛选，助力报告和总结。 |
| 📝 **笔记联动** | 支持拖拽到 Markdown、任务同步到笔记、从笔记链接回跳到任务。 |
| 🤖 **MCP / AI 集成** | 可选开启本地 MCP 服务，让 AI 工具读取、创建、更新和排程任务。 |

## 快速开始

1. [安装并启用插件](#安装)。
2. 在插件设置中点击 **Authorize**，通过官方 OAuth 2.0 连接 Dida365 或 TickTick。
3. 打开侧边栏或使用功能区图标开始同步任务。
4. 如需在移动端手动完成认证，可在浏览器授权后复制返回的 `code` 并粘贴回插件。

## 常见工作流

### 1. 使用 Obsidian 原生任务语法 `- [ ]`

1. 启用 **设置 -> DidaSync -> 同步设置 -> 启用原生任务同步**。
2. 在 Markdown 文档中输入 `- [ ] ` 等原生任务语法。
3. DidaSync 会弹出操作菜单，用于创建、关联或补充日期等信息。
4. 同步后，任务行会追加 Dida 链接；之后勾选 `- [x]` 也可联动更新远端状态。


### 2. 整理嵌套子任务与拖拽结构

1. 在侧边栏任务列表中展开父任务。
2. 直接拖拽任务到其他任务上下方，可调整顺序。
3. 将任务拖到某个父任务下，可整理为嵌套子任务。
4. 将任务拖到其他项目标题或容器，可同时调整归属项目。

在 Obsidian 内更自然地整理复杂任务结构，并同步回滴答清单 / TickTick。


### 3. 同步任务到笔记

1. 打开 **设置 -> DidaSync -> 同步设置 -> 任务同步到笔记设置**。
2. 设置写入区块、笔记保存位置、周起始日和是否查询远端任务。
3. 打开命令面板并运行 `同步任务到笔记`。
4. 在弹窗中选择某日、某周、某月、某年或自定义时间段。
5. 在 `清单来源` 中选择全部清单、仅侧边栏可见清单，或自定义勾选需要导入的清单。
6. DidaSync 会将该时间段和清单范围内的任务写入同名笔记；也可以开启“每次生成新笔记”来创建独立汇总文件。

![任务同步到笔记设置](./assets/synctasktofile.png)

这个设置页把写入区块、保存目录和日 / 周 / 月 / 年路径模式集中到同一处，不需要手写 JSON 就能完成同步配置。

也可以在任意业务笔记中声明一个块级同步视图。块标题默认可使用 `> [!didasync]`，也可以使用“写入区块”设置里的标题：

```md
> [!didasync] {"range":"2026-01-01~2026-12-31","projects":["project1","id:abc123"]}
> [!todo] {"range":"2026-01-01~2026-12-31","projects":["project1"]}
```

打开 `同步任务到笔记` 弹窗后，若当前文件存在 didasync 块，弹窗会默认切换到“同步当前文件块”模式。你也可以在该模式中插入新的同步块，或选中已有块后用日期选择器和清单选择器保存配置，无需手写 JSON。同步执行时仍以文件中的块配置为准；当前版本支持 `range` 和 `projects`，其中 `range` 支持 `YYYY-MM-DD` 或 `YYYY-MM-DD~YYYY-MM-DD`，`projects` 可填写项目名或 `id:<项目ID>`；标签和标题匹配暂不支持。

### 拖拽任务到 Markdown 文档

你可以将侧边栏任务列表中的任务直接拖入任意 Obsidian 编辑器：

1. 在侧边栏找到目标任务。
2. 将其拖到 Markdown 文档中。
3. DidaSync 会插入一行原生 Obsidian 任务并附带 Dida 链接，例如：

```md
- [ ] 数电笔记 [🔗Dida](obsidian://dida-task?didaId=xxxx) 📅 2026-05-25
```

这样既可以在笔记中勾选任务，也可以通过链接跳回对应的 Dida 任务。

## OAuth 排查

插件内置 OAuth 授权。如果授权失败，优先检查以下几项：

1. 确认网络连接正常，必要时切换代理或 VPN 状态后重试。
2. 如果移动端浏览器不能自动回到本地回调页，可使用手动 `code` 流程完成认证。
3. 检查本地 `8080` 端口是否已被占用。
4. 如果你修改了 OAuth 回调端口，也要同步更新 Dida 开发者后台中的 redirect URL。
5. 默认建议继续使用 `http://localhost:<端口>/callback`，以兼容旧配置。
6. 如果 Windows 上授权后回调页空白或长时间无响应，请将回调地址模式切换为 `127.0.0.1`，并同步修改开发者后台中的 redirect URL。

如果 `8080` 端口被占用，本地 OAuth 回调服务通常无法启动。这种情况下，请将 **设置 -> DidaSync -> OAuth 设置 -> 服务器端口** 改为其他可用端口，并确保开发者后台的 redirect URL 与插件设置页当前显示的地址保持一致后重试。

## MCP / AI 插件使用

启用 **设置 -> DidaSync -> 高级/重置 -> MCP 服务** 后，可将以下配置添加到兼容 MCP 的 AI 插件中：

```json
{
  "transport": "http",
  "url": "http://127.0.0.1:35829/mcp",
  "headers": {
    "Authorization": "Bearer <DIDASYNC_MCP_TOKEN>"
  }
}
```

当前 MCP 服务主要覆盖三类能力：

- 读取：列出任务、读取任务、搜索任务、列出项目、读取已完成任务
- 写入：创建、更新、排程、完成、删除、移动任务
- 同步：手动触发同步


## 安装

### 官方插件市场安装

1. 打开 Obsidian 的 `设置 -> 第三方插件`。
2. 如有需要，先关闭 `安全模式`，然后点击 `浏览`。
3. 搜索 `DidaSync`。
4. 点击 `安装`，然后启用插件。

![社区插件市场](./assets/market.png)

### 手动安装

1. 从 [Releases](https://github.com/CYZice/Obsidian-DidaSync/releases) 下载最新的 `main.js`、`manifest.json` 和 `styles.css`。
2. 创建目录 `<vault>/.obsidian/plugins/didasync/`。
3. 将文件复制到该目录，并在 Obsidian 设置中启用插件。

## 发布与隐私说明

- DidaSync 通过 **官方 OAuth 2.0** 连接 — 插件从不要求也不存储用户名或密码。
- 插件会访问官方 Dida365 或 TickTick API 以读取、创建、更新、完成、删除、移动和同步任务。
- 插件不上传遥测数据，也不包含广告。
- 启用 MCP 服务后，插件会在本机 `127.0.0.1` 上启动本地 HTTP 服务，并使用你配置的 token 进行鉴权。
- OAuth token、MCP token 和插件设置都通过 Obsidian 的插件数据存储机制保存在本地。

## 支持

如果 DidaSync 对你有帮助，可以为仓库点个 Star，或提交 Issue 帮助改进。

<p align="center">

<a href="https://github.com/CYZice/Obsidian-DidaSync/issues" target="_blank">
<img src="https://img.shields.io/badge/反馈-Issues-red?style=for-the-badge" alt="Issues">
</a>

</p>

## 许可证

[MIT License](LICENSE)

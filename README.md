<h1 align="center">Obsidian-DidaSync</h1>

<p align="center"><b>Obsidian 与 滴答清单/TickTick 的双向同步插件</b></p>

<p align="center">

一个强大的 Obsidian 任务同步插件，将您的滴答清单/TickTick 任务直接带入笔记中，并提供直观的日历时间轴和时间块视图。

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

<b>简体中文</b> | <a href="./README_EN.md">English</a>

</p>

## 亮点

### 🔄 双向同步

Obsidian-DidaSync 确保您的任务始终保持最新，无论是在 Obsidian 还是在滴答清单中。

| 原生任务同步 | 快速创建任务 |
|:--:|:--:|
| ![Native Task Sync](./assets/native-task-sync.png) | ![Sidebar View](./assets/sidebar-view.png) |
| 直接将滴答清单任务同步到笔记中，跨平台保持状态和详情同步 | 使用专用弹窗和命令，从 Obsidian 笔记中快速创建任务 |

### 📅 视觉化任务管理

| 时间块视图 | 时间线视图 | 侧边栏视图 |
|:--:|:--:|:--:|
| ![Time Block View](./assets/time-block-view.png) | ![Timeline View](./assets/timeline-view.png) | ![Sidebar View](./assets/sidebar-view.png) |
| 使用日历风格的时间块视图可视化您的一天 | 垂直时间线，跟踪任务进度和截止日期 | 直接从 Obsidian 侧边栏管理整个滴答清单任务列表 |

### 🍅 番茄钟 + 📁 项目目录

| 番茄钟视图 | 项目目录管理 |
|:--:|:--:|
| ![Pomodoro View](./assets/番茄钟.png) | ![Project View](./assets/project.png) |
| 专注于时间块的番茄工作法任务视图，支持计时和专注追踪 | 支持创建、重命名、删除项目，自定义项目图标，直观管理滴答清单项目分类 |

### 🤖 MCP / AI 插件集成

Obsidian-DidaSync 可在桌面端开启本地 HTTP MCP 服务，让支持 MCP 的 AI 插件安全调用任务工具。

| 能力 | 描述 |
|---------|-------------|
| 本地 MCP 服务 | 监听 `127.0.0.1`，默认关闭，可在设置中启用 |
| Token 鉴权 | 使用本地 token 保护任务读写操作 |
| AI 工具调用 | 支持列出、获取、搜索、新建、更新、批量排程、完成、删除任务，以及项目列表与手动同步 |

## 功能特性

| 功能 | 描述 | 如何使用 |
|---------|-------------|-------------|
| 🔄 **双向同步** | 在 Obsidian 和 滴答清单/TickTick 之间同步任务状态、内容和详情 | 完成 OAuth 后，在侧边栏或设置中执行同步即可 |
| 🗓️ **多样视图** | 提供时间块、时间线、侧边栏任务列表、番茄钟等多种查看方式 | 从侧边栏、命令面板或对应视图入口打开 |
| 🍅 **番茄钟视图** | 专注于时间块的番茄工作法任务视图，支持计时和专注追踪 | 在插件视图中切换到番茄钟视图使用 |
| 📁 **项目目录管理** | 支持创建、重命名、删除项目，自定义项目图标，并按项目组织任务 | 在项目视图中直接管理项目目录和项目内任务 |
| 📝 **任务详情 / 检查项 / 子任务** | 支持编辑任务标题、备注、检查项和子任务，并同步到滴答清单 | 在任务列表中点开任务详情即可编辑 |
| 🤖 **MCP / AI 插件集成** | 可开启本地 MCP 服务，让支持 MCP 的 AI 插件通过工具操作滴答任务 | 见后文 [MCP / AI 插件使用](#mcp--ai-插件使用) |
| ✋ **交互与拖拽排期**| 时间段视图支持全天任务丝滑拖拽排期，防止编辑误触，点击日期徽章即可一键唤出日历重新排期 | 在时间段/时间块视图里直接拖拽任务调整时间 |
| 🔁 **循环任务支持** | 完美同步并管理滴答清单中的复杂重复任务（支持显示与打卡循环规则） | 正常同步后即可查看和勾选循环任务 |
| 📝 **日记集成** | 支持将今日任务同步到当日日记中 | 见后文 [同步今日任务到当日日记](#同步今日任务到当日日记) |
| ⚡ **快速创建 / 插入任务** | 支持在项目中创建任务，或在编辑器中快速插入、关联已有滴答任务 | 使用命令 `在项目中创建任务`、`插入/创建滴答任务` |
| 🕒 **自动同步** | 可配置的后台同步，保持数据实时更新 | 在 **同步设置** 中开启自动同步并设置间隔 |
| 📋 **拖拽到 Markdown** | 支持将任务行直接拖拽到 Markdown 编辑器，生成带链接的复选框列表 | 见后文 [从任务列表拖动任务到 Markdown 文档](#从任务列表拖动任务到-markdown-文档) |
| 🔗 **Markdown 链接回跳** | 从文档中的 Dida 链接可直接跳回 Obsidian 内的任务详情或定位关联任务 | 在文档里点击 `obsidian://dida-task` 链接即可 |
| 🔍 **任务搜索** | 在任务操作菜单中直接搜索已有关务并快速关联 | 在任务菜单或建议弹窗中输入关键词搜索 |
| `- [ ]` **原生任务同步** | 支持识别 Obsidian 原生任务语法并同步到滴答清单 | 见后文 [Obsidian 原生任务语法 `- [ ]`](#obsidian-原生任务语法--) |

## 快速开始

1. 打开 **Obsidian 设置** → **第三方插件** → **浏览** → 搜索 **"Obsidian-DidaSync"**
2. 安装并启用插件
3. 在插件设置中使用安全便捷的 OAuth 授权一键连接您的滴答清单/TickTick 账号（无需繁琐配置 API Key）
4. 打开侧边栏或使用功能条图标开始同步您的任务！

## 常见用法

### 同步今日任务到当日日记

当前插件支持把今天的任务同步到当日日记中，常见用法如下：

1. 打开 **设置 → Obsidian-DidaSync → 同步设置 → 日记同步设置**
2. 配置“目标语法块标识”，也就是你想写入的日记区块标题
3. 打开命令面板，执行 `同步今日任务到日记`
4. 插件会把今天的任务写入当前日记中对应区块

### 从任务列表拖动任务到 Markdown 文档

当前支持直接把侧边栏任务拖进 Obsidian 编辑器：

1. 在侧边栏任务列表中找到目标任务
2. 直接拖动任务到任意 Markdown 文档
3. 插件会插入 Obsidian 原生任务格式，并自动附带 Dida 跳转链接，例如：

```md
- [ ] 数电笔记 [🔗Dida](obsidian://dida-task?didaId=xxxx) 📅 2026-05-25
```

这样后续既能在文档里勾选，也能从链接跳回对应滴答任务。

### Obsidian 原生任务语法 `- [ ]`

1. 启用 **设置 → Obsidian-DidaSync → 同步设置 → 启用原生任务同步**
2. 在 Markdown 文档中输入原生任务语法 `- [ ] `
3. 输入到这一格式时，插件会唤出操作菜单
4. 你可以选择将该任务同步到滴答清单，或继续补充日期等信息
5. 同步成功后，任务后面会追加 Dida 链接，后续勾选 `- [x]` 也可联动任务状态

如果你更习惯键盘流，也可以用命令 `插入/创建滴答任务` 来唤出任务建议与创建入口。

## OAuth 认证排查

支持 OAuth 一键认证，若认证失败，优先检查下面几项：

1. 检查网络连接是否正常
2. 如果你当前网络环境访问滴答认证页不稳定，尝试切换是否开启梯子后再试
3. 检查本地 `8080` 端口是否被占用
4. 如果你修改了插件里的 OAuth 回调端口，记得同时更新滴答开发者后台中的 redirect URL

`8080` 端口被占用时，通常会导致本地 OAuth 回调服务无法启动。此时可以在 **设置 → Obsidian-DidaSync → OAuth 配置 → 服务器端口** 中改成其他可用端口，再重新配置一次 redirect URL 后重试。

## MCP / AI 插件使用

在 **设置 → Obsidian-DidaSync → 高级/重置 → MCP 服务** 中启用 MCP 服务后，可将以下配置添加到支持 MCP 的 AI 插件：

```json
{
  "transport": "http",
  "url": "http://127.0.0.1:35829/mcp",
  "headers": {
    "Authorization": "Bearer <DIDASYNC_MCP_TOKEN>"
  }
}
```

### 1.4.x 新增 MCP 工具

1.4.x 版本引入了本地 HTTP MCP server，并暴露了 10 个可供 AI 直接调用的工具：

| 分类 | 工具 |
|---------|-------------|
| 读取工具 | `dida_list_tasks`、`dida_get_task`、`dida_search_tasks`、`dida_list_projects` |
| 写入工具 | `dida_create_task`、`dida_update_task`、`dida_schedule_tasks`、`dida_complete_task`、`dida_delete_task` |
| 同步工具 | `dida_sync_now` |

### YOLO 调用 MCP 的效果

下面这组流程展示了 YOLO 类 Agent 通过 DidaSync MCP 为“今天的任务”做读取、规划、确认和写回。

| 步骤 | MCP 调用效果 |
|---------|-------------|
| 1. 读取与同步 | Agent 先执行 `dida_sync_now`，再用 `dida_list_tasks` 获取当天待办，识别出 3 个待安排任务。 |
| 2. 生成排程草案 | 基于用户可用时间和任务时长偏好，Agent 先给出“初步排程草案”，而不是直接写入。 |
| 3. 二次确认 | 用户确认草案后，Agent 将晚上 19:00-23:00 的时间块整理成可执行计划。 |
| 4. 写回滴答 | Agent 连续调用 `dida_update_task`，把确认后的时间安排写回滴答，并回显最终排程结果。 |

| 读取任务并生成草案 | 确认后写回滴答 |
|:--:|:--:|
| ![YOLO MCP Step 1](./assets/yolo-mcp-step-1.png) | ![YOLO MCP Step 3](./assets/yolo-mcp-step-3.png) |
| 用户发起“帮我安排一下今日任务”，Agent 先调用 `dida_sync_now`、`dida_list_tasks` 拉取任务并生成待安排列表。 | Agent 在确认前给出今晚排程方案，等待用户明确“写入滴答”。 |

| 初步排程草案 | 最终写回结果 |
|:--:|:--:|
| ![YOLO MCP Step 2](./assets/yolo-mcp-step-2.png) | ![YOLO MCP Step 4](./assets/yolo-mcp-step-4.png) |
| Agent 根据可用时间、任务时长和优先级输出初步时间块安排。 | Agent 调用 `dida_update_task` 将排程写回，并回显最终同步后的任务时段。 |

## 安装

### BRAT安装（推荐）
官方插件市场下载BRAT插件，Add beta plugin，复制当前仓库链接

### 手动安装

1. 前往 [Releases](https://github.com/CYZice/Obsidian-DidaSync/releases) 下载最新的 `main.js`, `manifest.json`, 和 `styles.css`
2. 创建文件夹：`<vault>/.obsidian/plugins/Obsidian-DidaSync/`
3. 将文件复制到该文件夹中，并在 Obsidian 设置中启用插件

## 支持

如果您觉得 Obsidian-DidaSync 对您有所帮助，请考虑为仓库点个 Star 或提交 Issue 以帮助改进！

<p align="center">

<a href="https://github.com/CYZice/Obsidian-DidaSync/issues" target="_blank">
<img src="https://img.shields.io/badge/反馈-问题-red?style=for-the-badge" alt="Issues">
</a>

</p>

## 开源协议

[MIT License](LICENSE)

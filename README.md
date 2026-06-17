<h1 align="center">DidaSync</h1>

<p align="center"><b>Sync tasks between Obsidian and Dida365 or TickTick.</b></p>

<p align="center">

A task sync plugin for Obsidian that brings your Dida365 or TickTick tasks into your notes, with timeline, time block, Pomodoro, and sidebar management views.

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

<b>English</b> | <a href="./README_ZH.md">简体中文</a>

</p>

## Highlights

### 🔄 Two-way Sync

DidaSync keeps your tasks up to date in both Obsidian and Dida365 or TickTick.

| Native Task Sync | Quick Task Creation |
|:--:|:--:|
| ![Native Task Sync](./assets/native-task-sync.png) | ![Sidebar View](./assets/sidebar-view.png) |
| Sync Dida365 or TickTick tasks directly into your notes while preserving status and details across platforms. | Create tasks from inside Obsidian with dedicated commands and modal workflows. |

### 📅 Visual Task Management

| Time Block View | Timeline View | Sidebar View |
|:--:|:--:|:--:|
| ![Time Block View](./assets/time-block-view.png) | ![Timeline View](./assets/timeline-view.png) | ![Sidebar View](./assets/sidebar-view.png) |
| Visualize your day with a calendar-style time block view. | Track progress and upcoming deadlines in a vertical timeline. | Manage your full Dida365 or TickTick task list from the Obsidian sidebar. |

### 🍅 Pomodoro + 📁 Project Catalog

| Pomodoro View | Project Catalog |
|:--:|:--:|
| ![Pomodoro View](./assets/番茄钟.png) | ![Project View](./assets/project.png) |
| Focus on scheduled work with a Pomodoro-oriented task view, timer, and focus tracking. | Create, rename, delete, and organize projects with custom icons. |

### 🤖 MCP / AI Plugin Integration

DidaSync can expose a local HTTP MCP server on desktop so MCP-compatible AI tools can safely interact with your tasks.

| Capability | Description |
|---------|-------------|
| Local MCP Server | Binds to `127.0.0.1`, disabled by default, and can be enabled in settings. |
| Token Authentication | Protects local task read and write operations with your configured token. |
| AI Tool Access | Supports listing, reading, searching, creating, updating, scheduling, completing, deleting, and syncing tasks, plus project access. |

### 🔐 Official OAuth 2.0 — No Password Required

DidaSync connects via the official OAuth 2.0 flow. You authorize directly on Dida365/TickTick's page — no username or password ever touches the plugin.

| OAuth Settings | Authorization Complete |
|:--:|:--:|
| ![OAuth Settings](./assets/OAuth_1.png) | ![Authenticated](./assets/OAuth_2.png) |
| Enter your Client ID and Secret, set the callback port, then click **Start Authentication**. | Once authorized, your token is stored locally and syncing begins. |

## Features

| Feature | Description | How To Use |
|---------|-------------|-------------|
| 🔄 **Two-way Sync** | Sync task status, content, and details between Obsidian and Dida365 or TickTick. | Complete OAuth setup, then sync from the sidebar or settings. |
| 🗓️ **Multiple Views** | Includes time block, timeline, sidebar task list, and Pomodoro views. | Open them from the sidebar, commands, or view entry points. |
| ⚡ **Create / Insert Tasks** | Create tasks in projects or insert and link existing Dida tasks from the editor. | Use commands, or create tasks from native Obsidian task syntax. |
| 📝 **Task Details / Checklists / Subtasks** | Edit task titles, notes, checklist items, and subtasks and sync them back. | Open task details from the task list. |
| 🔁 **Repeat Task Support** | Sync and manage complex recurring tasks from Dida365 or TickTick. | Sync normally, then view and complete recurring tasks directly. |
| 🍅 **Pomodoro View** | Focus-oriented time block workflow with timer and focus tracking. | Switch to the Pomodoro view inside the plugin. |
| ✋ **Interactive Drag Scheduling** | Drag all-day tasks in time and time block views to schedule them. | Drag tasks directly in supported views. |
| ↔️ **Cross-project Drag Move** | Move tasks between projects by dragging them in the sidebar task list. | Drag a task onto another project header or container. |
| ✅ **Completed Task View** | View completed tasks independently, filter by time range, and restore them. | Open `Completed tasks` from the task list filter menu. |
| 📋 **Drag To Markdown** | Drag tasks into the Markdown editor and insert linked checklist items. | See [Drag Tasks Into Markdown Documents](#drag-tasks-into-markdown-documents). |
| 🔗 **Markdown Back Links** | Jump from Dida links in notes back to the related task inside Obsidian. | Click the `obsidian://dida-task` link in a note. |
| 📝 **Task Note Sync** | Write tasks from a day, week, month, year, or custom date range into a note. | See [Sync Tasks To Notes](#sync-tasks-to-notes). |
| 🤖 **MCP / AI Integration** | Expose a local MCP service so AI plugins can operate on Dida tasks. | See [MCP / AI Plugin Usage](#mcp--ai-plugin-usage). |

## Quick Start

1. [Install and enable the plugin](#installation).
2. Open plugin settings and click the **Authorize** button to start the official OAuth flow — you'll be redirected to Dida365 or TickTick's authorization page where you grant permission directly, no account credentials needed.
3. Open the sidebar or use the ribbon icon to start syncing tasks.

## Common Workflows

### View And Restore Completed Tasks

1. Open the filter menu in the search box at the top of the sidebar task list.
2. Click `Completed tasks`.
3. Select the start date and end date in the modal.
4. Click `Query` to fetch completed tasks in that range.
5. Click `Restore` next to any task to mark it as incomplete again.

### Sync Tasks To Notes

1. Open **Settings -> DidaSync -> Sync Settings -> Task Note Sync Settings**.
2. Set the target block, note folder, week start day, and whether to query remote tasks before writing.
3. Open the command palette and run `Sync tasks to note`.
4. Choose a day, week, month, year, or custom date range.
5. DidaSync writes the matching tasks into the range note, or creates a fresh note when "Always create a new note" is enabled.

### Use Native Obsidian Task Syntax `- [ ]`

1. Enable **Settings -> DidaSync -> Sync Settings -> Enable Native Task Sync**.
2. Type native Obsidian task syntax such as `- [ ] ` in a Markdown document.
3. DidaSync opens an action menu when this pattern is detected.
4. Choose whether to sync the task to Dida365 or TickTick, or continue enriching it with dates and details.
5. After sync, the task line gets a Dida link appended, and later checking `- [x]` can also update the remote task status.

If you prefer a keyboard-first flow, run the `Insert/Create Dida task` command to open task suggestions and task creation.

### Drag Tasks Into Markdown Documents

You can drag tasks from the sidebar task list directly into any Obsidian editor:

1. Find the target task in the sidebar.
2. Drag it into a Markdown document.
3. DidaSync inserts a native Obsidian task line with a Dida link, for example:

```md
- [ ] Digital logic notes [🔗Dida](obsidian://dida-task?didaId=xxxx) 📅 2026-05-25
```

This lets you check the task inside the note and jump back to the linked Dida task.

## OAuth Authentication

DidaSync uses the official OAuth 2.0 flow — you authorize on Dida365/TickTick's page directly, and your token is stored locally. No username or password ever touches the plugin. By default, the callback uses `localhost` for compatibility with existing app registrations, and the local listener stays on loopback addresses only.

## OAuth Troubleshooting

OAuth authorization is supported out of the box. If authorization fails, check these items first:

1. Make sure your network connection is working.
2. If access to the Dida authorization page is unstable in your network environment, try switching your proxy or VPN state and test again.
3. Check whether local port `8080` is already in use.
4. If you changed the OAuth callback port in plugin settings, update the redirect URL in the Dida developer console as well.
5. By default, keep using `http://localhost:<port>/callback` so existing app registrations continue to work.
6. If Windows redirects back to a blank or unresponsive callback page, switch the plugin's callback mode to `127.0.0.1`, then update the Dida developer console to `http://127.0.0.1:<port>/callback`.

If port `8080` is occupied, the local OAuth callback server usually cannot start. In that case, change **Settings -> DidaSync -> OAuth Settings -> Server Port** to another available port, keep the redirect URL in sync with the mode shown in plugin settings, and retry authorization.

## MCP / AI Plugin Usage

Enable **Settings -> DidaSync -> Advanced/Reset -> MCP Service**, then add this configuration to an MCP-compatible AI plugin:

```json
{
  "transport": "http",
  "url": "http://127.0.0.1:35829/mcp",
  "headers": {
    "Authorization": "Bearer <DIDASYNC_MCP_TOKEN>"
  }
}
```

### 1.4.x MCP Tools

Version 1.4.x introduced and expanded the local HTTP MCP server. It currently exposes 12 tools for direct AI use:

| Category | Tools |
|---------|-------------|
| Read | `dida_list_tasks`, `dida_get_task`, `dida_search_tasks`, `dida_list_projects`, `dida_list_completed_tasks` |
| Write | `dida_create_task`, `dida_update_task`, `dida_schedule_tasks`, `dida_complete_task`, `dida_delete_task`, `dida_move_task` |
| Sync | `dida_sync_now` |

- `dida_list_tasks` returns incomplete tasks only.
- `dida_list_completed_tasks` returns completed tasks only and supports time-range filtering.
- `dida_move_task` is dedicated to moving tasks across projects.

### YOLO MCP Workflow Example

This flow shows how a YOLO-style agent can use DidaSync MCP to read, plan, confirm, and write back today's work:

| Step | MCP Workflow |
|---------|-------------|
| 1. Read and Sync | The agent runs `dida_sync_now`, then `dida_list_tasks`, and identifies the tasks that still need scheduling. |
| 2. Draft a Plan | Based on available time and preferred duration, the agent proposes a draft schedule instead of writing immediately. |
| 3. Confirm | After user confirmation, the agent turns the evening block into an actionable plan. |
| 4. Write Back | The agent calls `dida_update_task` repeatedly to write the confirmed schedule back to Dida365 or TickTick. |

| Read Tasks And Draft | Confirm And Write Back |
|:--:|:--:|
| ![YOLO MCP Step 1](./assets/yolo-mcp-step-1.png) | ![YOLO MCP Step 3](./assets/yolo-mcp-step-3.png) |
| The agent reads today's tasks and prepares a draft schedule. | The agent waits for explicit confirmation before writing the plan back. |

| Draft Schedule | Final Result |
|:--:|:--:|
| ![YOLO MCP Step 2](./assets/yolo-mcp-step-2.png) | ![YOLO MCP Step 4](./assets/yolo-mcp-step-4.png) |
| The agent proposes time blocks based on availability, task duration, and priority. | The agent writes the schedule back and shows the final synchronized task timing. |

## Installation

### Official Community Plugins Installation

1. Open `Settings -> Community plugins` in Obsidian.
2. Turn off `Restricted mode` if needed, then click `Browse`.
3. Search for `DidaSync`.
4. Click `Install`, then enable the plugin.

### Manual Installation

1. Download the latest `main.js`, `manifest.json`, and `styles.css` from [Releases](https://github.com/CYZice/Obsidian-DidaSync/releases).
2. Create the folder `<vault>/.obsidian/plugins/didasync/`.
3. Copy the files into that folder and enable the plugin in Obsidian settings.

## Release And Privacy Notes

- DidaSync connects via **official OAuth 2.0** — no username or password is ever required or stored by the plugin.
- The plugin makes network requests to official Dida365 or TickTick APIs to read, create, update, complete, delete, move, and sync tasks.
- The plugin does not upload telemetry or include ads.
- When MCP service is enabled, the plugin starts a local HTTP server bound to `127.0.0.1` and protects it with your configured token.
- OAuth tokens, MCP tokens, and plugin settings are stored locally using Obsidian's plugin data storage.

## Support

If DidaSync is helpful, consider starring the repository or opening an issue to help improve it.

<p align="center">

<a href="https://github.com/CYZice/Obsidian-DidaSync/issues" target="_blank">
<img src="https://img.shields.io/badge/Report-Issues-red?style=for-the-badge" alt="Issues">
</a>

</p>

## License

[MIT License](LICENSE)

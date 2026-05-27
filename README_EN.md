<h1 align="center">Didasync</h1>

<p align="center"><b>Two-way Sync Between Obsidian and TickTick/Dida365.</b></p>

<p align="center">

A powerful task synchronization plugin for Obsidian that brings your TickTick/Dida365 tasks directly into your notes with visual calendar and timeline views.

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

<a href="./README.md">简体中文</a> | <b>English</b>

</p>

## Highlights

### 🔄 Two-way Sync

Didasync ensures your tasks are always up-to-date, whether you're in Obsidian or TickTick.

| Native Task Sync | Quick Task Creation |
|:--:|:--:|
| ![Native Task Sync](./assets/native-task-sync.png) | ![Sidebar View](./assets/sidebar-view.png) |
| Sync your TickTick tasks directly into your notes, maintaining status and details across platforms | Quickly create tasks from within your Obsidian notes with dedicated modals and commands |

### 📅 Visual Task Management

| Time Block View | Timeline View | Sidebar View |
|:--:|:--:|:--:|
| ![Time Block View](./assets/time-block-view.png) | ![Timeline View](./assets/timeline-view.png) | ![Sidebar View](./assets/sidebar-view.png) |
| Visualize your day with a calendar-style time block view of your tasks | A vertical timeline to track your task progress and upcoming deadlines | Manage your entire TickTick task list directly from the Obsidian sidebar |

### 🤖 MCP / AI Plugin Integration

Didasync can expose a local HTTP MCP server on desktop, allowing MCP-compatible AI plugins to manage tasks through structured tools.

## Features

| Feature | Description |
|---------|-------------|
| 🔄 **Two-way Sync** | Synchronize task status, content, and details between Obsidian and TickTick/Dida365 |
| 🗓️ **Visual Views** | Multiple views including Time Block, Timeline, and Sidebar Task List |
| 🤖 **MCP / AI Plugin Integration** | Expose local MCP tools for listing, searching, creating, updating, completing, deleting, and syncing tasks |
| �️ **Interactive Drag & Drop Scheduling** | Time block view supports smooth drag-and-drop scheduling for all-day tasks, prevents accidental edits, and allows clicking date badges for quick calendar rescheduling |
| 🔁 **Repeat Task Support** | Perfectly syncs and manages complex repeating tasks from TickTick (supports display and checking off recurring rules) |
| �📝 **Daily Note Integration** | Automatically sync today's tasks directly into your daily notes |
| ⚡ **Quick Commands** | Add tasks to specific projects or insert task suggestions with simple hotkeys |
| 🕒 **Auto-Sync** | Configurable background synchronization to keep everything in sync |
| 🎛️ **Project Management** | View and manage tasks grouped by your TickTick/Dida365 projects |

## Quick Start

1. Open **Obsidian Settings** → **Community Plugins** → **Browse** → Search **"Didasync"**
2. Install and enable the plugin
3. Use secure and convenient OAuth authorization in the plugin settings to connect your TickTick/Dida365 account with one click (no tedious API Key configuration required)
4. Open the sidebar or use the ribbon icons to start syncing your tasks!

## MCP / AI Plugin Usage

Enable **Settings → Didasync → Advanced/Reset → MCP Service**, then add this configuration to an MCP-compatible AI plugin:

```json
{
  "transport": "http",
  "url": "http://127.0.0.1:35829/mcp",
  "headers": {
    "Authorization": "Bearer <DIDASYNC_MCP_TOKEN>"
  }
}
```

Available tools include task listing, search, creation, updates, completion, deletion, project listing, and manual sync.

## Installation

### Community Plugin Store (Recommended)

See Quick Start above.

### Manual Installation

1. Go to [Releases](https://github.com/CYZice/Obsidian-DidaSync/releases) and download the latest `main.js`, `manifest.json`, and `styles.css`
2. Create a folder: `<vault>/.obsidian/plugins/Didasync/`
3. Copy the files into that folder and enable the plugin in Obsidian Settings

## Release And Privacy Notes

- The plugin requires a user-provided TickTick/Dida365 account and OAuth authorization.
- The plugin makes network requests to TickTick/Dida365 APIs to read, create, update, complete, delete, and sync tasks.
- The plugin does not include telemetry or ads by default.
- When MCP service is enabled, the plugin starts a local HTTP server bound to `127.0.0.1` and protects it with your configured token.
- OAuth tokens, MCP tokens, and plugin settings are stored locally using Obsidian's plugin data storage.

## Support

If you find Didasync helpful, please consider starring the repository or reporting issues to help improve it!

<p align="center">

<a href="https://github.com/CYZice/Obsidian-DidaSync/issues" target="_blank">
<img src="https://img.shields.io/badge/Report-Issues-red?style=for-the-badge" alt="Issues">
</a>

</p>

## License

[MIT License](LICENSE)

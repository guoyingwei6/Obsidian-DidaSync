---
id: dida
name: Dida清单
description: 使用 DidaSync MCP 管理 TickTick/Dida365 任务与项目。涉及查任务、建任务、改任务、排期、完成、删除、移动项目、同步时优先使用这些工具。
---

# Dida清单

使用 DidaSync MCP 工具管理 TickTick/Dida365。先判断用户是在查询、规划还是修改，再选择最小必要工具；不要通过编辑本地文件代替 Dida 工具修改任务。

## 通用规则

- 修改前先定位真实任务：更新、完成、删除、移动、排期前，先拿到准确的 `id` 或 `didaId`。
- `id` 和 `didaId` 二选一即可；两者都可用时优先沿用上一步已经拿到的那个。
- 活跃任务和已完成任务分开查询：`dida_list_tasks` / `dida_search_tasks` / `dida_get_task` 只看未完成任务；查完成记录用 `dida_list_completed_tasks`。
- 日期支持两种格式：全天任务用 `YYYY-MM-DD`，定时任务用带时区的 ISO datetime，例如 `2026-05-25T09:00:00+08:00`。
- `dueDate` 不能早于 `startDate`。
- `priority` 只接受 `0`、`1`、`3`、`5`，分别表示 none / low / medium / high。
- `sync` 默认是 `true`。只有明确要先改本地缓存、不立刻推送 Dida 时才传 `false`。
- 写任务正文优先用 `content`；`desc` 只在明确需要写描述字段时再用。
- 项目操作优先使用精确 `projectId`。如果用户只给了项目名，可以先 `dida_list_projects`，再按名字解析。
- 服务端可能处于只读模式；只读时所有写操作都会失败，此时不要重试写入。

## 工具边界

- `dida_list_tasks`：列出未完成缓存任务，适合按日期、项目、优先级、是否全天、关键字做结构化筛选。
- `dida_get_task`：按 `id` / `didaId` 读取单个未完成任务详情。
- `dida_search_tasks`：按标题、`content`、`desc`、项目名全文搜索未完成任务。
- `dida_create_task`：创建新任务；支持标题、正文、描述、项目、日期、优先级、`requestId` 幂等键。
- `dida_update_task`：更新单个已有任务的字段；支持改标题、正文、描述、日期、项目、优先级，也允许显式传 `status`。
- `dida_schedule_tasks`：批量设置多个任务的 `startDate` / `dueDate` / `isAllDay`，返回 `updated` 和 `errors` 两部分结果。
- `dida_complete_task`：将单个活跃任务标记为完成；优先于 `dida_update_task` + `status=2`。
- `dida_delete_task`：删除单个任务，仅在用户明确要求删除时使用。
- `dida_move_task`：把任务移动到另一个项目，必须提供 `toProjectId`。
- `dida_sync_now`：立即执行双向同步，适合读之前先刷新、或者写之后明确要求从 Dida 拉最新状态。
- `dida_list_projects`：列出可见项目目录，用于解析 `projectId`，也可用来给用户展示项目选项。
- `dida_list_completed_tasks`：读取已完成任务，主要按完成时间区间、项目集合和文本关键字过滤。

## 推荐流程

### 查询任务

- 用户要看“今天 / 明天 / 本周 / 逾期 / 某项目 / 已安排 / 未安排”的任务时，优先用 `dida_list_tasks`。
- `dida_list_tasks` 可用参数：
  - `datePreset`：`overdue`、`today`、`tomorrow`、`this_week`、`scheduled`、`unscheduled`
  - `from` / `to`：自定义范围
  - `dateField`：`startDate`、`dueDate`、`either`
  - `projectId` / `projectName`
  - `priority`、`isAllDay`
  - `sortBy`：`date`、`priority`、`updatedAt`、`createdAt`、`title`
  - `sortDirection`：`asc` / `desc`
  - `limit`：默认 100，最大 500
- 用户只给关键词、标题片段、模糊描述时，优先用 `dida_search_tasks`。
- 搜到多个候选时先澄清，不要直接写入或完成其中之一。

### 新建任务

- 信息足够时直接调用 `dida_create_task`。
- 用户只给项目名时，先 `dida_list_projects` 解析精确项目，再创建。
- 可能发生重试或网络抖动的创建操作，优先传 `requestId`，避免重复建任务。
- 用户没有给明确日期时，不要猜测具体时间。

### 修改任务

- 先用 `dida_search_tasks`、`dida_list_tasks` 或上一轮结果定位目标，再 `dida_update_task`。
- 只传需要改的字段，不要顺手覆盖其他字段。
- 需要跨项目时优先 `dida_move_task`，不要把“移动项目”混进普通更新里。
- 若只是补排时间且涉及多个任务，优先 `dida_schedule_tasks`。

### 批量排期

- 当用户在做今日计划、时间块安排、批量补日期时，优先 `dida_schedule_tasks`。
- 每个 item 至少要有 `id` / `didaId` 之一，且必须提供 `startDate` 或 `dueDate`。
- 该工具可能部分成功；读取返回里的 `updated` 和 `errors`，不要把整批都当成失败。

### 完成与回顾

- 完成单个任务用 `dida_complete_task`。
- 查“最近完成了什么”“上周完成了哪些任务”时，用 `dida_list_completed_tasks`，不要用活跃任务接口硬拼。
- `dida_list_completed_tasks` 的 `refresh` 默认是 `true`；用户要最新完成记录时保持默认即可。
- 如果还要同时看当前待办，再额外调用 `dida_list_tasks`，不要把已完成和未完成混在一个结果里解释。

### 删除与同步

- 删除前确认目标唯一且确实是用户要删的任务。
- 用户明确要求“同步一下”“先从 Dida 拉最新数据”时，用 `dida_sync_now`。
- 刚写入后如果用户只关心本次返回结果，通常不需要额外再同步一次。

## 输出要求

- 默认返回简洁结果，不回贴完整 JSON，除非用户明确要求原始返回。
- 列表优先展示：任务名、项目、日期、优先级、状态。
- 如果是排期或批量操作，要说明成功项和失败项，不要只报总数。
- 工具失败时直接说明原因，并指出下一步可执行动作，例如“需要先确认任务 id”或“当前服务是只读模式”。

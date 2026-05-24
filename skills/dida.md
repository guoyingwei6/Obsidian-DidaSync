---
id: dida
name: Dida清单
description: 管理 TickTick/Dida365 的任务和项目。当用户指令涉及任务管理、待办清单、日程安排、截止日期、项目清单、同步滴答清单、完成或删除任务时使用此技能，并优先调用 DidaSync MCP 工具。
---

# Dida清单

使用 DidaSync MCP 工具管理 TickTick/Dida365 任务。先理解用户意图，再选择最小必要工具调用；不要用文件编辑代替 Dida 工具操作任务。

## 前置检查

1. 确认 MCP server 已配置为 `dida` 或可用的 DidaSync MCP server。
2. 如果工具不可用，提示用户在 DidaSync 设置中启用 MCP 服务，并在 YOLO 中配置：

```json
{
  "transport": "http",
  "url": "http://127.0.0.1:35829/mcp",
  "headers": {
    "Authorization": "Bearer <DIDASYNC_MCP_TOKEN>"
  }
}
```

3. 如果用户只是在询问任务内容，先读取任务；如果用户明确要求修改，再调用写工具。

## 工具选择

- 列出任务：调用 `dida_list_tasks`。
- 查看单个任务：调用 `dida_get_task`，优先使用 `didaId`，没有时使用本地 `id`。
- 搜索任务：调用 `dida_search_tasks`。
- 新建任务：调用 `dida_create_task`。
- 修改任务：调用 `dida_update_task`。
- 完成任务：调用 `dida_complete_task`。
- 删除任务：调用 `dida_delete_task`。
- 手动同步：调用 `dida_sync_now`。
- 查看项目：调用 `dida_list_projects`。

## 常见流程

### 查询任务

当用户问“今天有哪些任务”“某项目还有什么待办”“查一下 XX”：

1. 如果需要项目列表，先调用 `dida_list_projects`。
2. 调用 `dida_list_tasks` 或 `dida_search_tasks`。
3. 汇总任务标题、项目、状态、开始时间和截止时间。
4. 不要自动修改任务。

### 新建任务

当用户说“帮我添加任务”“记一个待办”“创建 XX”：

1. 从用户话语中提取 `title`。
2. 识别项目名、截止日期、开始日期、全天任务和优先级。
3. 项目不确定时先用 `dida_list_projects` 匹配；仍不确定则用默认收集箱。
4. 调用 `dida_create_task`。
5. 回复创建结果，包含任务标题、项目、日期和同步状态。

推荐参数：

```json
{
  "title": "任务标题",
  "projectId": "inbox",
  "projectName": "收集箱",
  "dueDate": "YYYY-MM-DDTHH:mm:ss+0800",
  "isAllDay": false,
  "sync": true
}
```

### 更新任务

当用户说“把 XX 改成”“调整截止时间”“移动到某项目”：

1. 先用 `dida_search_tasks` 找候选任务。
2. 如果有多个候选，向用户确认具体任务。
3. 调用 `dida_update_task`，只传需要修改的字段。
4. 回复修改前后的关键变化。

### 完成或删除任务

当用户说“完成 XX”“删掉 XX”：

1. 先用 `dida_search_tasks` 找任务。
2. 如果匹配多个任务，先确认。
3. 完成任务调用 `dida_complete_task`。
4. 删除任务调用 `dida_delete_task`，删除前必须确认用户明确表达删除意图。

### 同步

当用户说“同步滴答”“刷新任务”“从滴答拉最新”：

1. 调用 `dida_sync_now`。
2. 同步后如需展示结果，再调用 `dida_list_tasks`。

## 日期处理

- 用户说“今天/明天/下周”等相对日期时，按当前日期换算成具体日期。
- 有具体时间时使用带时区的 ISO 字符串，例如 `2026-05-24T18:00:00+0800`。
- 只有日期、没有时间时设置 `isAllDay: true`。
- 不确定日期时不要猜测，先询问用户。

## 输出要求

- 任务操作后简短确认，不输出完整 JSON，除非用户要求。
- 多任务列表优先用简洁清单：任务名、项目、日期、状态。
- 工具返回错误时，说明失败原因，并给出可执行修复建议，例如检查 DidaSync MCP 服务、token、OAuth 登录或网络。

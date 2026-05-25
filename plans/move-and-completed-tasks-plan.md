# 任务移动与已完成任务功能开发计划

## 目标

实现以下两个功能：

1. 将任务移动到其他项目清单
2. 获取已完成任务

本计划聚焦于当前仓库的插件架构，优先复用已有 `DidaApiClient`、`SyncManager`、`TaskView`、`McpServerManager` 和任务类型定义。

---

## 一、功能范围

### 1. 任务移动到其他项目

目标能力：

- 在插件内将单个任务移动到另一个滴答项目
- 保持本地缓存与远端状态一致
- 在 MCP 工具层支持任务移动

本阶段先做：

- 单任务移动
- 从当前项目移动到任意目标项目
- UI 操作入口
- API 成功后本地立即更新

可后续扩展：

- 批量移动
- 拖拽跨项目移动
- 移动历史提示与撤销

### 2. 获取已完成任务

目标能力：

- 从滴答 OpenAPI 拉取指定时间范围内的已完成任务
- 在 Obsidian 中查看已完成任务
- 支持按项目、日期范围筛选
- 为后续“已完成任务详情查看/恢复/编辑”打基础

本阶段先做：

- 基于时间范围主动拉取 completed tasks
- 在 UI 中单独展示已完成任务
- 不混入现有默认未完成任务同步主流程

可后续扩展：

- 已完成任务搜索
- 已完成任务恢复为未完成
- 已完成任务详情编辑

---

## 二、官方 API 依据

### 1. 移动任务

接口：

```http
POST /open/v1/task/move
```

请求体示例：

```json
[
  {
    "fromProjectId": "source-project-id",
    "toProjectId": "target-project-id",
    "taskId": "task-id"
  }
]
```

### 2. 获取已完成任务

接口：

```http
POST /open/v1/task/completed
```

请求体示例：

```json
{
  "projectIds": ["project-id"],
  "startDate": "2026-03-01T00:00:00+0000",
  "endDate": "2026-03-05T23:59:59+0000"
}
```

---

## 三、代码影响面

### 核心文件

- `src/api/DidaApiClient.ts`
- `src/managers/SyncManager.ts`
- `src/views/TaskView.ts`
- `src/managers/McpServerManager.ts`
- `src/types.ts`

### 可能新增文件

- 已完成任务视图相关 helper
- 任务移动弹窗或项目选择弹窗

---

## 四、任务一：移动任务到其他项目

### 阶段 1：API 封装

在 `src/api/DidaApiClient.ts` 增加：

- `moveTask(fromProjectId: string, toProjectId: string, taskId: string)`
- 可选：`moveTasks(operations: Array<{ fromProjectId: string; toProjectId: string; taskId: string }>)`

要求：

- 直接调用 `/open/v1/task/move`
- 正确处理数组请求体
- 保留错误响应文本，便于 UI 提示

### 阶段 2：本地状态更新

在 `SyncManager` 或主插件层增加统一逻辑：

- 调用远端移动成功后，立即更新本地任务的 `projectId`
- 同步更新 `projectName`、`projectColor`、`projectClosed`、`projectViewMode`、`projectKind`、`projectPermission`
- 更新 `updatedAt`
- 必要时刷新任务列表与项目分组

注意事项：

- 子任务是否允许独立移动，需要先按滴答实际行为处理
- 如果任务当前在 `inbox`，源项目应传 `inbox`
- 如果目标项目是本地临时项目，必须先阻止或先同步项目到远端

### 阶段 3：UI 入口

建议入口：

- 任务右键菜单 / 更多菜单新增“移动到项目”
- 弹出项目选择器
- 过滤掉当前项目

交互要求：

- 选择目标项目后显示 loading
- 成功后提示“已移动到 xxx”
- 失败时保留原任务位置并提示错误

### 阶段 4：MCP 工具支持

在 `McpServerManager` 增加：

- `dida_move_task`

建议参数：

- `taskId`
- `fromProjectId`
- `toProjectId`

返回：

- 任务 id
- 目标项目 id
- 目标项目名

### 阶段 5：验证

验收用例：

1. 普通任务从项目 A 移动到项目 B
2. 收集箱任务移动到普通项目
3. 普通项目任务移动到收集箱
4. 移动后重新同步，任务仍在目标项目下
5. 目标项目不存在时给出明确错误

---

## 五、任务二：获取已完成任务

### 阶段 1：API 封装

在 `src/api/DidaApiClient.ts` 增加：

- `getCompletedTasks(options?: { projectIds?: string[]; startDate?: string; endDate?: string })`

要求：

- 调用 `/open/v1/task/completed`
- 支持空筛选和部分筛选
- 返回标准任务数组

可一起补充：

- `filterTasks(...)`

因为后续 active/completed 统一检索时可能会用到 `/open/v1/task/filter`

### 阶段 2：数据模型与缓存策略

当前插件默认任务缓存偏向“未完成任务主集”。本功能不要直接改坏现有同步链路。

建议方案：

- 新增独立的 completed tasks 缓存
- 不默认长期保存在主 `tasks` 列表里
- 采用“按需加载 + 可选短期缓存”

建议新增设置字段：

- `completedTasks?: DidaTask[]`
- `completedTasksLastFetchedAt?: string`
- `completedTasksQuery?: { projectIds?: string[]; startDate?: string; endDate?: string }`

这样可以避免：

- 已完成任务污染现有未完成任务视图
- 主同步逻辑误删或误判 completed 项

### 阶段 3：查询入口

建议先做一个轻量入口：

- 在任务视图顶部增加“已完成”筛选/标签页
- 或增加命令：`获取已完成任务`

最小可行版本：

- 用户选择时间范围
- 可选选择项目
- 发起查询并展示结果

默认策略建议：

- 默认查询最近 7 天已完成任务
- 时间全部使用本地时区格式化为 OpenAPI 所需格式

### 阶段 4：展示层

已完成任务展示建议：

- 标题
- 所属项目
- 完成时间
- 原截止时间
- 标签/优先级可选显示

交互建议：

- 点击仍可打开任务详情
- 与未完成任务在视觉上明显区分
- 不默认参与今日排程、拖拽排期、番茄视图

### 阶段 5：同步边界

明确边界：

- `syncFromDidaList()` 继续负责未完成主任务同步
- 已完成任务通过单独查询入口获取
- 不在自动同步中默认全量拉取 completed tasks

原因：

- 已完成任务量可能很大
- OpenAPI completed 查询天然依赖时间范围
- 自动同步全量拉取会增加复杂度和请求成本

### 阶段 6：MCP 工具支持

在 `McpServerManager` 增加：

- `dida_list_completed_tasks`

建议参数：

- `projectIds`
- `startDate`
- `endDate`

返回字段：

- `id`
- `title`
- `projectId`
- `projectName`
- `completedTime`
- `dueDate`
- `status`

### 阶段 7：验证

验收用例：

1. 获取最近 7 天全部已完成任务
2. 按单项目获取已完成任务
3. 空结果时正常提示
4. completedTime 正确显示
5. 查询结果不污染当前未完成任务列表

---

## 六、推荐开发顺序

### 第一阶段

1. 封装 `moveTask`
2. 封装 `getCompletedTasks`
3. 补充类型定义

### 第二阶段

1. 完成任务移动本地状态更新
2. 做任务移动 UI
3. 增加 completed 查询命令入口

### 第三阶段

1. 做已完成任务展示面板
2. 增加 MCP 工具
3. 补测试与回归验证

---

## 七、风险与注意事项

### 1. 已完成任务不要直接并入主同步列表

否则容易影响：

- 当前项目视图统计
- 时间线视图
- 原生任务双向同步
- 自动同步一致性判断

### 2. 任务移动后要立即刷新项目元数据

如果只改 `projectId` 不改展示字段，会出现 UI 分组正确但展示名称或颜色错误。

### 3. inbox 要作为特殊项目处理

仓库里已经存在对 `inbox` 的特殊判断，新增逻辑必须保持一致。

### 4. 已完成任务查询建议限制默认时间范围

避免首次查询直接拉过大数据集。

---

## 八、建议的最小交付版本

### v1

- 支持单任务移动到其他项目
- 支持查询最近 7 天已完成任务
- 支持在独立列表查看已完成任务

### v2

- 支持按项目筛选已完成任务
- 支持 MCP 调用移动任务和查询已完成任务

### v3

- 支持已完成任务详情查看与恢复
- 支持批量移动任务

---

## 九、完成定义

满足以下条件即可视为本轮功能完成：

1. 用户可在插件界面把任务移动到其他项目
2. 移动结果能正确同步到滴答与本地视图
3. 用户可查询最近一段时间的已完成任务
4. 已完成任务展示不破坏当前未完成任务同步逻辑
5. MCP 层至少支持读取 completed tasks，最好同时支持 move task

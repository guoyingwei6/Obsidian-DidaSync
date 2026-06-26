#!/usr/bin/env node

const fs = require("fs");

const DEFAULT_DATA_PATH = "/home/yunzechen/Obsidian_Backup/ABCDE/.obsidian/plugins/didasync/data.json";
const API_BASE = "https://api.dida365.com/open/v1";

function parseArgs(argv) {
  const args = {
    data: DEFAULT_DATA_PATH,
    task: "",
    project: "",
    parent: "",
    keepCleared: false
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--keep-cleared") {
      args.keepCleared = true;
      continue;
    }
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${arg}`);
    }
    i++;
    if (!(key in args)) throw new Error(`Unknown option: ${arg}`);
    args[key] = value;
  }
  return args;
}

function readSettings(dataPath) {
  const settings = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  if (!settings.accessToken) throw new Error(`No accessToken found in ${dataPath}`);
  if (!Array.isArray(settings.tasks)) throw new Error(`No tasks array found in ${dataPath}`);
  return settings;
}

function pickTask(settings, args) {
  if (args.task) {
    const task = settings.tasks.find((item) => item.didaId === args.task || item.id === args.task);
    if (!task) throw new Error(`Task not found in data.json: ${args.task}`);
    return task;
  }
  const task = settings.tasks.find((item) => item.didaId && item.projectId && item.parentId);
  if (!task) {
    throw new Error("No synced task with parentId found. Pass --task, --project and --parent explicitly.");
  }
  return task;
}

function taskPayload(remoteTask, patch) {
  const payload = {
    id: remoteTask.id,
    projectId: remoteTask.projectId,
    title: remoteTask.title || "",
    content: remoteTask.content || "",
    desc: remoteTask.desc || "",
    status: remoteTask.status === 2 ? undefined : (remoteTask.status ?? 0),
    isAllDay: remoteTask.isAllDay,
    priority: remoteTask.priority,
    sortOrder: remoteTask.sortOrder,
    dueDate: remoteTask.dueDate,
    startDate: remoteTask.startDate,
    timeZone: remoteTask.timeZone,
    reminders: remoteTask.reminders,
    tags: remoteTask.tags,
    repeatFlag: remoteTask.repeatFlag,
    items: remoteTask.items
  };

  for (const key of Object.keys(payload)) {
    if (payload[key] === undefined) delete payload[key];
  }
  return { ...payload, ...patch };
}

async function requestJson(token, url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (_error) {
      data = text;
    }
  }
  return { ok: res.ok, status: res.status, data, text };
}

async function getTask(token, projectId, taskId) {
  const result = await requestJson(token, `${API_BASE}/project/${projectId}/task/${taskId}`);
  if (!result.ok) {
    throw new Error(`GET task failed: HTTP ${result.status} ${result.text || ""}`);
  }
  return result.data;
}

async function updateTask(token, remoteTask, patch) {
  const payload = taskPayload(remoteTask, patch);
  const result = await requestJson(token, `${API_BASE}/task/${remoteTask.id}`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return { ...result, payload };
}

async function restoreParent(token, remoteTask, parentId) {
  const current = await getTask(token, remoteTask.projectId, remoteTask.id);
  const result = await updateTask(token, current, { parentId });
  const after = await getTask(token, remoteTask.projectId, remoteTask.id);
  return { result, after };
}

async function run() {
  const args = parseArgs(process.argv);
  const settings = readSettings(args.data);
  const localTask = pickTask(settings, args);
  const taskId = localTask.didaId || localTask.id;
  const projectId = args.project || localTask.projectId;
  const originalParentId = args.parent || localTask.parentId;
  if (!taskId || !projectId || !originalParentId) {
    throw new Error("Need task id, project id and original parent id.");
  }

  console.log(`Data: ${args.data}`);
  console.log(`Task: ${taskId}`);
  console.log(`Project: ${projectId}`);
  console.log(`Original parent: ${originalParentId}`);

  const baseline = await getTask(settings.accessToken, projectId, taskId);
  console.log(`Remote before: parentId=${JSON.stringify(baseline.parentId ?? null)}`);

  const cases = [
    { name: "parentId:null", patch: { parentId: null } },
    { name: "parentId:\"\"", patch: { parentId: "" } },
    { name: "omit parentId control", patch: {}, omitParent: true }
  ];

  const results = [];
  for (const testCase of cases) {
    await restoreParent(settings.accessToken, baseline, originalParentId);
    const before = await getTask(settings.accessToken, projectId, taskId);
    const patch = testCase.omitParent ? {} : testCase.patch;
    const update = await updateTask(settings.accessToken, before, patch);
    const after = await getTask(settings.accessToken, projectId, taskId);
    const cleared = after.parentId === undefined || after.parentId === null || after.parentId === "";
    results.push({
      case: testCase.name,
      http: update.status,
      ok: update.ok,
      sentParentId: Object.prototype.hasOwnProperty.call(update.payload, "parentId") ? update.payload.parentId : "(omitted)",
      returnedParentId: update.data && typeof update.data === "object" ? (update.data.parentId ?? null) : null,
      verifiedParentId: after.parentId ?? null,
      cleared
    });
    console.log(JSON.stringify(results[results.length - 1], null, 2));
  }

  if (!args.keepCleared) {
    const restored = await restoreParent(settings.accessToken, baseline, originalParentId);
    console.log(`Restored parentId=${JSON.stringify(restored.after.parentId ?? null)}`);
  }

  const winners = results.filter((item) => item.cleared).map((item) => item.case);
  console.log(`Clearing variants: ${winners.length ? winners.join(", ") : "none"}`);
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});

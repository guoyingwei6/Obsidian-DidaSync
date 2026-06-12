export interface DidaSubTask {
    id: string;
    title: string;
    status: number; // 0: Normal, 1: Completed (Checklist items use 1 for completed)
    sortOrder?: number;
    startDate?: string;
    isAllDay?: boolean;
    timeZone?: string;
    completedTime?: string | number; // API returns string or number
}

export interface DidaTask {
    id: string;
    title: string;
    content: string;
    completed?: boolean;
    isFloating?: boolean;
    desc?: string;
    isAllDay?: boolean;
    startDate?: string; // ISO String
    dueDate?: string; // ISO String
    timeZone?: string;
    reminders?: any[];
    repeatFlag?: string; // RRULE string
    priority?: number;
    status: number; // 0: Normal, 2: Completed
    completedTime?: string | null;
    projectId: string; // "inbox" or specific project ID
    projectName?: string; // Enriched field for display
    sortOrder?: number;
    items?: DidaSubTask[];
    kind?: "TEXT" | "CHECKLIST";

    // Project related fields (enriched during sync)
    projectColor?: string;
    projectClosed?: boolean;
    projectViewMode?: string;
    projectKind?: string;
    projectPermission?: string;

    // Local fields
    didaId?: string; // usually same as id
    parentId?: string | null; // For subtasks/items if flattened
    createdAt?: string;
    updatedAt?: string;
    etag?: string;

    // Native Sync fields
    hasLink?: boolean; // If linked to a markdown file
    linkPath?: string;
}

export interface CompletedTasksQuery {
    projectIds?: string[];
    startDate?: string;
    endDate?: string;
}

export interface DidaProject {
    id: string;
    name: string;
    color?: string;
    sortOrder?: number;
    closed?: boolean;
    groupId?: string;
    viewMode?: string;
    permission?: string;
    kind?: string;
}

export interface ProjectCatalogEntry {
    id: string;
    name: string;
    isArchived: boolean;
    isLocalOnly: boolean;
}

export interface PomodoroSettings {
    focusMinutes: number;
    shortBreakMinutes: number;
    longBreakMinutes: number;
    focusPresetMinutes: number[];
    longBreakPresetMinutes: number[];
    completionHistory: Record<string, { sessions: number; minutes: number }>;
    selectedSound: string;
    totalFocusSessions: number;
    totalFocusMinutes: number;
}

export interface DidaSyncSettings {
    clientId: string;
    clientSecret: string;
    accessToken: string;
    refreshToken: string;

    tasks: DidaTask[];
    projects: DidaProject[]; // Cache of projects

    projectCatalog: ProjectCatalogEntry[];
    projectIcons: { [key: string]: string };

    autoSync: boolean;
    syncInterval: number; // in minutes
    serverPort: number;
    enableMcpServer: boolean;
    mcpPort: number;
    mcpToken: string;
    mcpReadOnly: boolean;
    mcpSkillNotePath: string;
    showArchivedProjects: boolean;

    autoCleanCompletedTasks: boolean;
    autoCleanInterval: number; // in months

    enableNativeTaskSync: boolean;

    // Daily Sync Settings
    dailySyncTargetBlockHeader: string;
    taskNoteSyncFolder: string;
    taskNoteSyncFileNamePattern: string;
    taskNoteSyncCreateNewFile: boolean;
    taskNoteSyncWeekStart: "monday" | "sunday";
    taskNoteSyncUseRemoteQuery: boolean;

    // UI Settings
    projectCollapsedStates: { [key: string]: boolean };
    projectOrder: string[]; // Array of project names/ids to store order
    defaultViewMode: "task" | "timeblock";
    timeBlockHourHeight: number;
    timeBlockStartHour: number;

    // Pomodoro settings
    pomodoroSettings: PomodoroSettings;

    // Reverse completion verification metadata
    reverseCompletionMeta: {
        [didaId: string]: {
            missingStreak: number;
            lastSeenAt: string | null;
            lastMissingAt: string | null;
        }
    };

    // Sync consistency metadata
    syncConsistencyMeta: {
        [didaId: string]: {
            title?: string;
            date?: string;
        }
    };

    completedTasks: DidaTask[];
    completedTasksLastFetchedAt: string;
    completedTasksQuery: CompletedTasksQuery;
}

export const DEFAULT_SETTINGS: DidaSyncSettings = {
    clientId: "",
    clientSecret: "",
    accessToken: "",
    refreshToken: "",
    tasks: [],
    projects: [],
    projectCatalog: [],
    projectIcons: {},
    autoSync: true,
    syncInterval: 5,
    serverPort: 8080,
    enableMcpServer: false,
    mcpPort: 35829,
    mcpToken: "",
    mcpReadOnly: false,
    mcpSkillNotePath: "dida/SKILL.md",
    showArchivedProjects: false,
    autoCleanCompletedTasks: false,
    autoCleanInterval: 1,
    enableNativeTaskSync: true,
    dailySyncTargetBlockHeader: "> [!todo]",
    taskNoteSyncFolder: "DidaSync",
    taskNoteSyncFileNamePattern: "",
    taskNoteSyncCreateNewFile: false,
    taskNoteSyncWeekStart: "monday",
    taskNoteSyncUseRemoteQuery: false,
    projectCollapsedStates: {},
    projectOrder: [],
    defaultViewMode: "task",
    timeBlockHourHeight: 80,
    timeBlockStartHour: 0,
    pomodoroSettings: {
        focusMinutes: 25,
        shortBreakMinutes: 5,
        longBreakMinutes: 15,
        focusPresetMinutes: [15, 25, 40, 60],
        longBreakPresetMinutes: [15, 20, 25, 30],
        completionHistory: {},
        selectedSound: "none",
        totalFocusSessions: 0,
        totalFocusMinutes: 0
    },
    reverseCompletionMeta: {},
    syncConsistencyMeta: {},
    completedTasks: [],
    completedTasksLastFetchedAt: "",
    completedTasksQuery: {}
};

export const OAUTH_CONFIG = {
    authUrl: "https://dida365.com/oauth/authorize",
    tokenUrl: "https://dida365.com/oauth/token",
    scope: "tasks:write tasks:read"
};

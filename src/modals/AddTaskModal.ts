import { Modal, App, Notice } from 'obsidian';
import { TaskScheduleInput } from '../types';
import { CompactRepeatSettings } from './CompactRepeatSettings';

export interface TaskCreateProject {
    id: string;
    name: string;
}

interface AddTaskModalOptions {
    projects: TaskCreateProject[];
    defaultProjectId?: string;
    lockProject?: boolean;
    defaultDate?: Date;
}

export class AddTaskModal extends Modal {
    onSubmit: (title: string, project: TaskCreateProject, schedule: TaskScheduleInput) => void | Promise<void>;
    options: AddTaskModalOptions;
    selectedDate: Date;
    displayYear: number;
    displayMonth: number;
    isAllDay: boolean = true;
    startMinutes: number;
    endMinutes: number;
    repeatFlag: string | null = null;

    constructor(app: App, onSubmit: (title: string, project: TaskCreateProject, schedule: TaskScheduleInput) => void | Promise<void>, options: AddTaskModalOptions) {
        super(app);
        this.onSubmit = onSubmit;
        this.options = options;
        this.selectedDate = new Date(options.defaultDate || new Date());
        this.selectedDate.setHours(0, 0, 0, 0);
        this.displayYear = this.selectedDate.getFullYear();
        this.displayMonth = this.selectedDate.getMonth();
        const now = new Date();
        this.startMinutes = Math.min(23 * 60 + 45, Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15);
        this.endMinutes = Math.min(24 * 60, this.startMinutes + 60);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("dida-task-create-modal");
        contentEl.createEl("h2", { text: "添加任务" });

        const input = contentEl.createEl("input", {
            type: "text",
            placeholder: "输入任务标题…",
            cls: "dida-task-create-title"
        });

        const projectRow = contentEl.createDiv("dida-task-create-project");
        projectRow.createEl("label", { text: "项目" });
        const projectSelect = projectRow.createEl("select");
        this.options.projects.forEach(project => {
            projectSelect.createEl("option", { text: project.name, value: project.id });
        });
        projectSelect.value = this.options.defaultProjectId || this.options.projects[0]?.id || "inbox";
        if (this.options.lockProject) projectSelect.disabled = true;

        const scheduleSection = contentEl.createDiv("dida-task-create-schedule");
        const modeSwitch = scheduleSection.createDiv("dida-schedule-mode-switch");
        const allDayBtn = modeSwitch.createEl("button", { text: "全天", cls: "is-active" });
        const timedBtn = modeSwitch.createEl("button", { text: "时间段" });
        const timeRow = scheduleSection.createDiv("dida-task-create-time-row");
        timeRow.setCssStyles({ display: "none" });

        const createTimeSelect = (value: number, allowEndOfDay: boolean) => {
            const select = timeRow.createEl("select", { cls: "dida-task-create-time-select" });
            const limit = allowEndOfDay ? 1440 : 1425;
            for (let minutes = 0; minutes <= limit; minutes += 15) {
                const hour = Math.floor(minutes / 60);
                const minute = minutes % 60;
                select.createEl("option", {
                    value: String(minutes),
                    text: minutes === 1440 ? "24:00" : `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
                });
            }
            select.value = String(value);
            return select;
        };
        timeRow.createEl("span", { text: "开始" });
        const startSelect = createTimeSelect(this.startMinutes, false);
        timeRow.createEl("span", { text: "至" });
        const endSelect = createTimeSelect(this.endMinutes, true);
        startSelect.onchange = () => {
            this.startMinutes = Number(startSelect.value);
            if (this.endMinutes <= this.startMinutes) {
                this.endMinutes = Math.min(1440, this.startMinutes + 60);
                endSelect.value = String(this.endMinutes);
            }
        };
        endSelect.onchange = () => {
            this.endMinutes = Number(endSelect.value);
            if (this.endMinutes <= this.startMinutes) {
                this.endMinutes = Math.min(1440, this.startMinutes + 15);
                endSelect.value = String(this.endMinutes);
            }
        };

        const setMode = (allDay: boolean) => {
            this.isAllDay = allDay;
            allDayBtn.toggleClass("is-active", allDay);
            timedBtn.toggleClass("is-active", !allDay);
            timeRow.setCssStyles({ display: allDay ? "none" : "flex" });
        };
        allDayBtn.onclick = () => setMode(true);
        timedBtn.onclick = () => setMode(false);

        const calendar = scheduleSection.createDiv("dida-task-create-calendar");
        const renderCalendar = () => {
            calendar.empty();
            const nav = calendar.createDiv("dida-calendar-nav");
            nav.createEl("button", { text: "‹", attr: { "aria-label": "上个月" } }).onclick = () => {
                this.displayMonth--;
                if (this.displayMonth < 0) { this.displayMonth = 11; this.displayYear--; }
                renderCalendar();
            };
            nav.createEl("span", { text: `${this.displayYear}年${this.displayMonth + 1}月`, cls: "dida-calendar-month-label" });
            nav.createEl("button", { text: "›", attr: { "aria-label": "下个月" } }).onclick = () => {
                this.displayMonth++;
                if (this.displayMonth > 11) { this.displayMonth = 0; this.displayYear++; }
                renderCalendar();
            };
            const week = calendar.createDiv("dida-calendar-week-header");
            ["日", "一", "二", "三", "四", "五", "六"].forEach(day => week.createDiv({ text: day, cls: "dida-calendar-week-day" }));
            const grid = calendar.createDiv("dida-calendar-grid");
            const first = new Date(this.displayYear, this.displayMonth, 1);
            const cursor = new Date(first);
            cursor.setDate(1 - first.getDay());
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            for (let index = 0; index < 42; index++) {
                const date = new Date(cursor);
                date.setDate(cursor.getDate() + index);
                date.setHours(0, 0, 0, 0);
                const day = grid.createDiv({ text: String(date.getDate()), cls: "dida-calendar-day" });
                if (date.getMonth() !== this.displayMonth) day.addClass("other-month");
                if (date.getTime() === today.getTime()) day.addClass("today");
                if (date.getTime() === this.selectedDate.getTime()) day.addClass("selected");
                day.onclick = () => { this.selectedDate = date; renderCalendar(); };
            }
        };
        renderCalendar();

        const auxiliaryRow = scheduleSection.createDiv("dida-task-create-auxiliary");
        auxiliaryRow.createEl("button", { text: "今天" }).onclick = () => {
            this.selectedDate = new Date();
            this.selectedDate.setHours(0, 0, 0, 0);
            this.displayYear = this.selectedDate.getFullYear();
            this.displayMonth = this.selectedDate.getMonth();
            renderCalendar();
        };
        const repeatBtn = auxiliaryRow.createEl("button", { text: "重复设置" });
        repeatBtn.onclick = () => new CompactRepeatSettings(this.app, rule => {
            this.repeatFlag = rule;
            repeatBtn.textContent = rule ? "已设置重复" : "重复设置";
        }, repeatBtn).show();

        const btnContainer = contentEl.createDiv("dida-modal-actions");
        
        btnContainer.createEl("button", { text: "取消" }).onclick = () => this.close();
        
        const submitBtn = btnContainer.createEl("button", {
            text: "添加",
            cls: "mod-cta"
        });
        submitBtn.onclick = async () => {
            const val = input.value.trim();
            if (!val) return void new Notice("请输入任务标题");
            const project = this.options.projects.find(item => item.id === projectSelect.value) || this.options.projects[0];
            if (!project) return void new Notice("没有可用项目");
            const start = new Date(this.selectedDate);
            const end = new Date(this.selectedDate);
            if (this.isAllDay) {
                start.setHours(0, 0, 0, 0);
                end.setHours(0, 0, 0, 0);
            } else {
                start.setMinutes(this.startMinutes, 0, 0);
                end.setMinutes(this.endMinutes, 0, 0);
            }
            submitBtn.disabled = true;
            try {
                await this.onSubmit(val, project, {
                    startDate: start.toISOString(),
                    dueDate: end.toISOString(),
                    isAllDay: this.isAllDay,
                    repeatFlag: this.repeatFlag
                });
                this.close();
            } finally {
                submitBtn.disabled = false;
            }
        };

        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") submitBtn.click();
        });

        setTimeout(() => input.focus(), 100);
    }

    onClose() {
        this.contentEl.empty();
    }
}

import { App } from "obsidian";
import DidaSyncPlugin from "../main";
import { ScopedPopup, TaskSchedulePicker } from "./TaskSchedulePicker";

export class DatePickerModal {
    app: App;
    currentDate: string | Date | null;
    onDateSelect: (date: Date | null, isAllDay: boolean, endDate?: Date, repeatFlag?: string | null) => void | Promise<void>;
    triggerElement: HTMLElement | null;
    plugin: DidaSyncPlugin | null;
    taskIndex: number | null;
    dateOnly: boolean;
    popup: ScopedPopup;

    constructor(
        app: App,
        currentDate: string | Date | null,
        onDateSelect: (date: Date | null, isAllDay: boolean, endDate?: Date, repeatFlag?: string | null) => void | Promise<void>,
        triggerElement: HTMLElement | null,
        plugin: DidaSyncPlugin | null = null,
        taskIndex: number | null = null,
        options: { dateOnly?: boolean; scopeElement?: HTMLElement | null } = {}
    ) {
        this.app = app;
        this.currentDate = currentDate;
        this.onDateSelect = onDateSelect;
        this.triggerElement = triggerElement;
        this.plugin = plugin;
        this.taskIndex = taskIndex;
        this.dateOnly = options.dateOnly === true;
        this.popup = new ScopedPopup(triggerElement, options.scopeElement || null);
    }

    open(): void {
        const task = this.plugin && this.taskIndex !== null ? this.plugin.settings.tasks[this.taskIndex] : null;
        const hasTaskSchedule = !!(task?.startDate || task?.dueDate);
        this.popup.open(container => {
            const picker = new TaskSchedulePicker(this.app, {
                startDate: task?.startDate || this.currentDate,
                dueDate: task?.dueDate || null,
                isAllDay: this.dateOnly ? true : (hasTaskSchedule && typeof task?.isAllDay === "boolean" ? task.isAllDay : true),
                repeatFlag: task?.repeatFlag || null,
                defaultDate: this.currentDate ? undefined : new Date(),
                dateOnly: this.dateOnly
            });
            picker.render(container);
            picker.renderActions(container, {
                primaryLabel: "确认",
                onCancel: () => this.close(),
                onSubmit: async value => {
                    await this.onDateSelect(value.startDate, value.isAllDay, value.dueDate || undefined, value.repeatFlag);
                    this.close();
                }
            });
        });
    }

    close(): void {
        this.popup.close();
    }
}

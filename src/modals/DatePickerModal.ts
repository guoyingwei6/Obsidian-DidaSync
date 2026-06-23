import { App } from "obsidian";
import DidaSyncPlugin from "../main";
import { roundDateUpToStep } from "../timeGrid";
import { CompactRepeatSettings } from "./CompactRepeatSettings";

export class DatePickerModal {
    app: App;
    currentDate: Date | null;
    onDateSelect: (date: Date | null, isAllDay: boolean, endDate?: Date) => void;
    triggerElement: HTMLElement | null;
    selectedDate: Date | null;
    container: HTMLElement | null = null;
    overlay: HTMLElement | null = null;
    plugin: DidaSyncPlugin | null;
    taskIndex: number | null;
    isAllDay: boolean;
    selectedHour: number;
    selectedMinute: number;
    endHour: number;
    endMinute: number;
    displayYear: number;
    displayMonth: number;
    closeDropdownsHandler: ((e: MouseEvent) => void) | null = null;
    escapeHandler: ((e: KeyboardEvent) => void) | null = null;
    repeatFlag?: string | null;
    dateOnly: boolean;

    constructor(app: App, currentDate: string | null, onDateSelect: (date: Date | null, isAllDay: boolean, endDate?: Date) => void, triggerElement: HTMLElement | null, plugin: DidaSyncPlugin | null = null, taskIndex: number | null = null, options: { dateOnly?: boolean } = {}) {
        this.app = app;
        this.currentDate = currentDate ? new Date(currentDate) : null;
        this.onDateSelect = onDateSelect;
        this.triggerElement = triggerElement;
        this.selectedDate = this.currentDate;
        this.plugin = plugin;
        this.taskIndex = taskIndex;
        this.dateOnly = options.dateOnly === true;

        if (this.selectedDate) {
            this.isAllDay = 0 === this.selectedDate.getHours() && 0 === this.selectedDate.getMinutes();
            this.selectedHour = this.selectedDate.getHours();
            this.selectedMinute = this.selectedDate.getMinutes();
        } else {
            this.isAllDay = false;
            const now = new Date();
            const roundedStart = roundDateUpToStep(now);
            this.selectedHour = roundedStart.getHours();
            this.selectedMinute = roundedStart.getMinutes();
            if (roundedStart.getDate() !== now.getDate() || roundedStart.getMonth() !== now.getMonth() || roundedStart.getFullYear() !== now.getFullYear()) {
                this.selectedDate = roundedStart;
            }
        }

        if (this.plugin && null != this.taskIndex) {
            const task = this.plugin.settings.tasks[this.taskIndex];
            if (task) {
                if (typeof task.isAllDay === "boolean") this.isAllDay = task.isAllDay;
                const dateStr = task.startDate || task.dueDate;
                if (dateStr) {
                    const date = new Date(dateStr);
                    if (!isNaN(date.getTime())) {
                        this.selectedDate = date;
                        this.selectedHour = date.getHours();
                        this.selectedMinute = date.getMinutes();
                    }
                }
            }
        }

        this.displayYear = (this.selectedDate || new Date()).getFullYear();
        this.displayMonth = (this.selectedDate || new Date()).getMonth();

        // End time defaults
        const endTime = roundDateUpToStep(new Date(Date.now() + 3600000));
        this.endHour = endTime.getHours();
        this.endMinute = endTime.getMinutes();

        if (this.plugin && null !== this.taskIndex) {
            const task = this.plugin.settings.tasks[this.taskIndex];
            if (task && task.dueDate) {
                const dueDate = new Date(task.dueDate);
                if (!isNaN(dueDate.getTime())) {
                    this.endHour = dueDate.getHours();
                    this.endMinute = dueDate.getMinutes();
                }
            }
        }
    }

    open() {
        this.createOverlay();
        this.createContainer();
        this.positionContainer();
        this.renderContent();
        this.setupEventListeners();
    }

    createOverlay() {
        this.overlay = document.createElement("div");
        this.overlay.className = "dida-calendar-overlay";
        document.body.appendChild(this.overlay);
    }

    createContainer() {
        this.container = document.createElement("div");
        this.container.className = "dida-calendar-popup";
        document.body.appendChild(this.container);
    }

    positionContainer() {
        if (this.triggerElement && this.container) {
            var rect = this.triggerElement.getBoundingClientRect();
            let top = rect.bottom + 5;
            let left = rect.left;

            if (top + 400 > window.innerHeight) top = rect.top - 400 - 5;
            if (left + 320 > window.innerWidth) left = window.innerWidth - 320 - 10;
            if (left < 10) left = 10;

            this.container.setCssStyles({
                position: "fixed",
                top: `${top}px`,
                left: `${left}px`,
                zIndex: "1000"
            });
        }
    }

    renderContent() {
        if (!this.container) return;
        this.container.empty();

        const title = this.container.createEl("h3", { cls: "dida-calendar-title" });
        const calendarContainer = this.container.createEl("div", { cls: "dida-calendar-container" });
        const now = new Date();
        this.displayYear = (this.selectedDate || now).getFullYear();
        this.displayMonth = (this.selectedDate || now).getMonth();
        this.renderCalendar(calendarContainer);
        const setDropdownOpen = (dropdown: HTMLElement, isOpen: boolean) => {
            dropdown.toggleClass("is-open", isOpen);
            dropdown.setCssStyles({ display: isOpen ? "block" : "none" });
        };
        const toggleDropdown = (dropdown: HTMLElement) => {
            setDropdownOpen(dropdown, !dropdown.hasClass("is-open"));
        };

        const timeContainer = title.createEl("div", { cls: "dida-time-container" });
        const modeSwitch = timeContainer.createEl("div", { cls: "dida-schedule-mode-switch dida-calendar-mode-switch" });
        const allDayModeBtn = modeSwitch.createEl("button", { text: "全天" });
        const timedModeBtn = modeSwitch.createEl("button", { text: "时间段" });

        const timeLabel = timeContainer.createEl("span", { text: "开始", cls: "dida-time-label" });
        const hourContainer = timeContainer.createDiv("dida-time-select-container");
        hourContainer.setCssStyles({ display: "inline-block", position: "relative", marginRight: "5px" });
        const hourDisplay = hourContainer.createEl("div", { text: this.selectedHour.toString().padStart(2, "0"), cls: "dida-time-display" });
        hourDisplay.setCssStyles({ fontSize: "12px", border: "1px solid var(--background-modifier-border)", borderRadius: "4px", background: "var(--background-primary)", color: "var(--text-normal)", cursor: "pointer", minWidth: "25px", textAlign: "center", userSelect: "none" });
        const hourDropdown = hourContainer.createDiv("dida-time-dropdown");
        hourDropdown.setCssStyles({ fontSize: "12px", position: "absolute", top: "100%", left: "0", background: "var(--background-primary)", border: "1px solid var(--background-modifier-border)", borderRadius: "4px", maxHeight: "150px", overflowY: "auto", zIndex: "1003", display: "none", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" });
        for (let i = 0; i < 24; i++) {
            const opt = hourDropdown.createEl("div", { text: i.toString().padStart(2, "0"), cls: "dida-time-option" });
            opt.setCssStyles({ padding: "5px 10px", cursor: "pointer", borderBottom: "1px solid var(--background-modifier-border)", userSelect: "none" });
            if (i === this.selectedHour) {
                opt.setCssStyles({ background: "var(--interactive-accent)", color: "var(--text-on-accent)" });
            }
            opt.onclick = (e) => {
                e.stopPropagation();
                this.selectedHour = i;
                hourDisplay.textContent = i.toString().padStart(2, "0");
                setDropdownOpen(hourDropdown, false);
                hourDropdown.querySelectorAll(".dida-time-option").forEach((el, idx) => {
                    if (idx === i) {
                        (el as HTMLElement).setCssStyles({ background: "var(--interactive-accent)", color: "var(--text-on-accent)" });
                    } else {
                        (el as HTMLElement).setCssStyles({ background: "", color: "" });
                    }
                });
            };
            opt.onmouseenter = () => {
                if (i !== this.selectedHour) opt.setCssStyles({ background: "var(--background-modifier-hover)" });
            };
            opt.onmouseleave = () => {
                if (i !== this.selectedHour) opt.setCssStyles({ background: "" });
            };
        }
        hourDisplay.onclick = (e) => {
            e.stopPropagation();
            toggleDropdown(hourDropdown);
        };
        timeContainer.createEl("span", { text: ":" });
        const minuteContainer = timeContainer.createDiv("dida-time-select-container");
        minuteContainer.setCssStyles({ display: "inline-block", position: "relative", marginLeft: "5px" });
        const minuteDisplay = minuteContainer.createEl("div", { text: this.selectedMinute.toString().padStart(2, "0"), cls: "dida-time-display" });
        minuteDisplay.setCssStyles({ fontSize: "12px", border: "1px solid var(--background-modifier-border)", borderRadius: "4px", background: "var(--background-primary)", color: "var(--text-normal)", cursor: "pointer", minWidth: "25px", textAlign: "center", userSelect: "none" });
        const minuteDropdown = minuteContainer.createDiv("dida-time-dropdown");
        minuteDropdown.setCssStyles({ fontSize: "12px", position: "absolute", top: "100%", left: "0", background: "var(--background-primary)", border: "1px solid var(--background-modifier-border)", borderRadius: "4px", maxHeight: "150px", overflowY: "auto", zIndex: "1003", display: "none", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" });
        for (let i = 0; i < 60; i += 15) {
            const opt = minuteDropdown.createEl("div", { text: i.toString().padStart(2, "0"), cls: "dida-time-option" });
            opt.setCssStyles({ padding: "5px 10px", cursor: "pointer", borderBottom: "1px solid var(--background-modifier-border)", userSelect: "none" });
            if (i === this.selectedMinute) {
                opt.setCssStyles({ background: "var(--interactive-accent)", color: "var(--text-on-accent)" });
            }
            opt.onclick = (e) => {
                e.stopPropagation();
                this.selectedMinute = i;
                minuteDisplay.textContent = i.toString().padStart(2, "0");
                setDropdownOpen(minuteDropdown, false);
                minuteDropdown.querySelectorAll(".dida-time-option").forEach((el, idx) => {
                    if (15 * idx === i) {
                        (el as HTMLElement).setCssStyles({ background: "var(--interactive-accent)", color: "var(--text-on-accent)" });
                    } else {
                        (el as HTMLElement).setCssStyles({ background: "", color: "" });
                    }
                });
            };
            opt.onmouseenter = () => {
                if (i !== this.selectedMinute) opt.setCssStyles({ background: "var(--background-modifier-hover)" });
            };
            opt.onmouseleave = () => {
                if (i !== this.selectedMinute) opt.setCssStyles({ background: "" });
            };
        }
        minuteDisplay.onclick = (e) => {
            e.stopPropagation();
            toggleDropdown(minuteDropdown);
        };

        const endContainer = timeContainer.createEl("div", { cls: "dida-time-end-container" });
        endContainer.createEl("span", { text: "～", cls: "dida-time-label" });
        const endHourContainer = endContainer.createDiv("dida-time-select-container");
        endHourContainer.setCssStyles({ display: "inline-block", position: "relative", marginRight: "5px" });
        const endHourDisplay = endHourContainer.createEl("div", { text: this.endHour.toString().padStart(2, "0"), cls: "dida-time-display" });
        endHourDisplay.setCssStyles({ fontSize: "12px", border: "1px solid var(--background-modifier-border)", borderRadius: "4px", background: "var(--background-primary)", color: "var(--text-normal)", cursor: "pointer", minWidth: "25px", textAlign: "center", userSelect: "none" });
        const endHourDropdown = endHourContainer.createDiv("dida-time-dropdown");
        endHourDropdown.setCssStyles({ fontSize: "12px", position: "absolute", top: "100%", left: "0", background: "var(--background-primary)", border: "1px solid var(--background-modifier-border)", borderRadius: "4px", maxHeight: "150px", overflowY: "auto", zIndex: "1003", display: "none", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" });
        for (let i = 0; i < 24; i++) {
            const opt = endHourDropdown.createEl("div", { text: i.toString().padStart(2, "0"), cls: "dida-time-option" });
            opt.setCssStyles({ padding: "5px 10px", cursor: "pointer", borderBottom: "1px solid var(--background-modifier-border)", userSelect: "none" });
            if (i === this.endHour) {
                opt.setCssStyles({ background: "var(--interactive-accent)", color: "var(--text-on-accent)" });
            }
            opt.onclick = (e) => {
                e.stopPropagation();
                this.endHour = i;
                endHourDisplay.textContent = i.toString().padStart(2, "0");
                setDropdownOpen(endHourDropdown, false);
                endHourDropdown.querySelectorAll(".dida-time-option").forEach((el, idx) => {
                    if (idx === i) {
                        (el as HTMLElement).setCssStyles({ background: "var(--interactive-accent)", color: "var(--text-on-accent)" });
                    } else {
                        (el as HTMLElement).setCssStyles({ background: "", color: "" });
                    }
                });
            };
            opt.onmouseenter = () => {
                if (i !== this.endHour) opt.setCssStyles({ background: "var(--background-modifier-hover)" });
            };
            opt.onmouseleave = () => {
                if (i !== this.endHour) opt.setCssStyles({ background: "" });
            };
        }
        endHourDisplay.onclick = (e) => {
            e.stopPropagation();
            toggleDropdown(endHourDropdown);
        };
        endContainer.createEl("span", { text: ":" });
        const endMinuteContainer = endContainer.createDiv("dida-time-select-container");
        endMinuteContainer.setCssStyles({ display: "inline-block", position: "relative", marginLeft: "5px" });
        const endMinuteDisplay = endMinuteContainer.createEl("div", { text: this.endMinute.toString().padStart(2, "0"), cls: "dida-time-display" });
        endMinuteDisplay.setCssStyles({ fontSize: "12px", border: "1px solid var(--background-modifier-border)", borderRadius: "4px", background: "var(--background-primary)", color: "var(--text-normal)", cursor: "pointer", minWidth: "25px", textAlign: "center", userSelect: "none" });
        const endMinuteDropdown = endMinuteContainer.createDiv("dida-time-dropdown");
        endMinuteDropdown.setCssStyles({ fontSize: "12px", position: "absolute", top: "100%", left: "0", background: "var(--background-primary)", border: "1px solid var(--background-modifier-border)", borderRadius: "4px", maxHeight: "150px", overflowY: "auto", zIndex: "1003", display: "none", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" });
        for (let i = 0; i < 60; i += 15) {
            const opt = endMinuteDropdown.createEl("div", { text: i.toString().padStart(2, "0"), cls: "dida-time-option" });
            opt.setCssStyles({ padding: "5px 10px", cursor: "pointer", borderBottom: "1px solid var(--background-modifier-border)", userSelect: "none" });
            if (i === this.endMinute) {
                opt.setCssStyles({ background: "var(--interactive-accent)", color: "var(--text-on-accent)" });
            }
            opt.onclick = (e) => {
                e.stopPropagation();
                this.endMinute = i;
                endMinuteDisplay.textContent = i.toString().padStart(2, "0");
                setDropdownOpen(endMinuteDropdown, false);
                endMinuteDropdown.querySelectorAll(".dida-time-option").forEach((el, idx) => {
                    if (15 * idx === i) {
                        (el as HTMLElement).setCssStyles({ background: "var(--interactive-accent)", color: "var(--text-on-accent)" });
                    } else {
                        (el as HTMLElement).setCssStyles({ background: "", color: "" });
                    }
                });
            };
            opt.onmouseenter = () => {
                if (i !== this.endMinute) opt.setCssStyles({ background: "var(--background-modifier-hover)" });
            };
            opt.onmouseleave = () => {
                if (i !== this.endMinute) opt.setCssStyles({ background: "" });
            };
        }
        endMinuteDisplay.onclick = (e) => {
            e.stopPropagation();
            toggleDropdown(endMinuteDropdown);
        };

        const updateVisibility = () => {
            const show = !this.isAllDay;
            allDayModeBtn.toggleClass("is-active", this.isAllDay);
            timedModeBtn.toggleClass("is-active", !this.isAllDay);
            timeLabel.setCssStyles({ display: show ? "inline-block" : "none" });
            hourContainer.setCssStyles({ display: show ? "inline-block" : "none" });
            minuteContainer.setCssStyles({ display: show ? "inline-block" : "none" });
            endContainer.setCssStyles({ display: show ? "flex" : "none" });
        };
        updateVisibility();
        if (this.dateOnly) {
            this.isAllDay = true;
            modeSwitch.setCssStyles({ display: "none" });
            timeContainer.setCssStyles({ display: "none" });
            endContainer.setCssStyles({ display: "none" });
            updateVisibility();
        }
        const setAllDay = (isAllDay: boolean) => {
            if (!this.selectedDate) {
                const d = new Date();
                d.setHours(0, 0, 0, 0);
                this.selectedDate = d;
            }
            this.isAllDay = isAllDay;
            updateVisibility();
        };
        allDayModeBtn.onclick = () => setAllDay(true);
        timedModeBtn.onclick = () => setAllDay(false);

        const closeDropdowns = (e: MouseEvent) => {
            if (!hourContainer.contains(e.target as Node)) setDropdownOpen(hourDropdown, false);
            if (!minuteContainer.contains(e.target as Node)) setDropdownOpen(minuteDropdown, false);
            if (!endHourContainer.contains(e.target as Node)) setDropdownOpen(endHourDropdown, false);
            if (!endMinuteContainer.contains(e.target as Node)) setDropdownOpen(endMinuteDropdown, false);
        };
        setTimeout(() => {
            this.closeDropdownsHandler = closeDropdowns;
            document.addEventListener("click", closeDropdowns);
        }, 100);

        const buttons = this.container.createEl("div", { cls: "dida-calendar-buttons" });
        buttons.createEl("button", { text: "清除" }).onclick = async () => {
            if (this.plugin && null != this.taskIndex) {
                const task = this.plugin.settings.tasks[this.taskIndex];
                if (task) {
                    task.startDate = null as any;
                    task.dueDate = null as any;
                    task.isAllDay = false;
                    task.repeatFlag = null;
                    task.updatedAt = (new Date).toISOString();
                    try { await this.plugin.saveSettings(); } catch (e) { }
                    try { this.plugin.refreshTaskView(); } catch (e) { }
                    if (this.plugin.settings.accessToken && task.didaId) {
                        setTimeout(async () => {
                            try { await this.plugin.updateTaskInDidaList(task); } catch (e) { }
                        }, 0);
                    }
                }
            } else if (typeof this.onDateSelect === "function") {
                this.onDateSelect(null, this.isAllDay);
            }
            this.close();
        };
        buttons.createEl("button", { text: "今天" }).onclick = () => {
            const today = new Date();
            if (this.isAllDay) today.setHours(0, 0, 0, 0);
            else today.setHours(this.selectedHour, this.selectedMinute, 0, 0);
            this.onDateSelect(today, this.isAllDay);
            this.close();
        };
        const repeatBtn = buttons.createEl("button", { text: "重复设置" });
        repeatBtn.onclick = () => this.showRepeatSettings(repeatBtn);
        if (this.dateOnly) repeatBtn.setCssStyles({ display: "none" });
        buttons.createEl("button", { text: "取消" }).onclick = () => this.close();
        buttons.createEl("button", { text: "确认", cls: "mod-cta" }).onclick = () => {
            if (this.selectedDate) {
                const startDate = new Date(this.selectedDate);
                let endDate: Date | null = null;
                if (this.dateOnly) {
                    startDate.setHours(0, 0, 0, 0);
                    this.onDateSelect(startDate, true);
                    this.close();
                    return;
                }
                if (!this.isAllDay && this.plugin && null !== this.taskIndex) {
                    const task = this.plugin.settings.tasks[this.taskIndex];
                    if (task) {
                        if (this.onDateSelect.toString().includes("updateTaskStartDate")) {
                            const base = new Date(this.selectedDate);
                            const start = new Date(base.getFullYear(), base.getMonth(), base.getDate(), this.selectedHour, this.selectedMinute, 0, 0);
                            let end = new Date(base.getFullYear(), base.getMonth(), base.getDate(), this.endHour, this.endMinute, 0, 0);
                            if (end.getTime() < start.getTime()) end = new Date(start.getTime() + 3600000);
                            const y = end.getFullYear();
                            const m = String(end.getMonth() + 1).padStart(2, "0");
                            const d = String(end.getDate()).padStart(2, "0");
                            const h = String(end.getHours()).padStart(2, "0");
                            const min = String(end.getMinutes()).padStart(2, "0");
                            const s = String(end.getSeconds()).padStart(2, "0");
                            const offset = end.getTimezoneOffset();
                            const oh = Math.abs(Math.floor(offset / 60));
                            const om = Math.abs(offset % 60);
                            const tz = (offset <= 0 ? "+" : "-") + String(oh).padStart(2, "0") + String(om).padStart(2, "0");
                            task.dueDate = `${y}-${m}-${d}T${h}:${min}:${s}${tz}`;
                            task.isAllDay = this.isAllDay;
                            endDate = end;
                        }
                    }
                }
                if (!this.isAllDay && !endDate) {
                    const base = new Date(this.selectedDate);
                    const start = new Date(base.getFullYear(), base.getMonth(), base.getDate(), this.selectedHour, this.selectedMinute, 0, 0);
                    let end = new Date(base.getFullYear(), base.getMonth(), base.getDate(), this.endHour, this.endMinute, 0, 0);
                    if (end.getTime() < start.getTime()) end = new Date(start.getTime() + 3600000);
                    endDate = end;
                }
                if (this.isAllDay) startDate.setHours(0, 0, 0, 0);
                else startDate.setHours(this.selectedHour, this.selectedMinute, 0, 0);
                if (endDate) this.onDateSelect(startDate, this.isAllDay, endDate);
                else this.onDateSelect(startDate, this.isAllDay);
            }
            this.close();
        };
    }

    renderCalendar(container: HTMLElement) {
        container.empty();
        const nav = container.createDiv("dida-calendar-nav");
        nav.createEl("button", { text: "‹" }).onclick = () => {
            this.displayMonth--;
            if (this.displayMonth < 0) {
                this.displayMonth = 11;
                this.displayYear--;
            }
            this.renderCalendar(container);
        };
        nav.createEl("span", { text: `${this.displayYear}年${this.displayMonth + 1}月`, cls: "dida-calendar-month-label" });
        nav.createEl("button", { text: "›" }).onclick = () => {
            this.displayMonth++;
            if (this.displayMonth > 11) {
                this.displayMonth = 0;
                this.displayYear++;
            }
            this.renderCalendar(container);
        };

        const weekHeader = container.createDiv("dida-calendar-week-header");
        ["日", "一", "二", "三", "四", "五", "六"].forEach(t => {
            weekHeader.createEl("div", { text: t, cls: "dida-calendar-week-day" });
        });

        const grid = container.createDiv("dida-calendar-grid");
        const firstDay = new Date(this.displayYear, this.displayMonth, 1);
        const startDate = new Date(firstDay);
        startDate.setDate(startDate.getDate() - firstDay.getDay());

        for (let i = 0; i < 42; i++) {
            const date = new Date(startDate);
            date.setDate(startDate.getDate() + i);

            const cell = grid.createEl("div", { text: date.getDate().toString(), cls: "dida-calendar-day" });
            if (date.getMonth() !== this.displayMonth) cell.classList.add("other-month");

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (date.setHours(0, 0, 0, 0) === today.getTime()) cell.classList.add("today");

            if (this.selectedDate) {
                const selected = new Date(this.selectedDate);
                selected.setHours(0, 0, 0, 0);
                if (date.getTime() === selected.getTime()) cell.classList.add("selected");
            }

            cell.onclick = () => {
                grid.querySelectorAll(".selected").forEach(el => el.classList.remove("selected"));
                cell.classList.add("selected");
                this.selectedDate = new Date(date);
            };
        }
    }

    setupEventListeners() {
        if (!this.overlay || !this.container) return;
        this.overlay.onclick = (e) => {
            const target = e.target as HTMLElement;
            if (target.tagName === "SELECT" || target.closest("select")) return;
            if (!target.closest(".dida-calendar-popup")) this.close();
        };
        this.container.onclick = (e) => {
            const target = e.target as HTMLElement;
            if (target.tagName === "SELECT" || target.closest("select")) return;
            if (this.closeDropdownsHandler) {
                this.closeDropdownsHandler(e);
            }
            e.stopPropagation();
        };
        this.escapeHandler = (e) => {
            if (e.key === "Escape") this.close();
        };
        document.addEventListener("keydown", this.escapeHandler);
    }

    close() {
        if (this.closeDropdownsHandler) {
            document.removeEventListener("click", this.closeDropdownsHandler);
            this.closeDropdownsHandler = null;
        }
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
        if (this.container) {
            this.container.remove();
            this.container = null;
        }
        if (this.escapeHandler) {
            document.removeEventListener("keydown", this.escapeHandler);
            this.escapeHandler = null;
        }
    }

    showRepeatSettings(trigger: HTMLElement) {
        new CompactRepeatSettings(this.app, (rrule) => {
            this.repeatFlag = rrule;
            if (this.taskIndex !== undefined && this.plugin) {
                const task = this.plugin.settings.tasks[this.taskIndex!];
                if (task) {
                    task.repeatFlag = rrule;
                    task.updatedAt = (new Date).toISOString();
                    this.plugin.saveSettings();
                    this.plugin.refreshTaskView();
                    try {
                        const view = this.plugin.getTaskViewSafely();
                        if (view && (view as any).updateTaskRowRepeatRule) {
                            (view as any).updateTaskRowRepeatRule(task);
                        }
                        if (view && (view as any).updateNativeTaskDueDate) {
                            (view as any).updateNativeTaskDueDate(task, task.dueDate, task.dueDate);
                        }
                    } catch (e) { }
                    if (this.plugin.settings.accessToken && task.didaId) {
                        setTimeout(async () => {
                            try { await this.plugin.updateTaskInDidaList(task); } catch (e) { }
                        }, 0);
                    }
                }
            }
        }, trigger).show();
    }
}

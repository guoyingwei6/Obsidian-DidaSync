import assert from "node:assert/strict";
import { ScopedPopup } from "../src/modals/TaskSchedulePicker";

class FakeElement {
    children: FakeElement[] = [];
    parent: FakeElement | null = null;
    className = "";
    styles: Record<string, string> = {};
    onclick: ((event?: unknown) => void) | null = null;

    createDiv(className: string = "") {
        const child = new FakeElement();
        child.className = className;
        child.parent = this;
        this.children.push(child);
        return child;
    }

    setCssStyles(styles: Record<string, string>) {
        Object.assign(this.styles, styles);
    }

    getBoundingClientRect() {
        return { top: 0, left: 0, right: 400, bottom: 600, width: 400, height: 600 };
    }

    closest() { return null; }
    stopPropagation() { }

    remove() {
        if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
        this.parent = null;
    }
}

const body = new FakeElement();
const listeners = new Map<string, Set<unknown>>();
(globalThis as any).document = {
    body,
    addEventListener(type: string, listener: unknown) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(listener);
    },
    removeEventListener(type: string, listener: unknown) {
        listeners.get(type)?.delete(listener);
    }
};
(globalThis as any).window = {
    innerWidth: 400,
    innerHeight: 600,
    addEventListener() { },
    removeEventListener() { }
};

const scope = new FakeElement();
const popup = new ScopedPopup(null, scope as any);
popup.open(container => {
    container.createDiv("calendar-content");
});
assert.ok(popup.container, "popup container should remain mounted after a successful render");
assert.equal(body.children.length, 2, "overlay and popup should both be mounted");
popup.close();
assert.equal(body.children.length, 0, "closing should remove both popup layers");

const failingPopup = new ScopedPopup(null, scope as any);
assert.throws(() => failingPopup.open(() => {
    throw new Error("render failed");
}), /render failed/);
assert.equal(body.children.length, 0, "a failed render must not leave an overlay behind");
assert.equal(ScopedPopup.activePopup, null);

console.log("Task schedule popup tests passed");

import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { buildSync } from "esbuild";
import { builtinModules } from "node:module";

const outputFile = path.resolve(".tmp-test/mobile-main.js");
buildSync({
    entryPoints: ["src/main.ts"],
    outfile: outputFile,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "es2018",
    external: ["obsidian", "electron", ...builtinModules]
});
const originalLoad = (Module as any)._load;
const forbiddenLoads: string[] = [];
class BaseView { }
const obsidianMock = {
    App: BaseView,
    Editor: BaseView,
    ItemView: BaseView,
    Menu: BaseView,
    Modal: BaseView,
    Notice: BaseView,
    Plugin: BaseView,
    PluginSettingTab: BaseView,
    Setting: BaseView,
    TFile: BaseView,
    WorkspaceLeaf: BaseView,
    Platform: { isMobile: true },
    getIconIds: () => [],
    normalizePath: (value: string) => value,
    requestUrl: async () => ({ status: 200, text: "{}", json: {} }),
    setIcon: () => { }
};

(Module as any)._load = function (request: string, parent: unknown, isMain: boolean) {
    if (request === "obsidian") return obsidianMock;
    if (request === "http" || request === "node:http" || request === "electron") {
        forbiddenLoads.push(request);
        throw new Error(`移动端启动不应加载 ${request}`);
    }
    return originalLoad.call(this, request, parent, isMain);
};

async function run() {
try {
    const loaded = require(outputFile);
    assert.equal(typeof loaded.default, "function");
    assert.deepEqual(forbiddenLoads, []);
    console.log("Mobile startup isolation test passed");
} finally {
    (Module as any)._load = originalLoad;
}
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

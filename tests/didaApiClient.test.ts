import assert from "node:assert/strict";
import Module from "node:module";

const requests: any[] = [];
let queuedResponses: any[] = [];
const originalLoad = (Module as any)._load;

(Module as any)._load = function (request: string, parent: unknown, isMain: boolean) {
    if (request === "obsidian") {
        return {
            Notice: class Notice {
                constructor(_message?: string) { }
            },
            Platform: { isMobile: false },
            requestUrl: async (options: any) => {
                requests.push(options);
                const response = queuedResponses.shift();
                if (response instanceof Error) throw response;
                return response || { status: 200, text: "{}", json: {} };
            }
        };
    }
    if (request === "../main" || request.endsWith("/main")) {
        return class DidaSyncPlugin { };
    }
    if (request.includes("AuthUrlModal")) {
        return { AuthUrlModal: class AuthUrlModal { open() { } } };
    }
    return originalLoad.call(this, request, parent, isMain);
};

async function run() {
    const { DidaApiClient } = require("../src/api/DidaApiClient");
    const plugin = {
        settings: {
            clientId: "client-id",
            clientSecret: "client-secret",
            accessToken: "access-old",
            refreshToken: "refresh-old",
            serverPort: 8765,
            oauthCallbackMode: "ipv4"
        },
        saveCount: 0,
        status: "",
        async saveSettings() { this.saveCount++; },
        updateStatusBar(value: string) { this.status = value; },
        getUserTimeZone() { return "Asia/Shanghai"; }
    };
    const client = new DidaApiClient(plugin as any);

    assert.equal(client.getRedirectHost(), "127.0.0.1");
    assert.equal(client.getLocalRedirectUri(), "http://127.0.0.1:8765/callback");
    const authUrl = client.buildAuthUrl();
    assert.match(authUrl, /^https:\/\/dida365\.com\/oauth\/authorize\?/);
    assert.match(authUrl, /client_id=client-id/);
    assert.match(authUrl, /redirect_uri=http%3A%2F%2F127\.0\.0\.1%3A8765%2Fcallback/);
    assert.match(authUrl, /scope=tasks%3Awrite\+tasks%3Aread/);

    queuedResponses = [{ status: 200, text: "{\"access_token\":\"access-new\",\"refresh_token\":\"refresh-new\"}", json: { access_token: "access-new", refresh_token: "refresh-new" } }];
    const token = await client.refreshAccessToken();
    assert.equal(token.access_token, "access-new");
    assert.equal(plugin.settings.accessToken, "access-new");
    assert.equal(plugin.settings.refreshToken, "refresh-new");
    assert.equal(plugin.saveCount, 1);
    assert.equal(requests.at(-1).method, "POST");
    assert.match(requests.at(-1).body, /grant_type=refresh_token/);

    plugin.settings.accessToken = "expired";
    plugin.settings.refreshToken = "refresh-new";
    queuedResponses = [
        { status: 401, text: "unauthorized", json: {} },
        { status: 200, text: "{\"access_token\":\"after-refresh\"}", json: { access_token: "after-refresh" } },
        { status: 200, text: "{\"ok\":true}", json: { ok: true } }
    ];
    const res = await client.makeAuthenticatedRequest("https://example.test/tasks", { headers: { "X-Test": "1" } });
    assert.equal(res.status, 200);
    assert.equal(plugin.settings.accessToken, "after-refresh");
    assert.equal(requests.at(-1).headers.Authorization, "Bearer after-refresh");
    assert.equal(requests.at(-1).headers["X-Test"], "1");

    queuedResponses = [new Error("DNS failed")];
    await assert.rejects(
        () => (client as any).requestUrlLike("https://example.test/fail", {}),
        /网络请求错误: DNS failed/
    );

    console.log("DidaApiClient OAuth and request tests passed");
}

run()
    .finally(() => {
        (Module as any)._load = originalLoad;
    })
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });

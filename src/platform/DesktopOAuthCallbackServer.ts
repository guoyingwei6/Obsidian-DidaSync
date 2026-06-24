import type { Server } from "http";

export interface DesktopOAuthCallbackServerHandle {
    close(): Promise<void>;
}

interface ListenTarget {
    host: string;
    ipv6Only: boolean;
}

interface StartOptions {
    port: number;
    callbackBaseUrl: string;
    listenTargets: ListenTarget[];
    onCode: (code: string) => void;
    onError: (error: string) => void;
}

export async function startDesktopOAuthCallbackServer(options: StartOptions): Promise<DesktopOAuthCallbackServerHandle> {
    const http = await import("http");
    const servers: Server[] = [];
    const close = async () => {
        const activeServers = servers.splice(0);
        await Promise.all(activeServers.map(server => new Promise<void>(resolve => {
            try {
                server.close(() => resolve());
            } catch (_error) {
                resolve();
            }
        })));
    };

    await new Promise<void>((resolve, reject) => {
        let pending = options.listenTargets.length;
        let settled = false;
        const fail = (error: Error) => {
            if (settled) return;
            settled = true;
            void close();
            reject(error);
        };

        for (const target of options.listenTargets) {
            const server = http.createServer((request, response) => {
                try {
                    const url = new URL(request.url || "", options.callbackBaseUrl);
                    if (url.pathname !== "/callback") {
                        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
                        response.end("Not Found");
                        return;
                    }
                    const code = url.searchParams.get("code");
                    const error = url.searchParams.get("error");
                    if (error) {
                        response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
                        response.end("<h1>OAuth 认证失败</h1><p>请返回 Obsidian 后重试。</p>");
                        options.onError(error);
                    } else if (code) {
                        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
                        response.end("<h1>OAuth 认证成功</h1><p>可以关闭此页面并返回 Obsidian。</p>");
                        options.onCode(code);
                    } else {
                        response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
                        response.end("<h1>OAuth 认证失败</h1><p>未收到授权码。</p>");
                        options.onError("未收到授权码");
                    }
                } catch (_error) {
                    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
                    response.end("Invalid OAuth callback");
                }
            });
            servers.push(server);
            server.once("error", (error: Error) => {
                const hostLabel = target.host.includes(":") ? `[${target.host}]` : target.host;
                fail(new Error(`无法启动 OAuth 回调服务 ${hostLabel}:${options.port}: ${error.message}`));
            });
            server.listen({ port: options.port, host: target.host, ipv6Only: target.ipv6Only }, () => {
                pending -= 1;
                if (!settled && pending === 0) {
                    settled = true;
                    resolve();
                }
            });
        }
    });

    return { close };
}

import { createServer, request as httpRequest, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const III_PORT = 3111;
const PROXY_PORT = 3110;
const isProduction = process.env.NODE_ENV === "production";
let cachedHtml: string | null = null;

function loadHtml(): string {
  if (!cachedHtml || !isProduction) {
    cachedHtml = readFileSync(resolve(__dirname, "ui.html"), "utf-8");
  }
  return cachedHtml;
}

let server: Server | null = null;

export function startProxy(): Promise<void> {
  return new Promise((resolve, reject) => {
    server = createServer((req, res) => {
      if (req.method === "GET" && (req.url === "/" || req.url === "")) {
        const html = loadHtml();
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "access-control-allow-origin": "*",
          "cache-control": isProduction
            ? "public, max-age=300"
            : "no-cache, no-store",
        });
        res.end(html);
        return;
      }

      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "content-type",
          "access-control-max-age": "86400",
        });
        res.end();
        return;
      }

      const proxyReq = httpRequest(
        {
          hostname: "127.0.0.1",
          port: III_PORT,
          path: req.url,
          method: req.method,
          headers: req.headers,
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
          proxyRes.pipe(res, { end: true });
        },
      );

      proxyReq.on("error", () => {
        res.writeHead(502, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "iii engine unavailable" }));
      });

      req.pipe(proxyReq, { end: true });
    });

    server.listen(PROXY_PORT, "127.0.0.1", () => {
      console.log(`UI proxy listening on http://127.0.0.1:${PROXY_PORT}`);
      resolve();
    });

    server.on("error", reject);
  });
}

export function stopProxy(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => resolve());
    } else {
      resolve();
    }
  });
}

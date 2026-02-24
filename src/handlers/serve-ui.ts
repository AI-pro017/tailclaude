import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ApiRequest, ApiResponse } from "iii-sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === "production";
let cachedHtml: string | null = null;

export const handleServeUI = async (_req: ApiRequest): Promise<ApiResponse> => {
  if (!cachedHtml || !isProduction) {
    cachedHtml = readFileSync(resolve(__dirname, "..", "ui.html"), "utf-8");
  }

  return {
    status_code: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    body: cachedHtml,
  };
};

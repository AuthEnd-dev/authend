import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const apiEnvPath = fileURLToPath(new URL("../api/.env", import.meta.url));

function readApiEnvValue(name: string): string | undefined {
  if (!existsSync(apiEnvPath)) return undefined;

  const lines = readFileSync(apiEnvPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    if (key !== name) continue;

    return trimmed.slice(separatorIndex + 1).trim();
  }

  return undefined;
}

function resolveAdminPort(): number {
  const adminDevUrl = readApiEnvValue("ADMIN_DEV_URL");
  if (!adminDevUrl) return 7001;

  try {
    const parsed = new URL(adminDevUrl);
    const port = parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80;
    return Number.isFinite(port) && port > 0 ? port : 7001;
  } catch {
    return 7001;
  }
}

function resolveApiUrl(explicitApiUrl?: string): string {
  const apiUrl = explicitApiUrl?.trim() || readApiEnvValue("APP_URL");
  return apiUrl && apiUrl.length > 0 ? apiUrl : "http://localhost:7002";
}

export default defineConfig(({ mode }) => {
  const localEnv = loadEnv(mode, process.cwd(), "");
  const viteApiUrl = resolveApiUrl(localEnv.VITE_API_URL || process.env.VITE_API_URL);

  return {
    plugins: [react(), tailwindcss()],
    base: "/admin/",
    define: {
      "import.meta.env.VITE_API_URL": JSON.stringify(viteApiUrl),
    },
    resolve: {
      conditions: ["@tanstack/custom-condition"],
      alias: {
        "@authend/sdk": fileURLToPath(new URL("../../packages/sdk/src/index.ts", import.meta.url)),
        "@authend/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url)),
      },
    },
    server: {
      port: resolveAdminPort(),
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
  };
});

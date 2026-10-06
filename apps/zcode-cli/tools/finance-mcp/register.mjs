#!/usr/bin/env node
/**
 * 注册 finance MCP server 到用户级 MCP 配置（~/.zcode/cli/config.json 的 mcp.servers.finance）。
 * 幂等：重复执行只覆盖 finance 一项，不动其他 server。
 * 用法：node register.mjs   （若用 TUSHARE_TOKEN 环境变量，可不在配置里传 env）
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(here, "server.mjs");
const configPath = join(homedir(), ".zcode", "cli", "config.json");

let config = {};
try {
  config = JSON.parse(await readFile(configPath, "utf8"));
} catch {
  config = {};
}
config.mcp = config.mcp || {};
config.mcp.servers = config.mcp.servers || {};
config.mcp.servers.finance = {
  type: "stdio",
  command: process.execPath,
  args: [serverPath],
  ...(process.env.TUSHARE_TOKEN ? { env: { TUSHARE_TOKEN: process.env.TUSHARE_TOKEN } } : {}),
  timeoutMs: 120000,
};

await mkdir(dirname(configPath), { recursive: true });
await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`[finance-mcp] 已注册到 ${configPath}`);
console.log(`[finance-mcp] server: ${serverPath}`);
console.log("[finance-mcp] token 将从 ~/.zcode/finance.json 或 TUSHARE_TOKEN 读取");

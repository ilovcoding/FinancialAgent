#!/usr/bin/env node
/**
 * 金融数据 MCP server（Tushare Pro 本地直连）。
 *
 * 设计约束：
 * - 零 npm 依赖：手写 MCP stdio JSON-RPC（newline-delimited），node >= 24 原生 fetch。
 * - token 来源：env TUSHARE_TOKEN 优先，其次 ~/.zcode/finance.json 的 tushareToken 字段
 *   （设置页「金融数据源」写入的就是这个文件，UI 与 Agent 共用同一份事实）。
 * - 限流与缓存：Tushare 按分钟限流，全局最小调用间隔 + 内存 TTL 缓存，收盘数据缓存 12 小时。
 * - 工具全部只读，参数由本层收紧（限制条数/日期窗口），模型只能查询不能改写。
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const TUSHARE_API = "https://api.tushare.pro";
const MIN_CALL_INTERVAL_MS = 220; // 保守限流：约 4.5 次/秒上限，低于所有积分档的分钟配额折算
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 日线/财务等收盘数据 12h
const cache = new Map();
let lastCallAt = 0;
let tokenCache = null;
let tokenCacheAt = 0;

function log(...args) {
  // stderr only；stdout 是协议通道，绝不能写日志
  process.stderr.write(`[finance-mcp] ${new Date().toISOString()} ${args.join(" ")}\n`);
}

async function resolveToken() {
  if (process.env.TUSHARE_TOKEN?.trim()) return process.env.TUSHARE_TOKEN.trim();
  const now = Date.now();
  if (tokenCache && now - tokenCacheAt < 30_000) return tokenCache;
  // 与 financeService 相同的解析顺序：dev 隔离 home 优先，保证 UI 与 Agent 读同一份 token
  const home = process.env.ZCODE_DESKTOP_HOME_DIR?.trim() || process.env.HOME?.trim() || homedir();
  try {
    const raw = await readFile(join(home, ".zcode", "finance.json"), "utf8");
    const parsed = JSON.parse(raw);
    tokenCache = parsed.tushareToken?.trim() || null;
    tokenCacheAt = now;
    return tokenCache;
  } catch {
    return null;
  }
}

async function tushare(apiName, params) {
  const token = await resolveToken();
  if (!token) {
    throw new Error("未配置 Tushare token：请在客户端「设置 → 金融数据源」填写，或设置 TUSHARE_TOKEN 环境变量");
  }
  const cacheKey = `${apiName}:${JSON.stringify(params)}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
  const wait = MIN_CALL_INTERVAL_MS - (Date.now() - lastCallAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
  const res = await fetch(TUSHARE_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_name: apiName, token, params, fields: "" }),
  });
  if (!res.ok) throw new Error(`Tushare HTTP ${res.status}`);
  const json = await res.json();
  if (json.code !== 0) {
    throw new Error(`Tushare ${apiName} 失败: ${json.msg || json.code}（注意部分接口需要更高积分档位）`);
  }
  const { fields, items } = json.data;
  const rows = items.map((it) => Object.fromEntries(fields.map((f, i) => [f, it[i]])));
  cache.set(cacheKey, { at: Date.now(), data: rows });
  if (cache.size > 500) cache.delete(cache.keys?.().next?.().value ?? cache.keys().next().value);
  return rows;
}

/** 6 位裸代码 → tushare 后缀（6→SH，0/3→SZ，8/4→BJ 拒绝） */
function normalizeSymbol(input) {
  const s = String(input || "").trim().toUpperCase();
  if (/^\d{6}\.(SH|SZ)$/.test(s)) return s;
  if (/^\d{6}$/.test(s)) {
    if (s.startsWith("8") || s.startsWith("4")) throw new Error("暂不支持北交所标的");
    return `${s}.${s.startsWith("6") ? "SH" : "SZ"}`;
  }
  throw new Error(`无法识别的证券代码: ${input}（示例：600519 或 600519.SH）`);
}

function todayStr(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400_000);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

const num = (v) => (v === null || v === undefined ? null : Number(v));

const tools = [
  {
    name: "search_securities",
    description:
      "按名称或代码搜索 A 股证券，返回 ts_code/名称/所属行业/上市日期。用于把用户口中的公司名解析为标准代码。",
    inputSchema: {
      type: "object",
      properties: { keyword: { type: "string", description: "公司名称片段或 6 位代码" } },
      required: ["keyword"],
    },
    async run({ keyword }) {
      const kw = String(keyword).trim();
      const rows = await tushare("stock_basic", { exchange: "", list_status: "L" });
      const hit = rows.filter(
        (r) => r.name.includes(kw) || r.ts_code.startsWith(kw) || r.symbol === kw,
      );
      return hit.slice(0, 20).map((r) => ({
        ts_code: r.ts_code,
        name: r.name,
        industry: r.industry,
        list_date: r.list_date,
      }));
    },
  },
  {
    name: "get_daily",
    description:
      "获取个股日线行情（不复权 OHLCV + 涨跌幅），默认最近 120 个交易日。技术面分析的数据基础。",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "6 位代码或带交易所后缀，如 600519 / 600519.SH" },
        limit: { type: "number", description: "返回条数上限，默认 120，最大 250" },
      },
      required: ["symbol"],
    },
    async run({ symbol, limit }) {
      const ts = normalizeSymbol(symbol);
      const cap = Math.min(Math.max(Number(limit) || 120, 10), 250);
      const rows = await tushare("daily", {
        ts_code: ts,
        start_date: todayStr(-cap * 2.2 - 30),
        end_date: todayStr(),
      });
      return rows
        .sort((a, b) => (a.trade_date < b.trade_date ? 1 : -1))
        .slice(0, cap)
        .map((r) => ({
          date: r.trade_date,
          open: num(r.open),
          high: num(r.high),
          low: num(r.low),
          close: num(r.close),
          pct_chg: num(r.pct_chg),
          volume_hand: r.vol ? Math.round(Number(r.vol) * 100) : null, // 手
          amount_1e4_yuan: num(r.amount), // 万元
        }));
    },
  },
  {
    name: "get_daily_basic",
    description:
      "获取个股最新估值快照：PE(TTM)、PB、总市值、换手率、量比等（来自 daily_basic，需 2000 积分档）。",
    inputSchema: {
      type: "object",
      properties: { symbol: { type: "string", description: "6 位代码或带后缀" } },
      required: ["symbol"],
    },
    async run({ symbol }) {
      const ts = normalizeSymbol(symbol);
      const rows = await tushare("daily_basic", {
        ts_code: ts,
        start_date: todayStr(-20),
        end_date: todayStr(),
      });
      const latest = rows.sort((a, b) => (a.trade_date < b.trade_date ? 1 : -1))[0];
      if (!latest) throw new Error(`${ts} 近 20 日无 daily_basic 数据（检查积分档位）`);
      return {
        date: latest.trade_date,
        close: num(latest.close),
        pe_ttm: num(latest.pe_ttm),
        pb: num(latest.pb),
        total_mv_yi: latest.total_mv ? Math.round(Number(latest.total_mv) / 1e4) : null, // 亿元
        turnover_rate: num(latest.turnover_rate),
        volume_ratio: num(latest.volume_ratio),
      };
    },
  },
  {
    name: "get_financials",
    description:
      "获取个股财务摘要：最近若干报告期的营收/归母净利（income）与 ROE/毛利率/资产负债率/同比增速（fina_indicator）。",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string" },
        periods: { type: "number", description: "报告期数量，默认 6，最大 12" },
      },
      required: ["symbol"],
    },
    async run({ symbol, periods }) {
      const ts = normalizeSymbol(symbol);
      const n = Math.min(Math.max(Number(periods) || 6, 1), 12);
      const [inc, ind] = await Promise.all([
        tushare("income", { ts_code: ts, start_date: todayStr(-n * 200 - 400), end_date: todayStr() }),
        tushare("fina_indicator", {
          ts_code: ts,
          start_date: todayStr(-n * 200 - 400),
          end_date: todayStr(),
        }),
      ]);
      const byPeriod = new Map();
      for (const r of ind) {
        byPeriod.set(r.end_date, {
          period: r.end_date,
          roe: num(r.roe),
          grossprofit_margin: num(r.grossprofit_margin),
          netprofit_margin: num(r.netprofit_margin),
          debt_to_assets: num(r.debt_to_assets),
          netprofit_yoy: num(r.netprofit_yoy),
          or_yoy: num(r.or_yoy),
        });
      }
      for (const r of inc) {
        const e = byPeriod.get(r.end_date) || { period: r.end_date };
        e.revenue_yi = r.total_revenue ? Number((Number(r.total_revenue) / 1e8).toFixed(2)) : null;
        e.net_profit_yi = r.n_income ? Number((Number(r.n_income) / 1e8).toFixed(2)) : null;
        e.report_type = r.report_type;
        byPeriod.set(r.end_date, e);
      }
      return [...byPeriod.values()].sort((a, b) => (a.period < b.period ? 1 : -1)).slice(0, n);
    },
  },
  {
    name: "get_moneyflow",
    description: "获取个股近 10 日资金流向（主力/超大单/大单净流入，万元），来自 moneyflow 接口。",
    inputSchema: {
      type: "object",
      properties: { symbol: { type: "string" } },
      required: ["symbol"],
    },
    async run({ symbol }) {
      const ts = normalizeSymbol(symbol);
      const rows = await tushare("moneyflow", {
        ts_code: ts,
        start_date: todayStr(-25),
        end_date: todayStr(),
      });
      return rows
        .sort((a, b) => (a.trade_date < b.trade_date ? 1 : -1))
        .slice(0, 10)
        .map((r) => ({
          date: r.trade_date,
          main_net_yi: Number(
            ((num(r.buy_lg_amount) + num(r.buy_elg_amount) - num(r.sell_lg_amount) - num(r.sell_elg_amount)) / 1e4).toFixed(2),
          ),
          elg_net_yi: Number(((num(r.buy_elg_amount) - num(r.sell_elg_amount)) / 1e4).toFixed(2)),
          lg_net_yi: Number(((num(r.buy_lg_amount) - num(r.sell_lg_amount)) / 1e4).toFixed(2)),
        }));
    },
  },
  {
    name: "get_ownership",
    description: "获取个股最近报告期的十大股东（名称、持股比例、较上期变化），来自 top10_holders。",
    inputSchema: {
      type: "object",
      properties: { symbol: { type: "string" } },
      required: ["symbol"],
    },
    async run({ symbol }) {
      const ts = normalizeSymbol(symbol);
      const rows = await tushare("top10_holders", {
        ts_code: ts,
        start_date: todayStr(-370),
        end_date: todayStr(),
      });
      if (!rows.length) throw new Error(`${ts} 近一年无十大股东数据`);
      const latestPeriod = rows[0].end_date;
      return rows
        .filter((r) => r.end_date === latestPeriod)
        .map((r) => ({
          period: r.end_date,
          holder_name: r.holder_name,
          hold_ratio: num(r.hold_ratio),
          change: num(r.change),
        }));
    },
  },
];

// ===== MCP stdio JSON-RPC 协议实现 =====
function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

const PROTOCOL_VERSION = "2026-07-28";

process.stdin.setEncoding("utf8");
let buffer = "";
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (line) handleLine(line).catch((e) => log("handle error", e?.stack || e));
  }
});

async function handleLine(line) {
  let req;
  try {
    req = JSON.parse(line);
  } catch {
    return; // 非 JSON 行直接忽略
  }
  const { id, method, params } = req;
  if (method === "notifications/*") return;
  try {
    switch (method) {
      case "initialize":
        send({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: params?.protocolVersion || PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: { name: "finance", version: "1.0.0" },
          },
        });
        return;
      case "notifications/initialized":
        return;
      case "ping":
        send({ jsonrpc: "2.0", id, result: {} });
        return;
      case "tools/list":
        send({
          jsonrpc: "2.0",
          id,
          result: {
            tools: tools.map((t) => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema,
            })),
          },
        });
        return;
      case "tools/call": {
        const name = params?.name;
        const tool = tools.find((t) => t.name === name);
        if (!tool) throw new Error(`unknown tool: ${name}`);
        let data;
        try {
          data = await tool.run(params?.arguments || {});
        } catch (e) {
          send({
            jsonrpc: "2.0",
            id,
            result: { content: [{ type: "text", text: `工具执行失败：${e.message}` }], isError: true },
          });
          return;
        }
        send({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(data, null, 1) }],
          },
        });
        return;
      }
      default:
        if (id !== undefined) send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
    }
  } catch (e) {
    if (id !== undefined) {
      send({ jsonrpc: "2.0", id, error: { code: -32603, message: String(e?.message || e) } });
    }
  }
}

log("finance MCP server ready (stdio, tools:", tools.length + ")");

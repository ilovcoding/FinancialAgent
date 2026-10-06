import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { formatLogPrefix } from "@zcode/shared";
import type {
  FinanceConfig,
  FinanceConnectionTestResult,
  FinanceDailyBar,
  FinanceDailyBasic,
  FinanceSecurityBrief,
  IFinanceService,
} from "./finance.js";

const TUSHARE_API = "https://api.tushare.pro";
const MIN_CALL_INTERVAL_MS = 220;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_KEYWORD_LENGTH = 40;

const log = (...args: unknown[]) =>
  console.log(formatLogPrefix("financeService", process.pid), ...args);

/**
 * Host 侧 Tushare 客户端。与 agent 侧 finance MCP server（apps/zcode-cli/tools/finance-mcp）
 * 有意各持一份轻客户端：两者进程域不同（utilityProcess vs agent 子进程），v1 先接受这份
 * 重复换取零耦合，token 通过同一份 ~/.zcode/finance.json 保持单一事实。
 */
export function createFinanceService(): IFinanceService {
  const cache = new Map<string, { at: number; data: unknown }>();
  let lastCallAt = 0;

  function financeConfigPath(): string {
    // 与 settingService 一致：独立桌面 dev 实例用 ZCODE_DESKTOP_HOME_DIR 隔离 home。
    const home = process.env.ZCODE_DESKTOP_HOME_DIR?.trim() || process.env.HOME?.trim() || homedir();
    return join(home, ".zcode", "finance.json");
  }

  async function readToken(): Promise<string | null> {
    try {
      const raw = await readFile(financeConfigPath(), "utf8");
      const parsed = JSON.parse(raw) as { tushareToken?: unknown };
      const token = typeof parsed.tushareToken === "string" ? parsed.tushareToken.trim() : "";
      return token || null;
    } catch {
      return null;
    }
  }

  async function tushare(apiName: string, params: Record<string, unknown>): Promise<Record<string, string>[]> {
    const token = await readToken();
    if (!token) {
      throw new Error("未配置 Tushare token：请先在「设置 → 金融数据源」填写");
    }
    const cacheKey = `${apiName}:${JSON.stringify(params)}`;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data as Record<string, string>[];
    const wait = MIN_CALL_INTERVAL_MS - (Date.now() - lastCallAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastCallAt = Date.now();
    const res = await fetch(TUSHARE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_name: apiName, token, params, fields: "" }),
    });
    if (!res.ok) throw new Error(`Tushare HTTP ${res.status}`);
    const json = (await res.json()) as {
      code: number;
      msg?: string;
      data?: { fields: string[]; items: unknown[][] };
    };
    if (json.code !== 0 || !json.data) {
      throw new Error(`Tushare ${apiName} 失败: ${json.msg ?? json.code}（部分接口需要更高积分档位）`);
    }
    const rows = json.data.items.map(
      (it) =>
        Object.fromEntries(json.data!.fields.map((f, i) => [f, it[i]])) as Record<string, string>,
    );
    cache.set(cacheKey, { at: Date.now(), data: rows });
    if (cache.size > 200) {
      const first = cache.keys().next();
      if (!first.done) cache.delete(first.value);
    }
    return rows;
  }

  function normalizeSymbol(input: string): string {
    const s = input.trim().toUpperCase();
    if (/^\d{6}\.(SH|SZ)$/.test(s)) return s;
    if (/^\d{6}$/.test(s)) {
      if (s.startsWith("8") || s.startsWith("4")) throw new Error("暂不支持北交所标的");
      return `${s}.${s.startsWith("6") ? "SH" : "SZ"}`;
    }
    throw new Error(`无法识别的证券代码: ${input}`);
  }

  function todayStr(offsetDays = 0): string {
    const d = new Date(Date.now() + offsetDays * 86_400_000);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  }

  const num = (v: unknown): number | null =>
    v === null || v === undefined || v === "" ? null : Number(v);

  return {
    async getConfig(): Promise<FinanceConfig> {
      return { tushareTokenConfigured: (await readToken()) !== null };
    },

    async updateTushareToken(token: string): Promise<void> {
      const trimmed = token.trim();
      if (trimmed.length < 16) {
        throw new Error("token 长度异常（Tushare token 通常为 32 位以上十六进制串）");
      }
      const dir = join(financeConfigPath(), "..");
      await mkdir(dir, { recursive: true });
      // finance.json 只含数据源 token，不含凭据类敏感信息；原子写避免半截文件。
      const previous = await readFile(financeConfigPath(), "utf8").then(
        (raw) => JSON.parse(raw) as Record<string, unknown>,
        () => ({}) as Record<string, unknown>,
      );
      await writeFile(financeConfigPath(), `${JSON.stringify({ ...previous, tushareToken: trimmed }, null, 2)}\n`);
      cache.clear();
      log("tushare token updated");
    },

    async testConnection(): Promise<FinanceConnectionTestResult> {
      const startedAt = Date.now();
      try {
        await tushare("stock_basic", { exchange: "", list_status: "L" });
        return { ok: true, message: "连接正常", latencyMs: Date.now() - startedAt };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
          latencyMs: Date.now() - startedAt,
        };
      }
    },

    async searchSecurities(keyword: string): Promise<FinanceSecurityBrief[]> {
      const kw = keyword.trim().slice(0, MAX_KEYWORD_LENGTH);
      if (!kw) return [];
      const rows = await tushare("stock_basic", { exchange: "", list_status: "L" });
      return rows
        .filter((r) => r.name?.includes(kw) || r.ts_code?.startsWith(kw) || r.symbol === kw)
        .slice(0, 20)
        .map((r) => ({
          ts_code: r.ts_code ?? "",
          name: r.name ?? "",
          industry: r.industry || null,
          list_date: r.list_date || null,
        }));
    },

    async getDailyBars(symbol: string, limit = 120): Promise<FinanceDailyBar[]> {
      const ts = normalizeSymbol(symbol);
      const cap = Math.min(Math.max(limit, 10), 250);
      const rows = await tushare("daily", {
        ts_code: ts,
        start_date: todayStr(-cap * 2.2 - 30),
        end_date: todayStr(),
      });
      return rows
        .sort((a, b) => (a.trade_date! < b.trade_date! ? 1 : -1))
        .slice(0, cap)
        .map((r) => ({
          date: r.trade_date ?? "",
          open: num(r.open),
          high: num(r.high),
          low: num(r.low),
          close: num(r.close),
          pct_chg: num(r.pct_chg),
          volume_hand: r.vol ? Math.round(Number(r.vol) * 100) : null,
          amount_1e4_yuan: num(r.amount),
        }));
    },

    async getDailyBasic(symbol: string): Promise<FinanceDailyBasic> {
      const ts = normalizeSymbol(symbol);
      const rows = await tushare("daily_basic", {
        ts_code: ts,
        start_date: todayStr(-20),
        end_date: todayStr(),
      });
      const latest = rows.sort((a, b) => (a.trade_date! < b.trade_date! ? 1 : -1))[0];
      if (!latest) throw new Error(`${ts} 近 20 日无 daily_basic 数据（检查积分档位）`);
      return {
        date: latest.trade_date ?? "",
        close: num(latest.close),
        pe_ttm: num(latest.pe_ttm),
        pb: num(latest.pb),
        total_mv_yi: latest.total_mv ? Math.round(Number(latest.total_mv) / 1e4) : null,
        turnover_rate: num(latest.turnover_rate),
        volume_ratio: num(latest.volume_ratio),
      };
    },
  };
}

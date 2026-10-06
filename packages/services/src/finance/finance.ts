import { ServiceChannels } from "@zcode/shared";
import { createServiceDescriptor } from "../descriptors.js";

export interface FinanceSecurityBrief {
  ts_code: string;
  name: string;
  industry: string | null;
  list_date: string | null;
}

export interface FinanceDailyBar {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  pct_chg: number | null;
  /** 成交量（手） */
  volume_hand: number | null;
  /** 成交额（万元） */
  amount_1e4_yuan: number | null;
}

export interface FinanceDailyBasic {
  date: string;
  close: number | null;
  pe_ttm: number | null;
  pb: number | null;
  /** 总市值（亿元） */
  total_mv_yi: number | null;
  turnover_rate: number | null;
  volume_ratio: number | null;
}

export interface FinanceConfig {
  tushareTokenConfigured: boolean;
}

export interface FinanceConnectionTestResult {
  ok: boolean;
  message: string;
  latencyMs: number | null;
}

/** 金融工作台 UI 的数据服务。token 与 finance MCP server 共用 ~/.zcode/finance.json。 */
export interface IFinanceService {
  getConfig(): Promise<FinanceConfig>;
  updateTushareToken(token: string): Promise<void>;
  testConnection(): Promise<FinanceConnectionTestResult>;
  searchSecurities(keyword: string): Promise<FinanceSecurityBrief[]>;
  getDailyBars(symbol: string, limit?: number): Promise<FinanceDailyBar[]>;
  getDailyBasic(symbol: string): Promise<FinanceDailyBasic>;
}

export const IFinanceService = createServiceDescriptor<IFinanceService>(ServiceChannels.Finance);

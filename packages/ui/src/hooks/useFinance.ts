import { useCallback, useEffect, useState } from "react";
import type {
  FinanceDailyBar,
  FinanceDailyBasic,
  FinanceFinancialPeriod,
  FinanceIndexQuote,
  FinanceMoneyflowDay,
  FinanceSecurityBrief,
} from "@zcode/services";
import { useServices } from "./useServices.js";

export interface FinanceDataState {
  bars: FinanceDailyBar[];
  basic: FinanceDailyBasic | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** 拉取单个标的的日线与估值快照。host 未注册 financeService（旧 wire）时返回不可用错误。 */
export function useFinanceDaily(tsCode: string | null): FinanceDataState {
  const services = useServices();
  const [bars, setBars] = useState<FinanceDailyBar[]>([]);
  const [basic, setBasic] = useState<FinanceDailyBasic | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!tsCode) {
      setBars([]);
      setBasic(null);
      setError(null);
      return;
    }
    const finance = services.financeService;
    if (!finance) {
      setError("financeService 不可用：请升级客户端");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([finance.getDailyBars(tsCode, 120), finance.getDailyBasic(tsCode)])
      .then(([barData, basicData]) => {
        if (cancelled) return;
        setBars(barData);
        setBasic(basicData);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [services, tsCode, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { bars, basic, loading, error, reload };
}

export function useFinanceSearch() {
  const services = useServices();
  const [searching, setSearching] = useState(false);
  const search = useCallback(
    async (keyword: string): Promise<FinanceSecurityBrief[]> => {
      const finance = services.financeService;
      if (!finance || !keyword.trim()) return [];
      setSearching(true);
      try {
        return await finance.searchSecurities(keyword.trim());
      } finally {
        setSearching(false);
      }
    },
    [services],
  );
  return { search, searching };
}

/** 三大指数快照（host 侧 12h 缓存，工作台挂载时拉一次）。 */
export function useFinanceIndexQuotes() {
  const services = useServices();
  const [quotes, setQuotes] = useState<FinanceIndexQuote[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const finance = services.financeService;
    if (!finance) return;
    let cancelled = false;
    finance
      .getIndexQuotes()
      .then((data) => {
        if (!cancelled) setQuotes(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [services]);
  return { quotes, error };
}

/** 批量自选股迷你走势（每只 30 日收盘序列，供 sparkline 与涨跌着色）。 */
export function useFinanceWatchlistSparks(tsCodes: string[]) {
  const services = useServices();
  const [sparkByCode, setSparkByCode] = useState<Record<string, number[]>>({});
  const key = tsCodes.join(",");
  useEffect(() => {
    const finance = services.financeService;
    if (!finance || !key) {
      setSparkByCode({});
      return;
    }
    let cancelled = false;
    const codes = key.split(",");
    void (async () => {
      const next: Record<string, number[]> = {};
      // 顺序拉取：tushare 全局限流，避免并发触发 429（host 缓存 12h，仅首日慢）。
      for (const code of codes) {
        try {
          const bars = await finance.getDailyBars(code, 30);
          next[code] = bars.map((b) => b.close ?? 0).reverse().filter((v) => v > 0);
        } catch {
          next[code] = [];
        }
      }
      if (!cancelled) setSparkByCode(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [services, key]);
  return sparkByCode;
}

/** 单标的基本面（近 6 期）与资金流（近 10 日）。nonce 递增触发重拉。 */
export function useFinanceFundamentals(tsCode: string | null, nonce = 0) {
  const services = useServices();
  const [financials, setFinancials] = useState<FinanceFinancialPeriod[]>([]);
  const [moneyflow, setMoneyflow] = useState<FinanceMoneyflowDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const finance = services.financeService;
    if (!finance || !tsCode) {
      setFinancials([]);
      setMoneyflow([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([finance.getFinancials(tsCode, 6), finance.getMoneyflow(tsCode)])
      .then(([fin, flow]) => {
        if (cancelled) return;
        setFinancials(fin);
        setMoneyflow(flow);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [services, tsCode, nonce]);
  return { financials, moneyflow, loading, error };
}

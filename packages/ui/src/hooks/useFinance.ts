import { useCallback, useEffect, useState } from "react";
import type {
  FinanceDailyBar,
  FinanceDailyBasic,
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

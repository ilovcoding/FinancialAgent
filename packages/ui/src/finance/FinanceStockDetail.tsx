import { useMemo, useState } from "react";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { Loader2 } from "lucide-react";
import type {
  FinanceDailyBar,
  FinanceDailyBasic,
  FinanceFinancialPeriod,
  FinanceMoneyflowDay,
} from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { FinanceKLineChart } from "./FinanceKLineChart.js";
import { FinanceBarChart } from "./FinanceCharts.js";

interface FinanceStockDetailProps {
  name: string;
  tsCode: string;
  industry?: string | null;
  bars: FinanceDailyBar[];
  basic: FinanceDailyBasic | null;
  financials: FinanceFinancialPeriod[];
  moneyflow: FinanceMoneyflowDay[];
  fundLoading: boolean;
  fundError: string | null;
  onRetryFundamentals: () => void;
}

type DetailTab = "kline" | "fundamental" | "flow";

/** 个股详情：完整指标头 + K线/基本面/资金流三个标签页。数据全部来自 financeService（Tushare）。 */
export function FinanceStockDetail({
  name,
  tsCode,
  industry,
  bars,
  basic,
  financials,
  moneyflow,
  fundLoading,
  fundError,
  onRetryFundamentals,
}: FinanceStockDetailProps) {
  const { intl } = useZCodeIntl();
  const t = (id: string) => intl.formatMessage({ id });
  const [tab, setTab] = useState<DetailTab>("kline");

  const latest = bars[0];
  const prevClose = bars[1]?.close ?? null;
  const pct =
    latest?.pct_chg ??
    (latest?.close && prevClose ? ((latest.close - prevClose) / prevClose) * 100 : null);
  const priceUp = (pct ?? 0) >= 0;

  const stat = (k: string, v: string | null, tone?: "up" | "down") => (
    <div key={k}>
      <div className="text-ui-xs text-foreground-subtlest">{k}</div>
      <div
        className={`font-mono text-ui-sm ${
          tone === "up" ? "text-destructive" : tone === "down" ? "text-success" : "text-foreground"
        }`}
      >
        {v ?? "—"}
      </div>
    </div>
  );

  const revenueBars = useMemo(
    () =>
      [...financials]
        .reverse()
        .map((f) => ({
          label: f.period.replace(/^\d{4}(\d{2})(\d{2})$/, "$1Q"),
          value: f.revenueYi,
        })),
    [financials],
  );
  const profitBars = useMemo(
    () =>
      [...financials]
        .reverse()
        .map((f) => ({
          label: f.period.replace(/^\d{4}(\d{2})(\d{2})$/, "$1Q"),
          value: f.netProfitYi,
        })),
    [financials],
  );
  const flowBars = useMemo(
    () =>
      [...moneyflow]
        .reverse()
        .map((m) => ({ label: m.date.replace(/^(\d{4})(\d{2})(\d{2})$/, "$2-$3"), value: m.mainNetYi })),
    [moneyflow],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pt-4">
        <h2 className="text-ui-lg font-bold text-foreground">{name}</h2>
        <span className="font-mono text-ui-sm text-foreground-subtle">{tsCode}</span>
        {industry ? (
          <span className="rounded-full bg-surface px-2 py-0.5 text-ui-xs text-foreground-subtle">
            {industry}
          </span>
        ) : null}
        <div className="ml-auto flex items-baseline gap-2">
          <span className={`font-mono text-ui-xl font-bold ${priceUp ? "text-destructive" : "text-success"}`}>
            {latest?.close?.toFixed(2) ?? "—"}
          </span>
          <span className={`font-mono text-ui-sm ${priceUp ? "text-destructive" : "text-success"}`}>
            {pct === null ? "" : `${priceUp ? "+" : ""}${pct.toFixed(2)}%`}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 px-5 py-3">
        {stat(t("finance.stat.open"), latest?.open?.toFixed(2) ?? null)}
        {stat(t("finance.stat.prevClose"), prevClose?.toFixed(2) ?? null)}
        {stat(t("finance.stat.high"), latest?.high?.toFixed(2) ?? null, "up")}
        {stat(t("finance.stat.low"), latest?.low?.toFixed(2) ?? null, "down")}
        {stat(
          t("finance.stat.volume"),
          latest?.volume_hand != null ? `${(latest.volume_hand / 1e4).toFixed(2)}万手` : null,
        )}
        {stat(
          t("finance.stat.amount"),
          latest?.amount_1e4_yuan != null ? `${(latest.amount_1e4_yuan / 1e4).toFixed(1)}亿` : null,
        )}
        {stat("PE(TTM)", basic?.pe_ttm != null ? basic.pe_ttm.toFixed(1) : null)}
        {stat("PB", basic?.pb != null ? basic.pb.toFixed(2) : null)}
        {stat(
          t("finance.marketCap"),
          basic?.total_mv_yi != null ? `${(basic.total_mv_yi / 1e4).toFixed(2)}万亿` : null,
        )}
        {stat(
          t("finance.turnoverRate"),
          basic?.turnover_rate != null ? `${basic.turnover_rate.toFixed(2)}%` : null,
        )}
      </div>

      <div className="flex gap-1 border-b border-border px-5">
        {(
          [
            ["kline", "finance.dailyK"],
            ["fundamental", "finance.tab.fundamental"],
            ["flow", "finance.tab.flow"],
          ] as Array<[DetailTab, string]>
        ).map(([key, id]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-3.5 py-2 text-ui-sm ${
              tab === key
                ? "border-foreground text-foreground"
                : "border-transparent text-foreground-subtle hover:text-foreground"
            }`}
          >
            {t(id)}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {tab === "kline" ? (
          <div className="rounded-xl border border-card-border bg-card">
            <div className="flex items-center gap-3 border-b border-card-border px-3 py-2">
              <span className="text-ui-sm font-medium text-foreground">{t("finance.dailyK")}</span>
              <span className="text-ui-xs text-foreground-subtlest">{t("finance.unadjusted")}</span>
              <span className="ml-auto text-ui-xs text-foreground-subtlest">{t("finance.dataSourceNote")}</span>
            </div>
            <div className="px-2 py-2">
              <FinanceKLineChart bars={bars} />
            </div>
          </div>
        ) : null}

        {tab === "fundamental" ? (
          fundLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-foreground-subtlest" />
            </div>
          ) : fundError ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-ui-sm text-foreground-subtle">
              <span>
                {t("finance.loadError")}：{fundError}
              </span>
              <Button variant="outline" size="sm" onClick={onRetryFundamentals}>
                {t("finance.retry")}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
                {[
                  { k: t("finance.fin.revenue"), v: financials[0]?.revenueYi, unit: "亿" },
                  { k: t("finance.fin.netProfit"), v: financials[0]?.netProfitYi, unit: "亿" },
                  {
                    k: "ROE",
                    v: financials[0]?.roe != null ? financials[0].roe : null,
                    unit: "%",
                  },
                  {
                    k: t("finance.fin.grossMargin"),
                    v: financials[0]?.grossMargin != null ? financials[0].grossMargin : null,
                    unit: "%",
                  },
                ].map(({ k, v, unit }) => (
                  <div key={k} className="rounded-xl border border-card-border bg-card p-3">
                    <div className="text-ui-xs text-foreground-subtlest">{k}</div>
                    <div className="font-mono text-ui-lg font-semibold text-foreground">
                      {v != null ? `${v}${unit}` : "—"}
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-card-border bg-card p-3">
                  <div className="mb-1.5 text-ui-xs text-foreground-subtlest">
                    {t("finance.fin.revenueTrend")}
                  </div>
                  <FinanceBarChart data={revenueBars} formatValue={(v) => v.toFixed(0)} />
                </div>
                <div className="rounded-xl border border-card-border bg-card p-3">
                  <div className="mb-1.5 text-ui-xs text-foreground-subtlest">
                    {t("finance.fin.profitTrend")}
                  </div>
                  <FinanceBarChart data={profitBars} formatValue={(v) => v.toFixed(0)} />
                </div>
              </div>
            </div>
          )
        ) : null}

        {tab === "flow" ? (
          <div className="rounded-xl border border-card-border bg-card p-3">
            <div className="mb-1.5 text-ui-xs text-foreground-subtlest">{t("finance.flow.title")}</div>
            {flowBars.length > 1 ? (
              <FinanceBarChart data={flowBars} height={130} formatValue={(v) => v.toFixed(1)} />
            ) : (
              <div className="flex h-32 items-center justify-center text-ui-sm text-foreground-subtlest">
                {t("finance.flow.empty")}
              </div>
            )}
            <div className="mt-2 flex gap-5 text-ui-xs text-foreground-subtle">
              {(() => {
                const latest = moneyflow[0];
                if (!latest) return null;
                return [
                  { k: t("finance.flow.main"), v: latest.mainNetYi },
                  { k: t("finance.flow.elg"), v: latest.elgNetYi },
                  { k: t("finance.flow.lg"), v: latest.lgNetYi },
                ].map(({ k, v }) => (
                  <span key={k}>
                    {k}（{latest.date.replace(/^(\d{4})(\d{2})(\d{2})$/, "$2-$3")}）：
                    <b className={`font-mono ${(v ?? 0) >= 0 ? "text-destructive" : "text-success"}`}>
                      {(v ?? 0) >= 0 ? "+" : ""}
                      {v ?? "—"}亿
                    </b>
                  </span>
                ));
              })()}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

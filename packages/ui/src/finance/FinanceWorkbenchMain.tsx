import { useCallback, useState } from "react";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { Search, Plus, X, Loader2, Play, ShieldAlert, Settings, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useFinanceStore } from "@/store/financeStore.js";
import {
  useFinanceDaily,
  useFinanceSearch,
  useFinanceIndexQuotes,
  useFinanceWatchlistSparks,
  useFinanceFundamentals,
} from "@/hooks/useFinance.js";
import { FinanceSparkline } from "./FinanceCharts.js";
import { FinanceStockDetail } from "./FinanceStockDetail.js";

interface FinanceWorkbenchMainProps {
  /** 只预填会话草稿，不自动发送；与「判断归人」的合规设计一致。 */
  onCreateTask: (options: { initialPrompt: string }) => void;
  /** 首次使用引导：跳设置页配 token。 */
  onOpenSettings?: () => void;
}

/**
 * 金融工作台主视图：指数条 + 自选股（含迷你走势）+ 个股详情（K线/基本面/资金流）+ AI 研究入口。
 * 数据全部来自 host 侧 financeService（Tushare 本地直连）；研究指令经 onCreateTask
 * 预填到当前会话，由 agent 侧 finance MCP 工具 + finance skills 执行。
 */
export function FinanceWorkbenchMain({ onCreateTask, onOpenSettings }: FinanceWorkbenchMainProps) {
  const { intl } = useZCodeIntl();
  const t = (id: string) => intl.formatMessage({ id });
  const watchlist = useFinanceStore((s) => s.watchlist);
  const selectedTsCode = useFinanceStore((s) => s.selectedTsCode);
  const addWatch = useFinanceStore((s) => s.addWatch);
  const removeWatch = useFinanceStore((s) => s.removeWatch);
  const setSelected = useFinanceStore((s) => s.setSelected);
  const [keyword, setKeyword] = useState("");
  const { search, searching } = useFinanceSearch();
  const [results, setResults] = useState<Awaited<ReturnType<typeof search>>>([]);
  const selected = watchlist.find((it) => it.tsCode === selectedTsCode) ?? null;
  const { bars, basic, loading, error, reload } = useFinanceDaily(selectedTsCode);
  const { quotes: indexQuotes } = useFinanceIndexQuotes();
  const sparkByCode = useFinanceWatchlistSparks(watchlist.map((it) => it.tsCode));
  const [fundNonce, setFundNonce] = useState(0);
  const { financials, moneyflow, loading: fundLoading, error: fundError } = useFinanceFundamentals(
    selectedTsCode,
    fundNonce,
  );

  const handleSearch = useCallback(async () => {
    const found = await search(keyword);
    setResults(found);
  }, [keyword, search]);

  const sendPrompt = useCallback(
    (prompt: string) => {
      onCreateTask({ initialPrompt: prompt });
    },
    [onCreateTask],
  );
  const symbol = selected ? `${selected.tsCode.split(".")[0]}（${selected.name}）` : "";

  return (
    <div className="flex h-full min-h-0 w-full">
      {/* 自选股列 */}
      <aside className="flex w-60 min-h-0 flex-col border-r border-border bg-background">
        {/* 指数条 */}
        <div className="flex flex-col gap-0.5 border-b border-border px-2 py-2">
          {indexQuotes.length > 0
            ? indexQuotes.map((q) => (
                <div key={q.tsCode} className="flex items-center justify-between rounded-lg px-2 py-1">
                  <span className="text-ui-sm text-foreground-subtle">{q.name}</span>
                  <span className="flex items-baseline gap-1.5">
                    <span className="font-mono text-ui-sm text-foreground-strong">
                      {q.close?.toFixed(2) ?? "—"}
                    </span>
                    <span
                      className={`font-mono text-ui-xs ${
                        (q.pctChg ?? 0) >= 0 ? "text-destructive" : "text-success"
                      }`}
                    >
                      {q.pctChg != null ? `${q.pctChg >= 0 ? "+" : ""}${q.pctChg.toFixed(2)}%` : ""}
                    </span>
                  </span>
                </div>
              ))
            : null}
        </div>

        <div className="flex items-center gap-2 px-3 pt-3 pb-2">
          <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-input-border bg-input px-2">
            <Search className="size-3.5 shrink-0 text-foreground-subtlest" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSearch();
              }}
              placeholder={t("finance.searchPlaceholder")}
              className="w-full bg-transparent text-ui-sm text-foreground outline-none placeholder:text-foreground-subtlest"
              data-testid="finance-search-input"
            />
            {searching ? <Loader2 className="size-3.5 shrink-0 animate-spin" /> : null}
          </div>
        </div>
        {results.length > 0 ? (
          <div className="max-h-52 overflow-y-auto px-2 pb-2">
            {results.map((r) => (
              <button
                key={r.ts_code}
                type="button"
                onClick={() => {
                  addWatch({ tsCode: r.ts_code, name: r.name, industry: r.industry });
                  setResults([]);
                  setKeyword("");
                }}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-ui-sm hover:bg-hover"
              >
                <span className="min-w-0 truncate text-foreground">
                  {r.name}
                  <span className="ml-1.5 font-mono text-ui-xs text-foreground-subtlest">{r.ts_code}</span>
                </span>
                <Plus className="size-3.5 shrink-0 text-foreground-subtle" />
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex items-center justify-between px-3 py-1">
          <span className="text-ui-sm font-semibold text-foreground">{t("finance.watchlist")}</span>
          <span className="text-ui-xs text-foreground-subtlest">{watchlist.length}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {watchlist.length === 0 ? (
            <p className="px-2 py-4 text-ui-xs leading-relaxed text-foreground-subtlest">
              {t("finance.noWatchlist")}
            </p>
          ) : (
            watchlist.map((it) => {
              const spark = sparkByCode[it.tsCode] ?? [];
              const first = spark[0] ?? 0;
              const last = spark[spark.length - 1] ?? 0;
              const up = last >= first;
              return (
                <div
                  key={it.tsCode}
                  className={`group flex items-center rounded-lg px-2 py-1.5 ${
                    it.tsCode === selectedTsCode ? "bg-selected" : "hover:bg-hover"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelected(it.tsCode)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="truncate text-ui-sm text-foreground">{it.name}</div>
                    <div className="font-mono text-ui-xs text-foreground-subtlest">{it.tsCode}</div>
                  </button>
                  <div
                    // A 股红涨绿跌：sparkline 与 K 线共用语义色。
                    style={
                      {
                        "--finance-up": "var(--color-destructive)",
                        "--finance-down": "var(--color-success)",
                      } as React.CSSProperties
                    }
                  >
                    <FinanceSparkline values={spark} up={up} />
                  </div>
                  <button
                    type="button"
                    aria-label={t("finance.removeWatch")}
                    onClick={() => removeWatch(it.tsCode)}
                    className="ml-1.5 hidden shrink-0 rounded p-1 text-foreground-subtlest hover:bg-hover group-hover:block"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* 个股详情 / 空态引导 */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-background">
        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
            <h3 className="text-ui-lg font-bold text-foreground">{t("finance.empty.guideTitle")}</h3>
            <p className="text-ui-sm text-foreground-subtle">{t("finance.empty.guideSub")}</p>
            <ol className="flex w-full max-w-md flex-col gap-2">
              {["finance.empty.step1", "finance.empty.step2", "finance.empty.step3"].map((id, i) => (
                <li
                  key={id}
                  className="flex items-center gap-3 rounded-xl border border-card-border bg-card px-4 py-3"
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface text-ui-sm font-semibold text-foreground-subtle">
                    {i + 1}
                  </span>
                  <span className="text-ui-sm text-foreground">{t(id)}</span>
                </li>
              ))}
            </ol>
            {onOpenSettings ? (
              <Button variant="outline" size="sm" onClick={onOpenSettings}>
                <Settings className="size-3.5" />
                {t("finance.empty.goSettings")}
              </Button>
            ) : null}
          </div>
        ) : loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-foreground-subtlest" />
          </div>
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-ui-sm text-foreground-subtle">
            <span>
              {t("finance.loadError")}：{error}
            </span>
            <Button variant="outline" size="sm" onClick={reload}>
              {t("finance.retry")}
            </Button>
          </div>
        ) : (
          <FinanceStockDetail
            name={selected.name}
            tsCode={selected.tsCode}
            industry={selected.industry}
            bars={bars}
            basic={basic}
            financials={financials}
            moneyflow={moneyflow}
            fundLoading={fundLoading}
            fundError={fundError}
            onRetryFundamentals={() => setFundNonce((n) => n + 1)}
          />
        )}
      </section>

      {/* AI 研究面板 */}
      <aside className="flex w-72 min-h-0 flex-col gap-3 overflow-y-auto border-l border-border bg-background p-3.5">
        <div className="rounded-xl border border-card-border bg-card p-3.5">
          <h3 className="mb-1 flex items-center gap-1.5 text-ui-sm font-semibold text-foreground">
            <MessageSquare className="size-3.5" />
            {t("finance.deepResearch")}
            {selected ? ` · ${selected.name}` : ""}
          </h3>
          <p className="mb-3 text-ui-xs leading-relaxed text-foreground-subtle">
            {t("finance.deepResearchHint")}
          </p>
          <Button
            className="w-full"
            size="sm"
            disabled={!selected}
            onClick={() => sendPrompt(intl.formatMessage({ id: "finance.prompt.deep" }, { symbol }))}
            data-testid="finance-deep-research-btn"
          >
            <Play className="size-3.5" />
            {t("finance.deepResearch")}
          </Button>
          <p className="mt-2 text-center text-ui-xs text-foreground-subtlest">{t("finance.prefillHint")}</p>
        </div>

        <div className="rounded-xl border border-card-border bg-card p-3.5">
          <h3 className="mb-2 text-ui-sm font-semibold text-foreground">{t("finance.quickResearch")}</h3>
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: "finance.quick.fundamental", promptId: "finance.prompt.quick" },
              { id: "finance.quick.report", promptId: "finance.prompt.report" },
              { id: "finance.quick.news", promptId: "finance.prompt.news" },
            ].map(({ id, promptId }) => (
              <button
                key={id}
                type="button"
                disabled={!selected}
                onClick={() => sendPrompt(intl.formatMessage({ id: promptId }, { symbol }))}
                className="rounded-full border border-border px-2.5 py-1 text-ui-xs text-foreground-subtle hover:bg-hover hover:text-foreground disabled:opacity-50"
              >
                {t(id)}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-auto flex gap-2 rounded-lg bg-surface p-2.5 text-ui-xs leading-relaxed text-foreground-subtle">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>{t("finance.compliance")}</span>
        </div>
      </aside>
    </div>
  );
}

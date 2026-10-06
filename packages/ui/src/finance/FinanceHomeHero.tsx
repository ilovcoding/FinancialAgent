import { useCallback } from "react";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { LineChart, Search, CalendarClock, Zap, ArrowRight } from "lucide-react";
import { useTabStoreApi } from "@/store/TabStoreProvider.js";
import { useZCodeSessionStore } from "@/store/zcodeSessionStore.js";
import { useFinanceIndexQuotes } from "@/hooks/useFinance.js";

/** 首页导航事件：由 App 层监听并切换 workspace 主视图（金融工作台/研究任务）。 */
export const FAGENT_NAVIGATE_EVENT = "fagent:navigate";
export type FagentNavigateView = "finance" | "automations";
export function dispatchFagentNavigate(view: FagentNavigateView) {
  window.dispatchEvent(new CustomEvent<{ view: FagentNavigateView }>(FAGENT_NAVIGATE_EVENT, { detail: { view } }));
}
export function addFagentNavigateListener(handler: (view: FagentNavigateView) => void) {
  const listener = (event: Event) => {
    const view = (event as CustomEvent<{ view: FagentNavigateView }>).detail?.view;
    if (view === "finance" || view === "automations") handler(view);
  };
  window.addEventListener(FAGENT_NAVIGATE_EVENT, listener);
  return () => window.removeEventListener(FAGENT_NAVIGATE_EVENT, listener);
}

/**
 * 会话首页 Hero：产品定位语（让 AI 理解金融数据）+ 今日指数 + 核心功能入口。
 * 快捷/深度研究点击后把指令预填进当前输入框（确认后执行，判断归人）；
 * 工作台/研究任务通过导航事件切换主视图。
 */
export function FinanceHomeHero({ greeting }: { greeting: string }) {
  const { intl } = useZCodeIntl();
  const t = (id: string) => intl.formatMessage({ id });
  const tabStoreApi = useTabStoreApi();
  const { quotes } = useFinanceIndexQuotes();

  const prefillPrompt = useCallback(
    (promptId: string) => {
      const state = tabStoreApi.getState();
      const workspacePath = state.activeWorkspacePath;
      if (!workspacePath) return;
      useZCodeSessionStore
        .getState()
        .requestComposerTextInsert(workspacePath, intl.formatMessage({ id: promptId }));
    },
    [intl, tabStoreApi],
  );

  const cards = [
    {
      key: "quick",
      icon: Zap,
      titleId: "finance.home.card.quick",
      descId: "finance.home.card.quickDesc",
      actionId: "finance.home.card.quickAction",
      run: () => prefillPrompt("finance.prompt.quick"),
    },
    {
      key: "deep",
      icon: Search,
      titleId: "finance.home.card.deep",
      descId: "finance.home.card.deepDesc",
      actionId: "finance.home.card.deepAction",
      run: () => prefillPrompt("finance.prompt.deep"),
    },
    {
      key: "workbench",
      icon: LineChart,
      titleId: "finance.home.card.workbench",
      descId: "finance.home.card.workbenchDesc",
      actionId: "finance.home.card.workbenchAction",
      run: () => dispatchFagentNavigate("finance"),
    },
    {
      key: "tasks",
      icon: CalendarClock,
      titleId: "finance.home.card.tasks",
      descId: "finance.home.card.tasksDesc",
      actionId: "finance.home.card.tasksAction",
      run: () => dispatchFagentNavigate("automations"),
    },
  ];

  return (
    <div className="relative z-10 flex w-full flex-col items-center gap-5">
      {/* 问候语（弱化）+ 产品定位语 */}
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-ui-sm text-foreground-subtle">{greeting}</p>
        <h1 className="text-ui-xl font-bold tracking-wide text-foreground sm:text-[28px] sm:leading-[1.25]">
          {t("finance.home.slogan")}
        </h1>
        <p className="max-w-lg text-ui-sm leading-relaxed text-foreground-subtle">
          {t("finance.home.sloganSub")}
        </p>
      </div>

      {/* 今日指数 */}
      {quotes.length > 0 ? (
        <div className="flex items-center gap-6 rounded-xl border border-card-border bg-card px-5 py-2.5">
          {quotes.map((q) => (
            <div key={q.tsCode} className="flex flex-col items-center gap-0.5">
              <span className="text-ui-xs text-foreground-subtlest">{q.name}</span>
              <span className="flex items-baseline gap-1.5">
                <span className="font-mono text-ui-sm font-semibold text-foreground">
                  {q.close?.toFixed(2) ?? "—"}
                </span>
                <span
                  className={`font-mono text-ui-xs ${(q.pctChg ?? 0) >= 0 ? "text-destructive" : "text-success"}`}
                >
                  {q.pctChg != null ? `${q.pctChg >= 0 ? "+" : ""}${q.pctChg.toFixed(2)}%` : ""}
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {/* 核心功能卡 */}
      <div className="grid w-full max-w-3xl grid-cols-2 gap-3 px-2 md:grid-cols-4">
        {cards.map(({ key, icon: Icon, titleId, descId, actionId, run }) => (
          <button
            key={key}
            type="button"
            onClick={run}
            className="group flex flex-col items-start gap-2 rounded-xl border border-card-border bg-card p-4 text-left transition-colors hover:border-border-hover hover:bg-surface-hover"
            data-testid={`finance-home-card-${key}`}
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-surface text-foreground-subtle">
              <Icon className="size-4" />
            </span>
            <span className="text-ui-sm font-semibold text-foreground">{t(titleId)}</span>
            <span className="text-ui-xs leading-relaxed text-foreground-subtle">{t(descId)}</span>
            <span className="mt-auto flex items-center gap-1 pt-1 text-ui-xs text-foreground-subtle group-hover:text-foreground">
              {t(actionId)}
              <ArrowRight className="size-3" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

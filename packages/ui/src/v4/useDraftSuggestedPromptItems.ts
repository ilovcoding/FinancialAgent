import { useEffect, useMemo } from "react";
import type { IClientScenesService } from "@zcode/services";
import {
  isClientScenesBusinessError,
  useClientScenesResource,
} from "@/hooks/useClientScenesResource.js";
import { logger } from "@/logger.js";
import { FINANCE_PRODUCT } from "@/lib/productMode.js";
import {
  DRAFT_SUGGESTED_PROMPT_NAVIGATE_AUTOMATIONS,
  mapClientScenesToDraftSuggestedPromptItems,
  type DraftSuggestedPromptItem,
} from "@/v4/draftSuggestedPromptItems.js";

/**
 * 金融研究形态的内置推荐任务。
 * 通用形态的推荐由 client-scenes 远端下发（代码周报、插件任务等）；
 * 金融客户端不请求远端场景，直接使用本地金融研究推荐，
 * 保证推荐内容与产品形态一致且离线可展示。
 */
const FINANCE_DRAFT_SUGGESTED_PROMPTS: DraftSuggestedPromptItem[] = [
  {
    id: "finance-quick-snapshot",
    iconName: "LineChart",
    label: { cn: "基本面速览", en: "Fundamentals snapshot" },
    prompt: {
      cn: "基本面速览 贵州茅台（使用 finance-quick-research 技能）",
      en: "Fundamentals snapshot of Kweichow Moutai 600519 (use the finance-quick-research skill)",
    },
  },
  {
    id: "finance-deep-research",
    iconName: "Search",
    label: { cn: "深度研究", en: "Deep research" },
    prompt: {
      cn: "深度研究 宁德时代 300750（使用 finance-deep-research 技能）",
      en: "Deep research on CATL 300750 (use the finance-deep-research skill)",
    },
  },
  {
    id: "finance-news-sentiment",
    iconName: "Newspaper",
    label: { cn: "新闻情绪综述", en: "News sentiment" },
    prompt: {
      cn: "综述近 7 日白酒板块的新闻与公告情绪倾向，标注来源（可配合 WebSearch）",
      en: "Summarize recent 7-day news sentiment for the liquor sector with sources (WebSearch allowed)",
    },
  },
  {
    id: "finance-compare",
    iconName: "Scale",
    label: { cn: "对比研究", en: "Compare" },
    prompt: {
      cn: "对比贵州茅台与五粮液的基本面、估值与资金面（使用 finance-quick-research 技能）",
      en: "Compare Kweichow Moutai vs Wuliangye on fundamentals, valuation and flows (finance-quick-research)",
    },
  },
  {
    id: "finance-watchlist-alert",
    iconName: "BellRing",
    label: { cn: "创建盯盘任务", en: "Watchlist alert" },
    prompt: {
      cn: "检查自选股今日收盘异动（放量突破、跌破止损位、主力资金突变），生成简评并关联最近深研报告",
      en: "Check today's watchlist anomalies (breakouts, stop-loss breaks, flow spikes) and link the latest report",
    },
    actions: [DRAFT_SUGGESTED_PROMPT_NAVIGATE_AUTOMATIONS],
  },
];

export function useDraftSuggestedPromptItems({
  clientScenesService,
  rpcReady,
  workspaceKey,
}: {
  clientScenesService: IClientScenesService;
  rpcReady: boolean;
  workspaceKey: string;
}): DraftSuggestedPromptItem[] {
  const clientScenes = useClientScenesResource(clientScenesService, {
    enabled: rpcReady && !FINANCE_PRODUCT,
  });

  useEffect(() => {
    const error = clientScenes.error;
    if (!error) return;
    if (isClientScenesBusinessError(error)) {
      logger.warn("[v4-suggested-prompts] Client scenes 返回失败，推荐列表保持为空", {
        code: error.code,
        message: error.responseMessage,
        workspaceKey,
      });
      return;
    }
    logger.warn("[v4-suggested-prompts] Client scenes 请求失败，推荐列表保持为空", {
      error: error.message,
      workspaceKey,
    });
  }, [clientScenes.error, workspaceKey]);

  return useMemo(
    () =>
      FINANCE_PRODUCT
        ? FINANCE_DRAFT_SUGGESTED_PROMPTS
        : mapClientScenesToDraftSuggestedPromptItems(clientScenes.scenes),
    [clientScenes.scenes],
  );
}

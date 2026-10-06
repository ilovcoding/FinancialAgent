import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface FinanceWatchItem {
  tsCode: string;
  name: string;
  industry?: string | null;
}

interface FinanceStoreState {
  /** 自选股列表；本地持久化，不与服务端事实混存。 */
  watchlist: FinanceWatchItem[];
  selectedTsCode: string | null;
  addWatch: (item: FinanceWatchItem) => void;
  removeWatch: (tsCode: string) => void;
  setSelected: (tsCode: string | null) => void;
}

const DEDUP = (items: FinanceWatchItem[], item: FinanceWatchItem): FinanceWatchItem[] =>
  items.some((it) => it.tsCode === item.tsCode) ? items : [item, ...items].slice(0, 50);

export const useFinanceStore = create<FinanceStoreState>()(
  persist(
    (set) => ({
      watchlist: [],
      selectedTsCode: null,
      addWatch: (item) =>
        set((state) => ({
          watchlist: DEDUP(state.watchlist, item),
          selectedTsCode: state.selectedTsCode ?? item.tsCode,
        })),
      removeWatch: (tsCode) =>
        set((state) => {
          const watchlist = state.watchlist.filter((it) => it.tsCode !== tsCode);
          return {
            watchlist,
            selectedTsCode:
              state.selectedTsCode === tsCode ? (watchlist[0]?.tsCode ?? null) : state.selectedTsCode,
          };
        }),
      setSelected: (tsCode) => set({ selectedTsCode: tsCode }),
    }),
    { name: "zcode-finance-store", storage: createJSONStorage(() => localStorage) },
  ),
);

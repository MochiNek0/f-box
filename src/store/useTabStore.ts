import { create } from "zustand";

export interface Tab {
  id: string;
  title: string;
  url: string;
  isLibrary: boolean;
  zoomFactor: number;
}

interface TabState {
  tabs: Tab[];
  activeTabId: string;
  addTab: () => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  loadGame: (id: string, title: string, url: string) => void;
  backToLibrary: (id: string) => void;
  updateZoom: (id: string, factor: number) => void;
  gameZoomFactors: Record<string, number>;
  globalZoomFactor: number;
}

const DEFAULT_TAB_ID = "tab-1";

export const useTabStore = create<TabState>((set) => ({
  tabs: [
    {
      id: DEFAULT_TAB_ID,
      title: "游戏库",
      url: "",
      isLibrary: true,
      zoomFactor: 1,
    },
  ],
  activeTabId: DEFAULT_TAB_ID,
  gameZoomFactors: {},
  globalZoomFactor: 1,

  addTab: () => {
    const newId = `tab-${Date.now()}`;
    set((state) => ({
      // Inherit current active tab zoom so opening a new tab does not visually jump.
      // Fallback to 1 when active tab is unexpectedly missing.
      // This keeps zoom behavior consistent with most browsers.
      tabs: [
        ...state.tabs,
        {
          id: newId,
          title: "游戏库",
          url: "",
          isLibrary: true,
          zoomFactor:
            state.tabs.find((t) => t.id === state.activeTabId)?.zoomFactor || 1,
        },
      ],
      activeTabId: newId,
    }));
  },

  closeTab: (id) => {
    set((state) => {
      if (state.tabs.length === 1) return state; // Keep at least one tab
      const newTabs = state.tabs.filter((t) => t.id !== id);
      const newActiveId =
        state.activeTabId === id
          ? newTabs[newTabs.length - 1].id
          : state.activeTabId;
      return { tabs: newTabs, activeTabId: newActiveId };
    });
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  loadGame: (id, title, url) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id
          ? {
              ...t,
              title,
              url,
              isLibrary: false,
              zoomFactor: state.gameZoomFactors[url] || state.globalZoomFactor,
            }
          : t,
      ),
    }));
  },

  backToLibrary: (id) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id
          ? { ...t, title: "游戏库", url: "", isLibrary: true, zoomFactor: 1 }
          : t,
      ),
    }));
  },

  updateZoom: (id, factor) => {
    set((state) => {
      const tab = state.tabs.find((t) => t.id === id);
      const newGameZoomFactors =
        tab && !tab.isLibrary && tab.url
          ? { ...state.gameZoomFactors, [tab.url]: factor }
          : state.gameZoomFactors;

      const newGlobalZoomFactor =
        tab && !tab.isLibrary ? factor : state.globalZoomFactor;

      return {
        tabs: state.tabs.map((t) =>
          t.id === id ? { ...t, zoomFactor: factor } : t,
        ),
        gameZoomFactors: newGameZoomFactors,
        globalZoomFactor: newGlobalZoomFactor,
      };
    });
  },
}));

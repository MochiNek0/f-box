// Imperative registry mapping a tab id to a live geometry getter for its game
// <webview>. Used by the record/play flows to obtain the active game surface
// geometry at the moment automation starts (fresh, so window move/resize/zoom
// are reflected). Not reactive — it's called imperatively, so a plain module
// singleton avoids needless re-renders.
import type { GameGeometry } from "../types/electron";
import { useTabStore } from "./useTabStore";

type GeometryGetter = () => GameGeometry | null;

const registry = new Map<string, GeometryGetter>();

export function registerGameView(tabId: string, getGeometry: GeometryGetter) {
  registry.set(tabId, getGeometry);
}

export function unregisterGameView(tabId: string) {
  registry.delete(tabId);
}

export function getGeometryForTab(tabId: string): GameGeometry | null {
  const getter = registry.get(tabId);
  return getter ? getter() : null;
}

// Game tabs whose <webview> is ready, in tab-bar order. Instance slots of a
// multi-instance (双开) script are positions in THIS list, so recording and
// playback must derive them the same way.
function liveGameTabs(): { id: string; geometry: GameGeometry }[] {
  return useTabStore
    .getState()
    .tabs.filter((t) => !t.isLibrary)
    .map((t) => ({ id: t.id, geometry: getGeometryForTab(t.id) }))
    .filter((e): e is { id: string; geometry: GameGeometry } => !!e.geometry);
}

// Fresh geometry of every live game tab in tab-bar order, plus where the
// active tab sits in it — the instance a script's slot 0 binds to.
export function getGameTargets(): {
  targets: GameGeometry[];
  activeIndex: number;
} {
  const { activeTabId } = useTabStore.getState();
  const entries = liveGameTabs();
  return {
    targets: entries.map((e) => e.geometry),
    activeIndex: Math.max(
      0,
      entries.findIndex((e) => e.id === activeTabId),
    ),
  };
}

// Tab-bar position of a game tab among the live ones; -1 when it has no
// ready webview (the game library, or a guest that hasn't loaded yet).
export function getGameTabIndex(tabId: string): number {
  return liveGameTabs().findIndex((e) => e.id === tabId);
}

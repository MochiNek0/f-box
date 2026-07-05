// Imperative registry mapping a tab id to a live geometry getter for its game
// <webview>. Used by the record/play flows to obtain the active game surface
// geometry at the moment automation starts (fresh, so window move/resize/zoom
// are reflected). Not reactive — it's called imperatively, so a plain module
// singleton avoids needless re-renders.
import type { GameGeometry } from "../types/electron";

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

// =====================================================================
// Coordinate geometry for background (isolated) automation playback.
//
// Mouse coordinates are stored as a NORMALIZED fraction (nx, ny) of the
// on-screen game surface, then re-mapped to guest-webview coordinates at play
// time (window-position/size independent). The renderer records nx/ny
// directly (overlay-relative) and builds the meta sentinel itself; this
// module holds the play-time mapping plus the shared schema definitions.
// =====================================================================

// Bumped when the stored script schema changes in a way that affects
// isolation playback.
// v2 = adds the `meta` sentinel + per-mouse-event nx/ny (AHK recorder,
//      post-processed from screen-absolute coordinates).
// v3 = recorded by the renderer overlay: native nx/ny, `key` holds an
//      Electron keyCode (no vk/sc).
// v4 = multi-instance ("双开"): the meta sentinel carries one geometry per
//      instance SLOT in `targets` plus each slot's tab position in
//      `slotOffsets`, and the event stream may contain `switch` events that
//      move every following input to another slot. Slot 0 stays in
//      `geometry`, so single-instance scripts are shaped exactly like v3.
// Must stay in sync with the renderer's SCRIPT_VERSION in
// src/store/useRecordingStore.ts.
export const SCRIPT_VERSION = 4;

export interface GameGeometry {
  // Guest <webview> WebContents id (webContents.fromId).
  webContentsId: number;
  // Guest surface size in guest-CSS px (the webview's width/height attrs).
  renderWidth: number;
  renderHeight: number;
  zoomFactor: number;
  resolutionScale: number;
  devicePixelRatio: number;
  // On-screen rectangle of the DISPLAYED game surface, in PHYSICAL screen
  // pixels — matches the space WH_MOUSE_LL records into.
  screenX: number;
  screenY: number;
  screenW: number;
  screenH: number;
  // Whether the guest is showing only the game area ("game area only" crop).
  // nx/ny are fractions of the guest surface, and cropping changes what that
  // surface contains, so a script only replays correctly in the mode it was
  // recorded in. Absent on pre-crop scripts, which read as false.
  cropped?: boolean;
}

// The sentinel event stored at index 0 of a v2+ script. `type:"meta"` is
// skipped by the play loop, so it is safe to carry inside the plain events
// array. The renderer recorder builds an identically-shaped object.
export interface MetaEvent {
  t: 0;
  type: "meta";
  version: number;
  // Slot 0's geometry. Also the only geometry a v3-or-older script has.
  geometry: GameGeometry;
  // One entry per instance slot, slot 0 first (v4+). Absent on older
  // scripts, which are single-slot by construction.
  targets?: GameGeometry[];
  // Each slot's tab-bar position RELATIVE to slot 0's, in the same order as
  // `targets` (so slotOffsets[0] is always 0, and a slot recorded one tab to
  // the left is -1). Play time re-derives the binding from these instead of
  // from the order the slots were visited, so recording 1 → 3 → 2 still
  // drives the right instances.
  slotOffsets?: number[];
}

export function buildMetaEvent(
  targets: GameGeometry[],
  slotOffsets: number[],
): MetaEvent {
  return {
    t: 0,
    type: "meta",
    version: SCRIPT_VERSION,
    geometry: targets[0],
    targets,
    slotOffsets,
  };
}

// Slot geometries recorded in a script's meta sentinel, slot 0 first. Older
// scripts carry a single `geometry`, which reads as one slot.
export function metaTargets(meta: any): GameGeometry[] {
  if (Array.isArray(meta?.targets) && meta.targets.length > 0) {
    return meta.targets as GameGeometry[];
  }
  return meta?.geometry ? [meta.geometry as GameGeometry] : [];
}

// Recorded tab-position offsets, one per slot. Scripts saved before v4 (and
// any whose header is incomplete) get the sequential fallback 0, 1, 2 …,
// which is what the slot order alone implies.
export function metaSlotOffsets(meta: any, slots: number): number[] {
  const raw = Array.isArray(meta?.slotOffsets) ? meta.slotOffsets : [];
  return Array.from({ length: slots }, (_, i) =>
    typeof raw[i] === "number" ? (raw[i] as number) : i,
  );
}

// A script can play in isolation iff it carries a v2+ meta sentinel.
export function scriptSupportsIsolation(events: any[]): boolean {
  const head = events?.[0];
  return (
    !!head &&
    head.type === "meta" &&
    typeof head.version === "number" &&
    head.version >= 2
  );
}

// Normalized fraction -> guest-webview input coordinates (what
// webContents.sendInputEvent expects). PoC established that guest coordinates
// are guest-CSS px over the full surface and independent of zoom, so this is a
// straight scale by renderWidth/renderHeight. If calibration later shows a
// zoom/resolutionScale dependence, adjust it HERE — this is the single place
// the mapping is defined.
export function normalizedToGuest(
  nx: number,
  ny: number,
  geo: GameGeometry,
): { x: number; y: number } {
  return {
    x: Math.round(nx * geo.renderWidth),
    y: Math.round(ny * geo.renderHeight),
  };
}

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
//      Electron keyCode (no vk/sc). Must stay in sync with the renderer's
//      SCRIPT_VERSION in src/store/useRecordingStore.ts.
export const SCRIPT_VERSION = 3;

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
}

// The sentinel event stored at index 0 of a v2+ script. `type:"meta"` is
// skipped by the play loop, so it is safe to carry inside the plain events
// array. The renderer recorder builds an identically-shaped object.
export interface MetaEvent {
  t: 0;
  type: "meta";
  version: number;
  geometry: GameGeometry;
}

export function buildMetaEvent(geometry: GameGeometry): MetaEvent {
  return { t: 0, type: "meta", version: SCRIPT_VERSION, geometry };
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

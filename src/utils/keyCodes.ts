// DOM KeyboardEvent.code -> Electron sendInputEvent keyCode.
//
// v3 recordings store the mapped keyCode directly in the event `key` field
// (no vk/sc); the playback engine passes it straight to
// webContents.sendInputEvent, so only Electron-legal keyCodes may be recorded.

const STATIC_CODE_MAP: Record<string, string> = {
  ArrowLeft: "Left",
  ArrowUp: "Up",
  ArrowRight: "Right",
  ArrowDown: "Down",
  Enter: "Return",
  NumpadEnter: "Return",
  Space: "Space",
  ShiftLeft: "Shift",
  ShiftRight: "Shift",
  ControlLeft: "Control",
  ControlRight: "Control",
  AltLeft: "Alt",
  AltRight: "Alt",
  Escape: "Escape",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
  Insert: "Insert",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  CapsLock: "CapsLock",
  NumpadMultiply: "nummult",
  NumpadAdd: "numadd",
  NumpadSubtract: "numsub",
  NumpadDecimal: "numdec",
  NumpadDivide: "numdiv",
};

/**
 * Map a DOM key event to an Electron keyCode. Returns null when the key has
 * no legal Electron representation — callers must skip (not record) it.
 */
export function domCodeToKeyCode(code: string, key: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-2])$/.test(code)) return code;
  if (/^Numpad[0-9]$/.test(code)) return `num${code.slice(6)}`;
  if (STATIC_CODE_MAP[code]) return STATIC_CODE_MAP[code];
  // Punctuation and other printable keys: a single-character `key` is itself
  // a valid Electron keyCode.
  if (key.length === 1) return key;
  return null;
}

export const KEY_GROUPS = {
  Function: [
    "F1",
    "F2",
    "F3",
    "F4",
    "F5",
    "F6",
    "F7",
    "F8",
    "F9",
    "F10",
    "F11",
    "F12",
  ],
  Navigation: [
    "Escape",
    "Tab",
    "Enter",
    "Backspace",
    "Delete",
    "Insert",
    "Home",
    "End",
    "PgUp",
    "PgDn",
  ],
  Arrows: ["Up", "Down", "Left", "Right"],
  Numpad: [
    "Numpad0",
    "Numpad1",
    "Numpad2",
    "Numpad3",
    "Numpad4",
    "Numpad5",
    "Numpad6",
    "Numpad7",
    "Numpad8",
    "Numpad9",
    "NumpadAdd",
    "NumpadSub",
    "NumpadMult",
    "NumpadDiv",
    "NumpadDot",
    "NumpadEnter",
  ],
  Letters: Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)),
  Numbers: Array.from({ length: 10 }, (_, i) => String(i)),
  Gamepad: (() => {
    const keys: string[] = [];
    // Support up to 16 gamepads (AutoHotKey standard)
    for (let gamepadIndex = 1; gamepadIndex <= 16; gamepadIndex++) {
      // Buttons: 1Joy1 to 16Joy32
      for (let button = 1; button <= 32; button++) {
        keys.push(`${gamepadIndex}Joy${button}`);
      }
      // Axes with direction: 1JoyX+, 1JoyX-, etc.
      const axes = ["X", "Y", "Z", "R", "U", "V"];
      for (const axis of axes) {
        keys.push(`${gamepadIndex}Joy${axis}+`);
        keys.push(`${gamepadIndex}Joy${axis}-`);
      }
    }
    return keys;
  })(),
};

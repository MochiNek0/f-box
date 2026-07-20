// =====================================================================
// PlaybackEngine — background (isolated) automation playback.
//
// Reads recorded events and injects them into the game <webview> via
// webContents.sendInputEvent, which routes through Chromium's input pipeline
// (the path PPAPI Flash listens on) WITHOUT touching the physical
// mouse/keyboard. Timing, loop/stop handling and breakpoints preserve the
// original AHK player's semantics; status strings are byte-identical so the
// renderer parser is unchanged.
// =====================================================================
import { WebContents } from "electron";
import {
  GameGeometry,
  normalizedToGuest,
} from "./automation-geometry.cjs";

export interface PlaybackEvent {
  t: number;
  type:
    | "meta"
    | "mousemove"
    | "mousedown"
    | "mouseup"
    | "mousewheel"
    | "keydown"
    | "keyup"
    | "breakpoint";
  x?: number;
  y?: number;
  nx?: number;
  ny?: number;
  button?: string;
  key?: string;
  vk?: number;
  sc?: number;
  w?: number;
  h?: number;
  text?: string;
  t_trigger?: number;
}

export interface PlaybackCallbacks {
  // Emit a STATUS|... line (forwarded verbatim to the renderer).
  onStatus: (line: string) => void;
  // Resolve a breakpoint: capture + OCR happens in the manager; returns
  // "stop" to end playback or "continue" to proceed.
  onBreakpoint: (
    evt: PlaybackEvent,
    eventIndex: number,
  ) => Promise<"continue" | "stop">;
  // Called once when the loop ends (natural finish or stop) for teardown.
  onDone: () => void;
}

// Windows VK -> Electron keyCode. VK is the most reliable recorded field; fall
// back to the recorded key name when a VK isn't mapped.
const VK_TO_KEYCODE: Record<number, string> = {
  0x08: "Backspace",
  0x09: "Tab",
  0x0d: "Return",
  0x10: "Shift",
  0x11: "Control",
  0x12: "Alt",
  0x14: "CapsLock",
  0x1b: "Escape",
  0x20: "Space",
  0x21: "PageUp",
  0x22: "PageDown",
  0x23: "End",
  0x24: "Home",
  0x25: "Left",
  0x26: "Up",
  0x27: "Right",
  0x28: "Down",
  0x2d: "Insert",
  0x2e: "Delete",
  // Left/right-specific modifier VKs. WH_KEYBOARD_LL (what the AHK recorder's
  // InputHook uses) always reports these (0xA0-0xA5), never the generic
  // 0x10-0x12 — without them every recorded Shift/Ctrl/Alt falls back to an
  // AHK key name ("LShift") that Electron can't parse.
  0xa0: "Shift",
  0xa1: "Shift",
  0xa2: "Control",
  0xa3: "Control",
  0xa4: "Alt",
  0xa5: "Alt",
};

// Digits and letters are contiguous.
for (let vk = 0x30; vk <= 0x39; vk++) {
  VK_TO_KEYCODE[vk] = String.fromCharCode(vk); // '0'-'9'
}
for (let vk = 0x41; vk <= 0x5a; vk++) {
  VK_TO_KEYCODE[vk] = String.fromCharCode(vk + 0x20); // 'a'-'z'
}
for (let n = 1; n <= 12; n++) {
  VK_TO_KEYCODE[0x6f + n] = `F${n}`; // 0x70..0x7B -> F1..F12
}
// Numpad (Electron accelerator names).
for (let n = 0; n <= 9; n++) {
  VK_TO_KEYCODE[0x60 + n] = `num${n}`;
}
VK_TO_KEYCODE[0x6a] = "nummult";
VK_TO_KEYCODE[0x6b] = "numadd";
VK_TO_KEYCODE[0x6d] = "numsub";
VK_TO_KEYCODE[0x6e] = "numdec";
VK_TO_KEYCODE[0x6f] = "numdiv";

const MODIFIER_VK: Record<number, "shift" | "control" | "alt"> = {
  0x10: "shift",
  0x11: "control",
  0x12: "alt",
  0xa0: "shift",
  0xa1: "shift",
  0xa2: "control",
  0xa3: "control",
  0xa4: "alt",
  0xa5: "alt",
};

// v3 scripts carry no vk — modifiers are identified by their Electron
// keyCode instead.
const MODIFIER_KEYCODE: Record<string, "shift" | "control" | "alt"> = {
  Shift: "shift",
  Control: "control",
  Alt: "alt",
};

// Single characters AHK treats literally; a bare char keyCode is fine here.
const isPrintable = (keyCode: string) => keyCode.length === 1;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class PlaybackEngine {
  private shouldStop = false;
  private heldModifiers = new Set<"shift" | "control" | "alt">();
  // Every keyCode with a keyDown sent but no matching keyUp yet, so a stop
  // mid-hold (e.g. a movement key) can release it instead of leaving the
  // guest with a stuck key.
  private heldKeys = new Set<string>();

  constructor(
    private guest: WebContents,
    private events: PlaybackEvent[],
    private geometry: GameGeometry,
    private maxLoops: number,
    private cb: PlaybackCallbacks,
  ) {}

  stop(): void {
    this.shouldStop = true;
  }

  private now(): number {
    return Number(process.hrtime.bigint()) / 1e6; // ms
  }

  // Self-correcting wait: coarse setTimeout down to ~2ms, then a light spin.
  private async sleepUntil(target: number): Promise<void> {
    while (!this.shouldStop) {
      const remaining = target - this.now();
      if (remaining <= 0) return;
      if (remaining > 4) {
        await delay(Math.min(remaining - 2, 25));
      } else {
        await delay(0); // yield; sub-ms precision isn't needed for input
      }
    }
  }

  private modifiers(): string[] {
    return Array.from(this.heldModifiers);
  }

  private send(event: any): void {
    if (this.guest.isDestroyed()) {
      this.shouldStop = true;
      return;
    }
    try {
      this.guest.sendInputEvent(event);
    } catch (e) {
      if (this.guest.isDestroyed()) {
        // Guest destroyed mid-flight; end playback.
        this.shouldStop = true;
      } else {
        // Malformed event (e.g. a keyCode Electron can't parse) — skip this
        // event rather than silently killing the whole run.
        console.error("sendInputEvent failed:", e);
      }
    }
  }

  private mapCoords(evt: PlaybackEvent): { x: number; y: number } {
    if (typeof evt.nx === "number" && typeof evt.ny === "number") {
      return normalizedToGuest(evt.nx, evt.ny, this.geometry);
    }
    return { x: evt.x ?? 0, y: evt.y ?? 0 };
  }

  private keyCodeFor(evt: PlaybackEvent): string {
    if (typeof evt.vk === "number" && VK_TO_KEYCODE[evt.vk]) {
      return VK_TO_KEYCODE[evt.vk];
    }
    return evt.key ?? "";
  }

  // Identify a modifier by vk (v2 scripts) or by keyCode (v3 scripts).
  private modifierFor(
    evt: PlaybackEvent,
    keyCode: string,
  ): "shift" | "control" | "alt" | undefined {
    if (typeof evt.vk === "number" && MODIFIER_VK[evt.vk]) {
      return MODIFIER_VK[evt.vk];
    }
    return MODIFIER_KEYCODE[keyCode];
  }

  private async executeEvent(evt: PlaybackEvent): Promise<void> {
    switch (evt.type) {
      case "mousemove": {
        const { x, y } = this.mapCoords(evt);
        this.send({ type: "mouseMove", x, y });
        break;
      }
      case "mousedown":
      case "mouseup": {
        const { x, y } = this.mapCoords(evt);
        const button =
          evt.button === "right"
            ? "right"
            : evt.button === "middle"
              ? "middle"
              : "left";
        // [DEBUG coord] playback-time injection
        console.log(
          `[PLAY] type=${evt.type} nx=${evt.nx} ny=${evt.ny} -> x=${x} y=${y} renderW=${this.geometry.renderWidth} renderH=${this.geometry.renderHeight}`,
        );
        // Hover first, mirroring AHK's SetCursorPos before Click. In recording,
        // the move and the down arrive as SEPARATE IPC messages (separate event
        // loop ticks), giving PPAPI Flash a beat to register the hover. Injecting
        // both in the same synchronous tick can make Flash drop the click, so
        // insert a small delay between them to reproduce the recording timing.
        this.send({ type: "mouseMove", x, y });
        await delay(16);
        this.send({
          type: evt.type === "mousedown" ? "mouseDown" : "mouseUp",
          x,
          y,
          button,
          clickCount: 1,
        });
        break;
      }
      case "mousewheel": {
        const { x, y } = this.mapCoords(evt);
        const deltaY = evt.button === "down" ? -120 : 120;
        this.send({ type: "mouseWheel", x, y, deltaY, canScroll: true });
        break;
      }
      case "keydown": {
        const keyCode = this.keyCodeFor(evt);
        if (!keyCode) break;
        const mod = this.modifierFor(evt, keyCode);
        if (mod) {
          this.heldModifiers.add(mod);
        }
        this.heldKeys.add(keyCode);
        this.send({ type: "keyDown", keyCode, modifiers: this.modifiers() });
        if (isPrintable(keyCode)) {
          this.send({ type: "char", keyCode, modifiers: this.modifiers() });
        }
        break;
      }
      case "keyup": {
        const keyCode = this.keyCodeFor(evt);
        if (!keyCode) break;
        this.heldKeys.delete(keyCode);
        this.send({ type: "keyUp", keyCode, modifiers: this.modifiers() });
        const mod = this.modifierFor(evt, keyCode);
        if (mod) {
          this.heldModifiers.delete(mod);
        }
        break;
      }
    }
  }

  async run(): Promise<void> {
    // Skip the meta sentinel and any zero-timed non-input header.
    const events = this.events.filter((e) => e.type !== "meta");

    // Focus the guest once so keyboard input is routed to it. sendInputEvent
    // delivers regardless of OS focus, so we deliberately do NOT re-focus on
    // every keystroke — that would keep stealing focus from whatever else the
    // user is doing, defeating the "use the PC simultaneously" goal.
    try {
      this.guest.focus();
    } catch {
      // guest may be gone; the loop's isDestroyed guard handles it
    }

    this.cb.onStatus("STATUS|PLAYING");

    let loopCount = 0;
    try {
      while (!this.shouldStop) {
        loopCount++;
        if (this.maxLoops > 0 && loopCount > this.maxLoops) {
          this.cb.onStatus(
            `STATUS|MAX_LOOPS_REACHED|Target:${this.maxLoops}|Current:${loopCount - 1}`,
          );
          break;
        }

        this.cb.onStatus(`STATUS|LOOP_START|${loopCount}`);

        let playStart = this.now();
        for (let i = 0; i < events.length; i++) {
          const evt = events[i];
          if (this.shouldStop) break;

          if (evt.type === "breakpoint") {
            // Wait until the F9-press moment (t_trigger), then capture/OCR.
            const tTrigger =
              typeof evt.t_trigger === "number" ? evt.t_trigger : evt.t;
            await this.sleepUntil(playStart + tTrigger);
            if (this.shouldStop) break;

            const decision = await this.cb.onBreakpoint(evt, i);
            if (decision === "stop") {
              this.shouldStop = true;
              break;
            }
            // Rebase the timeline so subsequent events stay correctly timed
            // after the (variable-length) OCR wait.
            playStart += this.now() - (playStart + evt.t);
            continue;
          }

          await this.sleepUntil(playStart + evt.t);
          if (this.shouldStop) break;
          await this.executeEvent(evt);
        }

        if (this.shouldStop) break;

        this.cb.onStatus(`STATUS|LOOP_END|${loopCount}`);
        await this.sleepUntil(this.now() + 500);
      }
    } finally {
      // Release any keys still logically held (modifiers AND regular keys like
      // a held movement key) so we never leave the guest stuck with a key down.
      if (!this.guest.isDestroyed()) {
        for (const keyCode of this.heldKeys) {
          try {
            this.guest.sendInputEvent({ type: "keyUp", keyCode } as any);
          } catch {
            // guest gone; nothing to release
          }
        }
      }
      this.heldKeys.clear();
      this.heldModifiers.clear();
      this.cb.onStatus(
        `STATUS|STOPPED|${this.shouldStop ? loopCount : loopCount - 1}`,
      );
      this.cb.onDone();
    }
  }
}

import React from "react";
import { Square } from "lucide-react";
import { usePlaybackStore } from "../../../store/usePlaybackStore";

// Global "playback in progress" badge. Playback can target a background tab
// (F3-F5 hotkey slots) and outlives the Settings modal, so this floats at app
// level over the game area, mirroring the recording badge's look
// (RecordingOverlay) in the primary accent instead of red. Recording and
// playback are mutually exclusive (main stops playback when recording
// starts), so the two badges never overlap.
export const PlaybackIndicator: React.FC = () => {
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const playingScript = usePlaybackStore((s) => s.playingScript);

  if (!isPlaying) return null;

  return (
    <div className="absolute top-12 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-black/70 border border-primary/40 rounded-full pl-3 pr-1 py-1">
      <span className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_hsl(var(--primary)_/_0.8)]" />
      <span className="max-w-[280px] truncate text-[10px] text-primary font-black uppercase tracking-widest">
        正在播放{playingScript ? ` · ${playingScript}` : ""}
      </span>
      <button
        type="button"
        onClick={() => void window.electron.automation.stopPlay()}
        title="停止播放"
        className="w-5 h-5 flex items-center justify-center rounded-full text-zinc-400 transition-colors hover:text-red-400 hover:bg-red-500/10 outline-none"
      >
        <Square size={10} fill="currentColor" />
      </button>
    </div>
  );
};

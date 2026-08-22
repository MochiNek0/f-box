import React from "react";
import {
  Maximize2,
  Monitor,
  FlaskConical,
  AlertTriangle,
  Image as ImageIcon,
  X,
} from "lucide-react";
import {
  type GameResolutionMode,
  useSettingsStore,
} from "../../../../store/useSettingsStore";

const RESOLUTION_OPTIONS: Array<{
  id: GameResolutionMode;
  label: string;
  detail: string;
  icon: React.ReactNode;
}> = [
  {
    id: "auto",
    label: "自动",
    detail: "匹配屏幕",
    icon: <Monitor size={18} />,
  },
  {
    id: "native",
    label: "原始",
    detail: "固定 1280",
    icon: <Maximize2 size={18} />,
  },
];

export const DisplayTab: React.FC = () => {
  const { gameResolutionMode, setGameResolutionMode } = useSettingsStore();
  const cropBackgroundPath = useSettingsStore((s) => s.cropBackgroundPath);
  const setCropBackgroundPath = useSettingsStore(
    (s) => s.setCropBackgroundPath,
  );
  const [flashStability, setFlashStability] = React.useState(false);
  const [needsRestart, setNeedsRestart] = React.useState(false);
  const [backgroundError, setBackgroundError] = React.useState<string | null>(
    null,
  );

  const pickBackground = async () => {
    setBackgroundError(null);
    const picked = await window.electron.pickBackgroundImage();
    if (picked.canceled || !picked.path) return;
    // Validate by actually reading it, so an oversized or unreadable file is
    // rejected here rather than silently doing nothing at crop time.
    const read = await window.electron.readBackgroundImage(picked.path);
    if (!read.success) {
      setBackgroundError(read.error || "无法使用这张图片");
      return;
    }
    setCropBackgroundPath(picked.path);
  };

  React.useEffect(() => {
    window.electron
      .getExperimentalFlags?.()
      .then((f) => setFlashStability(!!f?.flashStability))
      .catch(() => {});
  }, []);

  const toggleFlashStability = async () => {
    const next = !flashStability;
    setFlashStability(next);
    const res = await window.electron.setExperimentalFlags?.({
      flashStability: next,
    });
    if (res?.success) {
      setNeedsRestart(true);
    } else {
      setFlashStability(!next); // revert on write failure
    }
  };

  return (
    <div className="space-y-gr-4">
      <section className="glass p-gr-4 rounded-gr-4">
        <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-gr-3">
          游戏画面分辨率
        </label>
        <div className="grid grid-cols-2 gap-gr-3">
          {RESOLUTION_OPTIONS.map((option) => {
            const isActive = gameResolutionMode === option.id;

            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => setGameResolutionMode(option.id)}
                className={`min-h-16 rounded-gr-3 border px-gr-4 py-gr-3 text-left transition-all smooth-transition ${
                  isActive
                    ? "border-primary/60 bg-primary/10 text-primary shadow-[0_0_18px_hsl(var(--primary)_/_0.12)]"
                    : "border-white/5 bg-white/5 text-zinc-300 hover:border-white/15 hover:bg-white/10"
                }`}
              >
                <div className="flex items-center gap-gr-2">
                  <span
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-gr-2 ${
                      isActive ? "bg-primary/15" : "bg-black/20"
                    }`}
                  >
                    {option.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-black">
                      {option.label}
                    </span>
                    <span className="block truncate text-[10px] font-bold text-zinc-500">
                      {option.detail}
                    </span>
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="glass p-gr-4 rounded-gr-4">
        <label className="flex items-center gap-gr-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-gr-2">
          <ImageIcon size={12} /> 裁剪模式背景图
        </label>
        <p className="text-[11px] font-bold text-zinc-400 leading-snug mb-gr-3">
          开启「仅游戏区域」后，游戏画面周围留白默认为纯黑。选一张图片作为背景，会以
          cover 方式铺满留白区域。
        </p>
        <div className="flex items-center gap-gr-3">
          <button
            type="button"
            onClick={pickBackground}
            className="rounded-gr-2 border border-white/10 bg-white/5 px-gr-3 py-gr-2 text-[11px] font-black text-zinc-200 transition-colors hover:border-white/20 hover:bg-white/10"
          >
            选择图片
          </button>
          {cropBackgroundPath && (
            <>
              <span
                className="min-w-0 flex-1 truncate text-[11px] font-bold text-zinc-400"
                title={cropBackgroundPath}
              >
                {cropBackgroundPath}
              </span>
              <button
                type="button"
                onClick={() => {
                  setBackgroundError(null);
                  setCropBackgroundPath(null);
                }}
                title="恢复纯黑背景"
                className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-gr-2 text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
              >
                <X size={14} />
              </button>
            </>
          )}
        </div>
        {backgroundError && (
          <div className="mt-gr-3 flex items-center gap-gr-2 rounded-gr-2 border border-red-500/30 bg-red-500/10 px-gr-3 py-gr-2 text-[11px] font-bold text-red-300">
            <AlertTriangle size={13} /> {backgroundError}
          </div>
        )}
      </section>

      <section className="glass p-gr-4 rounded-gr-4">
        <div className="flex items-start justify-between gap-gr-3">
          <div className="min-w-0">
            <label className="flex items-center gap-gr-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-gr-2">
              <FlaskConical size={12} /> 实验性 · Flash 稳定性增强
            </label>
            <p className="text-[11px] font-bold text-zinc-400 leading-snug">
              强制 CPU 合成，并让 GPU 进程崩溃后自动重启，以缓解部分显卡驱动导致的插件崩溃。可能降低渲染性能，且并非对所有设备都有效。
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={flashStability}
            onClick={toggleFlashStability}
            className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${
              flashStability ? "bg-primary" : "bg-white/10"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                flashStability ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
        {needsRestart && (
          <div className="mt-gr-3 flex items-center gap-gr-2 rounded-gr-2 border border-amber-500/30 bg-amber-500/10 px-gr-3 py-gr-2 text-[11px] font-bold text-amber-300">
            <AlertTriangle size={13} /> 设置将在重启应用后生效。
          </div>
        )}
      </section>
    </div>
  );
};

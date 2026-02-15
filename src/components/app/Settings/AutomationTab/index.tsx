import React, { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "../../../common/Button";
import {
  Play,
  Square,
  Trash2,
  Circle,
  ChevronDown,
  ChevronUp,
  Save,
} from "lucide-react";
import { IconButton } from "../../../common/IconButton";

interface AutomationTabProps {
  onOpenRecorder: (name: string) => void;
  onClose: () => void;
}

export const AutomationTab: React.FC<AutomationTabProps> = ({
  onOpenRecorder,
  onClose,
}) => {
  const [scripts, setScripts] = useState<string[]>([]);
  const [recordName, setRecordName] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playingScript, setPlayingScript] = useState<string | null>(null);
  const [expandedScript, setExpandedScript] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [loopCount, setLoopCount] = useState(0);

  // Config for expanded script
  const [repeatCount, setRepeatCount] = useState(0);

  const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshScripts = useCallback(async () => {
    const list = await window.electron.automation.listScripts();
    setScripts(list);
  }, []);

  // Setup status listener
  useEffect(() => {
    window.electron.automation.onStatus((status: string) => {
      const parts = status.split("|");
      if (parts[0] === "STATUS") {
        const action = parts[1];
        switch (action) {
          case "RECORDING":
            setStatusMessage("🔴 正在录制... 按 F10 停止");
            break;
          case "RECORD_DONE":
            setStatusMessage("✅ 录制完成");
            setIsRecording(false);
            refreshScripts();
            break;
          case "PLAYING":
            setStatusMessage("▶️ 正在播放...");
            break;
          case "LOOP_START":
            setLoopCount(parseInt(parts[2] || "0", 10));
            setStatusMessage(`🔄 第 ${parts[2]} 轮执行中...`);
            break;
          case "LOOP_END":
            setStatusMessage(`✅ 第 ${parts[2]} 轮完成，检查停止条件...`);
            break;
          case "CONDITION_MET":
            setStatusMessage(`🎉 停止条件已满足！共执行 ${parts[2]} 轮`);
            setIsPlaying(false);
            setPlayingScript(null);
            break;
          case "STOPPED":
            setStatusMessage(`⏹️ 已停止，共执行 ${parts[2]} 轮`);
            setIsPlaying(false);
            setPlayingScript(null);
            break;
          case "PROCESS_EXIT":
            if (isRecording) {
              setIsRecording(false);
              refreshScripts();
            }
            if (isPlaying) {
              setIsPlaying(false);
              setPlayingScript(null);
            }
            break;
        }
      }
    });

    return () => {
      window.electron.automation.offStatus();
    };
  }, [isRecording, isPlaying, refreshScripts]);

  // Load scripts on mount
  useEffect(() => {
    refreshScripts();
  }, [refreshScripts]);

  // Load config when a script is expanded
  useEffect(() => {
    if (expandedScript) {
      window.electron.automation.getConfig(expandedScript).then((config) => {
        if (config) {
          setRepeatCount(config.repeatCount || 0);
        } else {
          setRepeatCount(0);
        }
      });
    }
  }, [expandedScript]);

  const handlePlay = async (name: string) => {
    // 如果当前正在编辑此脚本，先保存配置
    if (expandedScript === name) {
      await handleSaveConfig();
    }

    setLoopCount(0);
    setStatusMessage("正在启动播放...");
    const result = await window.electron.automation.startPlay(name);
    if (result.success) {
      setIsPlaying(true);
      setPlayingScript(name);
      onClose(); // Close settings popup when playback starts
    } else {
      setStatusMessage(`❌ ${result.error}`);
    }
  };

  const handleStopPlay = async () => {
    await window.electron.automation.stopPlay();
    setIsPlaying(false);
    setPlayingScript(null);
  };

  const handleDelete = async (name: string) => {
    await window.electron.automation.deleteScript(name);
    if (expandedScript === name) setExpandedScript(null);
    refreshScripts();
    setStatusMessage(`已删除: ${name}`);
  };

  const handleSaveConfig = async () => {
    if (!expandedScript) return;
    const config: any = {
      repeatCount: repeatCount,
    };
    const result = await window.electron.automation.saveConfig(
      expandedScript,
      config,
    );
    if (result.success) {
      setStatusMessage("✅ 配置已保存");
      if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
      statusTimeoutRef.current = setTimeout(() => setStatusMessage(""), 2000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Record Section */}
      <section className="bg-zinc-800/30 p-6 rounded-2xl border border-zinc-800/50">
        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-4">
          录制操作
        </label>

        <div className="flex gap-3 max-md:flex-col">
          <input
            type="text"
            value={recordName}
            onChange={(e) => setRecordName(e.target.value)}
            placeholder="输入脚本名称..."
            disabled={isRecording || isPlaying}
            className="flex-grow bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-200 text-sm placeholder-zinc-600 focus:outline-none focus:border-orange-500 transition-colors disabled:opacity-50"
          />
          <Button
            onClick={() => {
              if (recordName.trim()) {
                onOpenRecorder(recordName.trim());
              } else {
                setStatusMessage("❌ 请先输入脚本名称");
              }
            }}
            variant="secondary"
            disabled={!recordName.trim() || isPlaying}
            className="flex items-center"
          >
            <Circle size={14} className="mr-1.5 text-red-400" />
            前往录制
          </Button>
        </div>

        <p className="text-[10px] text-zinc-500 mt-3 italic">
          前往录制后，将关闭当前窗口并打开悬浮录制工具栏。
        </p>
      </section>

      {/* Status Bar */}
      {statusMessage && (
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-3 text-sm text-zinc-300 flex items-center gap-2">
          {isPlaying && loopCount > 0 && (
            <span className="text-orange-400 font-mono text-xs bg-orange-500/10 px-2 py-0.5 rounded-md">
              #{loopCount}
            </span>
          )}
          {statusMessage}
        </div>
      )}

      {/* Scripts List */}
      <section className="bg-zinc-800/30 p-6 rounded-2xl border border-zinc-800/50">
        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-4">
          已录制脚本
        </label>

        {scripts.length === 0 ? (
          <p className="text-sm text-zinc-600 italic text-center py-4">
            暂无录制的脚本
          </p>
        ) : (
          <div className="space-y-2">
            {scripts.map((name) => (
              <div
                key={name}
                className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 overflow-hidden transition-all duration-200"
              >
                {/* Script Row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="flex-grow text-sm text-zinc-200 font-mono truncate">
                    {name}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {/* Play/Stop Button */}
                    {isPlaying && playingScript === name ? (
                      <IconButton
                        icon={<Square size={14} />}
                        onClick={handleStopPlay}
                        variant="danger"
                        title="停止播放"
                      />
                    ) : (
                      <IconButton
                        icon={<Play size={14} className="text-green-400" />}
                        onClick={() => handlePlay(name)}
                        disabled={isRecording || isPlaying}
                        title="播放"
                      />
                    )}

                    {/* Expand Config */}
                    <IconButton
                      onClick={() =>
                        setExpandedScript(expandedScript === name ? null : name)
                      }
                      disabled={isPlaying && playingScript === name}
                      icon={
                        expandedScript === name ? (
                          <ChevronUp size={14} />
                        ) : (
                          <ChevronDown size={14} />
                        )
                      }
                      title="配置"
                    />

                    {/* Delete */}
                    <IconButton
                      onClick={() => handleDelete(name)}
                      disabled={isPlaying && playingScript === name}
                      icon={<Trash2 size={14} />}
                      title="删除"
                    />
                  </div>
                </div>

                {/* Expanded Config Panel */}
                {expandedScript === name && (
                  <div className="px-4 pb-4 border-t border-zinc-800/50 pt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-zinc-400 block mb-2">
                          重复播放次数 (0 为无限循环)
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={repeatCount}
                          onChange={(e) =>
                            setRepeatCount(parseInt(e.target.value, 10) || 0)
                          }
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 font-mono focus:outline-none focus:border-orange-500 transition-colors"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end items-center pt-2">
                      <Button
                        onClick={handleSaveConfig}
                        variant="primary"
                        className="flex items-center"
                      >
                        <Save size={14} className="mr-1.5" />
                        保存配置
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Usage Tips */}
      <div className="bg-zinc-800/20 rounded-xl p-4 border border-zinc-800/30">
        <p className="text-[10px] text-zinc-500 leading-relaxed">
          <span className="text-zinc-400 font-medium">使用说明：</span>{" "}
          录制操作后，可设置重复播放次数。
          播放时脚本将循环执行，直到完成指定次数或手动按 F10 停止。
        </p>
      </div>
    </div>
  );
};

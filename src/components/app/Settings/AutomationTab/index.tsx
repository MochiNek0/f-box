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
  Download,
  Box,
  Eye,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Clock,
  Hash,
  MousePointer2,
  Type,
} from "lucide-react";
import type { OcrResultEntry } from "../../../../types/electron";
import { IconButton } from "../../../common/IconButton";
import { NumberInput } from "../../../common/NumberInput";

const isWindows = () => window.electron.getPlatform() === "win32";

interface AutomationTabProps {
  onOpenRecorder: (name: string) => void;
  onClose: () => void;
}

export const AutomationTab: React.FC<AutomationTabProps> = ({
  onOpenRecorder,
  onClose,
}) => {
  const [isPlatformSupported, setIsPlatformSupported] = useState(true);

  useEffect(() => {
    setIsPlatformSupported(isWindows());
  }, []);

  // Show unsupported message on non-Windows platforms
  if (!isPlatformSupported) {
    return (
      <div className="space-y-6">
        <section className="bg-zinc-800/30 p-6 rounded-2xl border border-zinc-800/50">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-zinc-500"
              >
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                <line x1="9" x2="15" y1="9" y2="15" />
                <line x1="15" x2="9" y1="9" y2="15" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-zinc-300 mb-2">
              此功能仅支持 Windows
            </h3>
            <p className="text-sm text-zinc-500 max-w-md">
              自动化录制/回放功能依赖 AutoHotkey，目前仅在 Windows 平台上可用。
            </p>
          </div>
        </section>
      </div>
    );
  }

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
  const [scriptEvents, setScriptEvents] = useState<any[]>([]);
  const [ocrInstalled, setOcrInstalled] = useState(false);
  const [isInstallingOcr, setIsInstallingOcr] = useState(false);
  const [ocrResults, setOcrResults] = useState<OcrResultEntry[]>([]);
  const [ocrInstallProgress, setOcrInstallProgress] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshScripts = useCallback(async () => {
    const list = await window.electron.automation.listScripts();
    setScripts(list);
  }, []);

  // Setup status listener
  useEffect(() => {
    const detachStatus = window.electron.automation.onStatus(
      (status: string) => {
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
            case "OCR_NOT_INSTALLED":
              setStatusMessage("⚠️ 未安装 OCR 扩展，无法触发断点。请先下载。");
              break;
          }
        }
      },
    );

    window.electron.onOcrInstallProgress((percent) => {
      setOcrInstallProgress(percent);
      if (percent < 100) {
        setStatusMessage(`正在下载 OCR 扩展包... ${percent}%`);
      } else {
        setStatusMessage("下载完成，正在解压安装...");
      }
    });

    return () => {
      detachStatus();
      window.electron.offOcrInstallProgress();
    };
  }, [isRecording, isPlaying, refreshScripts]);

  // Load scripts and OCR status on mount
  useEffect(() => {
    let mounted = true;

    const loadInitialData = async () => {
      const [list, status] = await Promise.all([
        window.electron.automation.listScripts(),
        window.electron.ocrGetStatus(),
      ]);

      if (!mounted) return;
      setScripts(list);
      setOcrInstalled(status.installed);
    };

    void loadInitialData();

    return () => {
      mounted = false;
    };
  }, []);

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
      // Load script events to find OCR breakpoints
      window.electron.automation
        .getScriptEvents(expandedScript)
        .then((result) => {
          if (result.success && result.events) {
            console.log(result.events);

            setScriptEvents(result.events);
          } else {
            setScriptEvents([]);
          }
        });
      // Load OCR results
      window.electron.automation
        .getOcrResults(expandedScript)
        .then((results) => {
          setOcrResults(results || []);
          setCurrentPage(1);
        });
    } else {
      setScriptEvents([]);
      setOcrResults([]);
      setCurrentPage(1);
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

  const handleUpdateOcrText = (eventIndex: number, newText: string) => {
    setScriptEvents((prev) => {
      const updated = [...prev];
      updated[eventIndex] = { ...updated[eventIndex], text: newText };
      return updated;
    });
  };

  const handleSaveConfig = async () => {
    if (!expandedScript) return;
    const config = {
      repeatCount,
    };
    const configResult = await window.electron.automation.saveConfig(
      expandedScript,
      config,
    );
    // Also save updated script events (OCR text changes)
    if (scriptEvents.length > 0) {
      await window.electron.automation.saveScript(expandedScript, scriptEvents);
    }
    if (configResult.success) {
      setStatusMessage("✅ 配置已保存");
      if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
      statusTimeoutRef.current = setTimeout(() => setStatusMessage(""), 2000);
    }
  };

  const handleClearOcrResults = async () => {
    if (!expandedScript) return;
    await window.electron.automation.clearOcrResults(expandedScript);
    setOcrResults([]);
    setStatusMessage("🗑️ OCR 结果已清除");
    if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
    statusTimeoutRef.current = setTimeout(() => setStatusMessage(""), 2000);
  };

  const handleInstallOcr = async () => {
    setIsInstallingOcr(true);
    setOcrInstallProgress(0);
    setStatusMessage("正在准备下载 OCR 扩展包...");
    const result = await window.electron.ocrInstall();
    setIsInstallingOcr(false);
    if (result.success) {
      setOcrInstalled(true);
      setStatusMessage("✅ OCR 扩展包下载并自动安装成功");
      setOcrInstallProgress(100);
    } else {
      setStatusMessage("❌ OCR 扩展包下载或解压失败，请尝试检查网络或使用代理");
    }
  };

  const handleUninstallOcr = async () => {
    const result = await window.electron.ocrUninstall();
    if (result.success) {
      setOcrInstalled(false);
      setStatusMessage("🗑️ OCR 扩展包已卸载");
    }
  };

  const sortedResults = [...ocrResults].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  const totalPages = Math.ceil(sortedResults.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedResults = sortedResults.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE,
  );

  return (
    <div className="space-y-6">
      {/* Record Section */}
      <section className="glass p-gr-4 rounded-gr-4">
        <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-gr-3">
          录制操作
        </label>

        <div className="flex gap-3 max-md:flex-col">
          <input
            type="text"
            value={recordName}
            onChange={(e) => setRecordName(e.target.value)}
            placeholder="输入脚本名称..."
            disabled={isRecording || isPlaying}
            className="flex-grow bg-white/5 border border-border rounded-gr-3 px-gr-4 py-gr-3 text-zinc-200 text-sm placeholder-zinc-600 focus:outline-none focus:border-primary transition-all disabled:opacity-50"
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

      {/* OCR Extension Section */}
      <section className="glass p-gr-4 rounded-gr-4">
        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-gr-3 flex justify-between items-center">
          OCR 扩展功能
          {ocrInstalled ? (
            <span className="text-primary lowercase font-mono">installed</span>
          ) : (
            <span className="text-zinc-600 lowercase font-mono">
              not installed
            </span>
          )}
        </label>

        <div className="flex items-center gap-gr-3 bg-white/5 p-gr-3 rounded-gr-3 border border-white/5">
          <div className="p-gr-2 bg-white/5 rounded-gr-2">
            <Box
              size={24}
              className={ocrInstalled ? "text-primary" : "text-zinc-600"}
            />
          </div>
          <div className="flex-grow">
            <h4 className="text-sm font-medium text-zinc-200">OCR 识别引擎</h4>
            <p className="text-xs text-zinc-500 mt-1">
              启用断点功能（录制时按 F9）需要此扩展包。
            </p>
          </div>
          <div>
            {!ocrInstalled ? (
              <div className="flex flex-col items-end gap-2">
                <Button
                  onClick={handleInstallOcr}
                  disabled={isInstallingOcr}
                  variant="primary"
                  className="flex whitespace-nowrap items-center"
                >
                  <Download size={14} className="mr-1.5" />
                  下载扩展包
                </Button>
                {isInstallingOcr && (
                  <div className="w-32 h-1 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300 shadow-[0_0_8px_rgba(var(--primary),0.5)]"
                      style={{ width: `${ocrInstallProgress}%` }}
                    />
                  </div>
                )}
              </div>
            ) : (
              <Button
                onClick={handleUninstallOcr}
                variant="secondary"
                className="flex items-center whitespace-nowrap text-zinc-400 hover:text-red-400"
              >
                <Trash2 size={14} className="mr-1.5" />
                卸载
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Status Bar */}
      {statusMessage && (
        <div className="glass border border-white/10 rounded-gr-3 px-gr-4 py-gr-3 text-sm text-zinc-300 flex items-center gap-gr-2">
          {isPlaying && loopCount > 0 && (
            <span className="text-primary font-black font-mono text-[10px] bg-primary/10 px-gr-2 py-0.5 rounded-gr-1 border border-primary/20">
              #{loopCount}
            </span>
          )}
          {statusMessage}
        </div>
      )}

      {/* Scripts List */}
      <section className="glass p-gr-4 rounded-gr-4">
        <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-gr-3">
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
                className="bg-white/5 rounded-gr-3 border border-white/5 overflow-hidden transition-all duration-300 hover:bg-white/10"
              >
                {/* Script Row */}
                <div className="flex items-center gap-gr-3 px-gr-4 py-gr-3">
                  <span className="flex-grow text-sm text-zinc-200 font-mono truncate font-bold tracking-tighter">
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
                        icon={<Play size={14} className="text-primary" />}
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
                        <NumberInput
                          min={0}
                          value={repeatCount}
                          onChange={setRepeatCount}
                        />
                      </div>
                    </div>

                    {/* Inline OCR Results */}
                    {ocrResults.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between border-b border-white/5 pb-2">
                          <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-gr-2">
                            <Clock size={12} className="text-primary" />
                            识别历史 ({ocrResults.length})
                          </label>
                          <IconButton
                            onClick={handleClearOcrResults}
                            icon={<Trash2 size={12} />}
                            variant="danger"
                            title="清除所有记录"
                          />
                        </div>

                        <div className="bg-black/20 rounded-gr-3 border border-white/5 overflow-hidden">
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="bg-white/5 text-[9px] uppercase tracking-widest text-zinc-500 font-black border-b border-white/5">
                                  <th className="px-3 py-2">状态</th>
                                  <th className="px-3 py-2">
                                    <div className="flex items-center gap-1">
                                      <Hash size={10} /> 轮次/断点
                                    </div>
                                  </th>
                                  <th className="px-3 py-2">
                                    <div className="flex items-center gap-1">
                                      <Type size={10} /> 识别内容
                                    </div>
                                  </th>
                                  <th className="px-3 py-2">
                                    <div className="flex items-center gap-1">
                                      <MousePointer2 size={10} /> 预期
                                    </div>
                                  </th>
                                  <th className="px-3 py-2 text-right">时间</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5">
                                {paginatedResults.map((r, i) => (
                                  <tr
                                    key={r.requestId + i}
                                    className="hover:bg-white/5 transition-colors group"
                                  >
                                    <td className="px-3 py-2">
                                      {r.matched ? (
                                        <div className="w-5 h-5 rounded-full bg-green-400/10 flex items-center justify-center text-green-400">
                                          <Check size={12} />
                                        </div>
                                      ) : (
                                        <div className="w-5 h-5 rounded-full bg-red-400/10 flex items-center justify-center text-red-400">
                                          <X size={12} />
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-3 py-2">
                                      <div className="flex items-center gap-1">
                                        <span className="text-zinc-300 font-mono text-[10px]">
                                          #{r.runCount}
                                        </span>
                                        <span className="text-zinc-600 text-[10px]">
                                          /
                                        </span>
                                        <span className="bg-accent/10 text-accent px-1 py-0.5 rounded text-[9px] font-mono border border-accent/20">
                                          BP {r.eventIndex}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="px-3 py-2">
                                      <span
                                        className={`text-xs font-mono truncate max-w-[120px] block ${r.matched ? "text-zinc-200" : "text-zinc-400"}`}
                                        title={r.recognizedText}
                                      >
                                        {r.recognizedText || (
                                          <span className="text-zinc-700 italic">
                                            (空)
                                          </span>
                                        )}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2">
                                      <span
                                        className="text-[10px] text-zinc-500 font-mono truncate max-w-[80px] block"
                                        title={r.expectedText}
                                      >
                                        {r.expectedText}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      <span className="text-[9px] text-zinc-600 font-mono group-hover:text-zinc-400 transition-colors">
                                        {new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                          <div className="flex items-center justify-between pt-1">
                            <p className="text-[10px] text-zinc-500">
                              第 {currentPage} 页 / 共 {totalPages} 页
                            </p>
                            <div className="flex items-center gap-1">
                              <IconButton
                                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                icon={<ChevronLeft size={12} />}
                                title="上一页"
                              />
                              <IconButton
                                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                icon={<ChevronRight size={12} />}
                                title="下一页"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* OCR Breakpoint Editing */}
                    {scriptEvents.some((ev) => ev.type === "breakpoint") && (
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-gr-2 border-b border-white/5 pb-gr-1">
                          <Eye size={12} className="text-accent" />
                          OCR 断点设置
                        </label>
                        {scriptEvents.map((ev, idx) => {
                          if (ev.type !== "breakpoint") return null;
                          return (
                            <div
                              key={idx}
                              className="bg-white/5 rounded-gr-3 border border-white/5 p-gr-3 space-y-gr-2"
                            >
                              <div className="flex items-center gap-gr-2 text-[10px] text-zinc-500 font-mono font-bold">
                                <span className="bg-accent/10 text-accent px-1.5 py-0.5 rounded-gr-1 border border-accent/20">
                                  #{idx}
                                </span>
                                <span>
                                  区域: ({ev.x}, {ev.y}, {ev.w}×{ev.h})
                                </span>
                              </div>
                              <div>
                                <label className="text-xs text-zinc-400 block mb-1">
                                  匹配文字 (可用 | 隔开多组)
                                </label>
                                <input
                                  type="text"
                                  value={ev.text}
                                  onChange={(e) =>
                                    handleUpdateOcrText(idx, e.target.value)
                                  }
                                  placeholder="输入匹配文字..."
                                  className="w-full bg-white/5 border border-border rounded-gr-2 px-gr-3 py-gr-2 text-sm text-zinc-200 focus:outline-none focus:border-accent transition-all"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

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
      <div className="glass p-gr-4 rounded-gr-4 border border-white/5">
        <p className="text-[10px] text-zinc-500 leading-relaxed font-medium">
          <span className="text-zinc-400 font-black uppercase tracking-widest mr-gr-1 shadow-primary/10">
            使用说明：
          </span>{" "}
          录制操作后，可设置重复播放次数。
          播放时脚本将循环执行，直到完成指定次数或手动按 F10 停止。
        </p>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useRef } from "react";
import { TitleBar } from "./components/app/TitleBar";
import { TabBar } from "./components/app/TabBar";
import { GameLibrary } from "./components/app/GameLibrary";
import { GameView } from "./components/app/GameView";
import { FlashTutorial } from "./components/app/FlashTutorial";
import { Settings } from "./components/app/Settings";
import { RecorderToolbar } from "./components/app/RecorderToolbar";
import { OCRSelectionOverlay } from "./components/app/OCRSelectionOverlay";
import { UpdateNotifier } from "./components/app/UpdateNotifier";
import { useTabStore } from "./store/useTabStore";
import { useSettingsStore } from "./store/useSettingsStore";
import { preprocessImage } from "./utils/imageProcess";

type AutomationFeedback = {
  runCount: number;
  lastStatus: string;
  lastOcrText: string;
  ocrMatched: boolean | null;
};

const App: React.FC = () => {
  const [hasFlash, setHasFlash] = useState<boolean | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRecorderOpen, setIsRecorderOpen] = useState(false);
  const [showOCRSelection, setShowOCRSelection] = useState(false);
  const [initialRecordName, setInitialRecordName] = useState("");
  // Store t_trigger (F9 press time) from BREAKPOINT_REQ to pass back on resume
  const pendingTTrigger = useRef<number>(0);
  const [showAutomationFeedback, setShowAutomationFeedback] = useState(false);
  const [automationFeedback, setAutomationFeedback] = useState<AutomationFeedback>({
    runCount: 0,
    lastStatus: "等待自动化任务开始",
    lastOcrText: "",
    ocrMatched: null,
  });

  const handleOpenRecorder = (name: string) => {
    setInitialRecordName(name);
    setIsSettingsOpen(false);
    setIsRecorderOpen(true);
  };

  const handleCloseRecorder = () => {
    setIsRecorderOpen(false);
    setIsSettingsOpen(true);
    // Ideally we should switch to Automation tab, but for now just opening settings is a good start
  };
  const { tabs, activeTabId } = useTabStore();
  const { bossKey } = useSettingsStore();

  useEffect(() => {
    if (window.electron?.updateBossKey) {
      window.electron.updateBossKey(bossKey);
    }
  }, [bossKey]);

  useEffect(() => {
    let detachStatus: (() => void) | undefined;

    const init = async () => {
      if (window.electron && window.electron.checkFlash) {
        try {
          const result = await window.electron.checkFlash();
          setHasFlash(result);
        } catch (e) {
          console.error("Failed to check flash:", e);
          setHasFlash(false);
        }
      } else {
        console.warn("Electron bridge not found");
        setHasFlash(false);
      }

      // Automation status listener for persistent run feedback
      detachStatus = window.electron.automation?.onStatus?.((status) => {
        const parts = status.split("|");
        if (parts[0] !== "STATUS") {
          return;
        }

        const action = parts[1];
        if (action === "PLAYING" || action === "RECORDING") {
          setShowAutomationFeedback(true);
        }

        if (action === "LOOP_START") {
          const currentRound = parseInt(parts[2] || "0", 10);
          setAutomationFeedback((prev) => ({
            ...prev,
            runCount: Number.isNaN(currentRound) ? prev.runCount : currentRound,
            lastStatus: `第 ${parts[2] ?? "0"} 次执行中`,
          }));
          return;
        }

        if (action === "CONDITION_MET") {
          setAutomationFeedback((prev) => ({
            ...prev,
            lastStatus: `停止条件满足，共执行 ${parts[2] ?? prev.runCount} 次`,
          }));
          return;
        }

        if (action === "STOPPED") {
          setAutomationFeedback((prev) => ({
            ...prev,
            lastStatus: `已停止，共执行 ${parts[2] ?? prev.runCount} 次`,
          }));
          return;
        }

        if (action === "OCR_RESULT") {
          const matched = parts[3] === "1";
          let decodedText = "";
          try {
            decodedText = decodeURIComponent(parts.slice(4).join("|") || "");
          } catch {
            decodedText = parts.slice(4).join("|");
          }
          setAutomationFeedback((prev) => ({
            ...prev,
            lastOcrText: decodedText || "（未识别到文本）",
            ocrMatched: matched,
            lastStatus: matched ? "OCR 识别成功，触发停止" : "OCR 未匹配，继续执行",
          }));
          return;
        }

        if (action === "OCR_NOT_INSTALLED") {
          setAutomationFeedback((prev) => ({
            ...prev,
            ocrMatched: false,
            lastStatus: "未安装 OCR 扩展，断点识别不可用",
          }));
          return;
        }

        if (action === "PLAYING") {
          setAutomationFeedback((prev) => ({ ...prev, lastStatus: "自动化执行中" }));
        }
      });

      // Breakpoint Trigger Listener
      if (
        window.electron.automation &&
        window.electron.automation.onBreakpointTriggered
      ) {
        window.electron.automation.onBreakpointTriggered(({ tTrigger }) => {
          pendingTTrigger.current = tTrigger;
          setShowOCRSelection(true);
        });
      }

      // OCR Request Listener for Playback
      if (
        window.electron.automation &&
        window.electron.automation.onOCRRequest
      ) {
        window.electron.automation.onOCRRequest(async (data) => {
          console.log(
            `Renderer: Received OCR Request [id=${data.requestId}]`,
            data.region,
            data.expectedText,
          );
          try {
            // Preprocess (Crop & Scale, but disable heavy filters for Paddle)
            const processedDataUrl = await preprocessImage(
              data.screenshotData,
              data.region,
              {
                scale: 2,
                threshold: 0, // Disable binarization
                invert: false, // Disable inversion
                grayscale: false, // Keep color info
              },
            );

            // Send base64 (without data prefix) to specific OCR handler
            const result = await window.electron.ocr(processedDataUrl);

            let detectedText = "";
            if (result.success && result.data && result.data.code === 100) {
              detectedText = result.data.data
                .map((item: { text?: string }) => item.text ?? "")
                .join("");
            }

            const sanitize = (str: string) => {
              if (!str) return "";
              return str.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "");
            };

            const sanitizedOCR = sanitize(detectedText);
            const expectedParts = data.expectedText
              .split("|")
              .map((p) => p.trim())
              .filter((p) => p.length > 0);

            const matched = expectedParts.some((part) => {
              const sanitizedExpected = sanitize(part);
              return sanitizedOCR.includes(sanitizedExpected);
            });

            console.log(
              `Renderer: Match Result [id=${data.requestId}]: ${matched} (Searched "${data.expectedText}" in "${sanitizedOCR}")`,
            );

            window.electron.automation.ocrResponse({
              requestId: data.requestId,
              text: sanitizedOCR,
              matched,
            });
          } catch (err) {
            console.error(`Renderer: OCR Error [id=${data.requestId}]:`, err);
            window.electron.automation.ocrResponse({
              requestId: data.requestId,
              text: "",
              matched: false,
            });
          }
        });
      }
    };
    init();
    return () => {
      if (typeof detachStatus === "function") {
        detachStatus();
      }
      if (
        window.electron.automation &&
        window.electron.automation.offBreakpointTriggered
      ) {
        window.electron.automation.offBreakpointTriggered();
      }
      if (
        window.electron.automation &&
        window.electron.automation.offOCRRequest
      ) {
        window.electron.automation.offOCRRequest();
      }
    };
  }, []);

  if (hasFlash === null) {
    return <div className="bg-zinc-950 h-screen" />; // Loading state
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden text-zinc-100 bg-zinc-950">
      <TitleBar onSettingsClick={() => setIsSettingsOpen(true)} />

      <div className="flex flex-grow overflow-hidden">
        <div className="flex-grow flex flex-col relative overflow-hidden">
          {!hasFlash ? (
            <FlashTutorial />
          ) : (
            <>
              <TabBar />
              <main className="flex-grow flex flex-col relative overflow-hidden">
                {tabs.map((tab) => (
                  <div
                    key={tab.id}
                    className={`absolute inset-0 flex flex-col transition-opacity duration-200 ${
                      tab.id === activeTabId
                        ? "opacity-100 z-10"
                        : "opacity-0 z-0 pointer-events-none"
                    }`}
                  >
                    {tab.isLibrary ? (
                      <GameLibrary />
                    ) : (
                      <GameView id={tab.id} url={tab.url} />
                    )}
                  </div>
                ))}
              </main>
            </>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      <Settings
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onOpenRecorder={handleOpenRecorder}
      />
      {/* Recorder Toolbar */}
      {isRecorderOpen && (
        <RecorderToolbar
          initialName={initialRecordName}
          onClose={handleCloseRecorder}
        />
      )}

      {/* OCR Region Selection */}
      {showOCRSelection && (
        <OCRSelectionOverlay
          onComplete={async (data) => {
            await window.electron.automation.breakpointResume({
              ...data,
              tTrigger: pendingTTrigger.current,
            });
            pendingTTrigger.current = 0;
            setShowOCRSelection(false);
          }}
          onCancel={async () => {
            await window.electron.automation.breakpointResume({
              x: 0,
              y: 0,
              w: 0,
              h: 0,
              text: "",
              tTrigger: 0,
            });
            pendingTTrigger.current = 0;
            setShowOCRSelection(false);
          }}
        />
      )}

      {showAutomationFeedback && (
        <div className="fixed right-3 top-14 z-40 w-56 rounded-lg border border-zinc-700/80 bg-zinc-900/95 shadow-2xl backdrop-blur p-2.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-zinc-200">自动化执行反馈</p>
              <p className="text-[11px] text-zinc-400 mt-0.5">手动关闭前会保持显示</p>
            </div>
            <button
              className="text-zinc-500 hover:text-zinc-300 text-xs px-1"
              onClick={() => setShowAutomationFeedback(false)}
            >
              关闭
            </button>
          </div>

          <div className="mt-2 space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between rounded-md bg-zinc-800/70 px-2 py-1.5">
              <span className="text-zinc-400">执行次数</span>
              <span className="font-mono text-orange-300">{automationFeedback.runCount}</span>
            </div>
            <div className="rounded-md bg-zinc-800/50 px-2 py-1.5">
              <span className="text-zinc-400">状态：</span>
              <span className="text-zinc-200">{automationFeedback.lastStatus}</span>
            </div>
            <div className="rounded-md bg-zinc-800/50 px-2 py-1.5">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">OCR 结果</span>
                {automationFeedback.ocrMatched !== null && (
                  <span
                    className={`font-semibold ${
                      automationFeedback.ocrMatched ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {automationFeedback.ocrMatched ? "成功" : "失败"}
                  </span>
                )}
              </div>
              <p className="mt-1 break-all text-zinc-200">{automationFeedback.lastOcrText || "暂无"}</p>
            </div>
          </div>
        </div>
      )}

      {/* Update Notifier Overlay */}
      <UpdateNotifier />
    </div>
  );
};

export default App;

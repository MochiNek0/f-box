import React, { useState, useEffect } from "react";
import { TitleBar } from "./components/app/TitleBar";
import { TabBar } from "./components/app/TabBar";
import { GameLibrary } from "./components/app/GameLibrary";
import { GameView } from "./components/app/GameView";
import { FlashTutorial } from "./components/app/FlashTutorial";
import { Settings } from "./components/app/Settings";
import { RecorderToolbar } from "./components/app/RecorderToolbar";
import { OCRSelectionOverlay } from "./components/app/OCRSelectionOverlay";
import { useTabStore } from "./store/useTabStore";
import { useSettingsStore } from "./store/useSettingsStore";
import { preprocessImage } from "./utils/imageProcess";

const App: React.FC = () => {
  const [hasFlash, setHasFlash] = useState<boolean | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRecorderOpen, setIsRecorderOpen] = useState(false);
  const [showOCRSelection, setShowOCRSelection] = useState(false);
  const [initialRecordName, setInitialRecordName] = useState("");

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

      // Initialize Boss Key in main process
      if (window.electron && window.electron.updateBossKey) {
        window.electron.updateBossKey(bossKey);
      }

      // Breakpoint Trigger Listener
      if (
        window.electron.automation &&
        window.electron.automation.onBreakpointTriggered
      ) {
        window.electron.automation.onBreakpointTriggered(() => {
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
                .map((item: any) => item.text)
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
            await window.electron.automation.breakpointResume(data);
            setShowOCRSelection(false);
          }}
          onCancel={async () => {
            // Even if cancel, we should resume recording but maybe without breakpoint?
            // Actually AHK is waiting for a resume signal anyway.
            // Let's send a resume signal with empty/null-ish data?
            // Or just resume with 0,0,0,0,""
            await window.electron.automation.breakpointResume({
              x: 0,
              y: 0,
              w: 0,
              h: 0,
              text: "",
            });
            setShowOCRSelection(false);
          }}
        />
      )}
    </div>
  );
};

export default App;

import React, { useState, useEffect } from "react";
import { TitleBar } from "./components/app/TitleBar";
import { TabBar } from "./components/app/TabBar";
import { GameLibrary } from "./components/app/GameLibrary";
import { GameView } from "./components/app/GameView";
import { FlashTutorial } from "./components/app/FlashTutorial";
import { Settings } from "./components/app/Settings";
import { useTabStore } from "./store/useTabStore";
import { useSettingsStore } from "./store/useSettingsStore";

const App: React.FC = () => {
  const [hasFlash, setHasFlash] = useState<boolean | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
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
    };
    init();
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
      />
    </div>
  );
};

export default App;

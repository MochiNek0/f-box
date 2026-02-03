import React, { useState, useEffect } from "react";
import { TitleBar } from "./components/TitleBar";
import { TabBar } from "./components/TabBar";
import { GameLibrary } from "./components/GameLibrary";
import { GameView } from "./components/GameView";
import { FlashTutorial } from "./components/FlashTutorial";
import { Settings } from "./components/Settings";
import { Sidebar } from "./components/Sidebar";
import { useTabStore } from "./store/useTabStore";
import { useSettingsStore } from "./store/useSettingsStore";

const App: React.FC = () => {
  const [hasFlash, setHasFlash] = useState<boolean | null>(null);
  const [activeView, setActiveView] = useState<"game" | "settings">("game");
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
      <TitleBar />

      <div className="flex flex-grow overflow-hidden">
        {hasFlash && (
          <Sidebar activeView={activeView} onViewChange={setActiveView} />
        )}

        <div className="flex-grow flex flex-col relative overflow-hidden">
          {!hasFlash ? (
            <FlashTutorial />
          ) : (
            <>
              {activeView === "game" ? (
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
              ) : (
                <Settings />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;

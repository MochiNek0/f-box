import React, { useState } from "react";
import { Keyboard } from "lucide-react";
import { Modal } from "../../common/Modal";
import { NavigationTab } from "../../common/NavigationTab";
import { HotkeysTab } from "./HotkeysTab";
import { KeymapTab } from "./KeymapTab";
import { AutomationTab } from "./AutomationTab";
import { ClickerTab } from "./ClickerTab";

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenRecorder: (name: string) => void;
}

export const Settings: React.FC<SettingsProps> = ({
  isOpen,
  onClose,
  onOpenRecorder,
}) => {
  const [activeTab, setActiveTab] = useState<string>("hotkeys");

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="max-w-3xl">
      <div className="flex flex-col h-full">
        <h2 className="text-xl font-black text-foreground flex items-center gap-gr-3 mb-gr-4 uppercase tracking-tighter">
          <Keyboard className="text-primary" size={24} strokeWidth={3} />
          软件设置
        </h2>

        {/* Tab Navigation */}
        <NavigationTab
          className="mb-6"
          items={[
            { id: "hotkeys", label: "快捷键设置" },
            { id: "keymap", label: "按键映射" },
            { id: "automation", label: "操作自动化" },
            { id: "clicker", label: "连点器" },
          ]}
          activeId={activeTab}
          onChange={setActiveTab}
        />

        <div className="h-[60vh] min-h-[400px] relative overflow-y-auto">
          <div className={activeTab === "hotkeys" ? "animate-fade-in block" : "hidden"}>
            <HotkeysTab />
          </div>
          <div className={activeTab === "keymap" ? "animate-fade-in block" : "hidden"}>
            <KeymapTab />
          </div>
          <div className={activeTab === "automation" ? "animate-fade-in block" : "hidden"}>
            <AutomationTab onOpenRecorder={onOpenRecorder} onClose={onClose} />
          </div>
          <div className={activeTab === "clicker" ? "animate-fade-in block" : "hidden"}>
            <ClickerTab />
          </div>
        </div>
      </div>
    </Modal>
  );
};

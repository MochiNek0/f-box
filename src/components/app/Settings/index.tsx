import React, { useState } from "react";
import { Keyboard } from "lucide-react";
import { Modal } from "../../common/Modal";
import { NavigationTab } from "../../common/NavigationTab";
import { HotkeysTab } from "./HotkeysTab";
import { KeymapTab } from "./KeymapTab";
import { AutomationTab } from "./AutomationTab";
import { ClickerTab } from "./ClickerTab";
import { SpeedTab } from "./SpeedTab";

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
            { id: "speed", label: "变速齿轮" },
          ]}
          activeId={activeTab}
          onChange={setActiveTab}
        />

        <div className="max-h-[60vh] relative overflow-y-auto">
          {activeTab === "hotkeys" && <HotkeysTab />}
          {activeTab === "keymap" && <KeymapTab />}
          {activeTab === "automation" && (
            <AutomationTab onOpenRecorder={onOpenRecorder} onClose={onClose} />
          )}
          {activeTab === "clicker" && <ClickerTab />}
          {activeTab === "speed" && <SpeedTab />}
        </div>
      </div>
    </Modal>
  );
};

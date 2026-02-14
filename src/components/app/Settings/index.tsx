import React, { useState } from "react";
import { Keyboard } from "lucide-react";
import { Modal } from "../../common/Modal";
import { NavigationTab } from "../../common/NavigationTab";
import { HotkeysTab } from "./HotkeysTab";
import { KeymapTab } from "./KeymapTab";
import { AutomationTab } from "./AutomationTab";

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
      <div className="p-6 max-md:p-4">
        <h2 className="text-2xl font-bold text-zinc-100 flex items-center gap-3 mb-6">
          <Keyboard className="text-orange-500" size={28} />
          软件设置
        </h2>

        {/* Tab Navigation */}
        <NavigationTab
          className="mb-6"
          items={[
            { id: "hotkeys", label: "快捷键设置" },
            { id: "keymap", label: "按键映射" },
            { id: "automation", label: "操作自动化" },
          ]}
          activeId={activeTab}
          onChange={setActiveTab}
        />

        <div className="max-h-[60vh] relative overflow-y-auto">
          {activeTab === "hotkeys" && <HotkeysTab />}
          {activeTab === "keymap" && <KeymapTab />}
          {activeTab === "automation" && (
            <AutomationTab onOpenRecorder={onOpenRecorder} />
          )}
        </div>
      </div>
    </Modal>
  );
};

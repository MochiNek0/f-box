import React, { useState } from "react";
import { Download, AlertCircle, ExternalLink } from "lucide-react";
import { Modal } from "../../common/Modal";
import { Button } from "../../common/Button";

export const FlashTutorial: React.FC = () => {
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-zinc-100 p-8">
      <div className="max-w-2xl w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl flex flex-col gap-6 max-md:gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-red-500/10 rounded-xl max-md:hidden">
            <AlertCircle className="text-red-500" size={32} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">未检测到 Flash 插件</h1>
            <p className="text-zinc-500">
              本应用需要 Pepper Flash (PPAPI) 插件才能运行游戏。
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-6 max-md:gap-4">
          <div className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700">
            <h2 className="text-sm font-semibold text-zinc-300 mb-2 uppercase tracking-wider">
              安装步骤
            </h2>
            <ol className="list-decimal list-inside space-y-3 text-zinc-400 text-sm">
              <li>
                点击下方按钮前往下载{" "}
                <span className="text-orange-500 font-medium">
                  Flash Player
                </span>{" "}
                官方插件。
              </li>
              <li>
                下载并安装{" "}
                <code className="bg-zinc-700 px-1.5 py-0.5 rounded text-zinc-200">
                  PPAPI
                </code>{" "}
                版本的 Flash Player。
              </li>
              <li>安装完成后,请彻底关闭并重启本应用。</li>
            </ol>
          </div>

          <div className="flex gap-4 max-md:flex-col">
            <Button
              onClick={() =>
                window.electron.openExternal(
                  "https://www.flash.cn/download-wins",
                )
              }
              variant="primary"
              fullWidth
              className="flex items-center justify-center gap-2"
            >
              <Download size={18} />
              <span>下载 Flash 插件 (PPAPI)</span>
            </Button>
            <Button
              onClick={() => setShowModal(true)}
              variant="secondary"
              fullWidth
              className="flex items-center justify-center gap-2"
            >
              <ExternalLink size={18} />
              <span>查看详细教程</span>
            </Button>
          </div>

          <div className="pt-4 border-t border-zinc-800">
            <p className="text-[10px] text-zinc-600 text-center">
              注:Flash Player 已停止支持,请确保从信任的来源获取插件。
            </p>
          </div>
        </div>
      </div>

      {/* 教程弹窗 */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        maxWidth="max-w-2xl"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold flex items-center gap-3">
            <div className="p-2 bg-orange-500/10 rounded-lg">
              <ExternalLink className="text-orange-500" size={20} />
            </div>
            Flash 插件安装详细教程
          </h2>
        </div>

        <div className="space-y-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="flex items-center justify-center w-7 h-7 rounded-full bg-orange-500 text-white text-sm font-bold">
                1
              </span>
              <h3 className="font-semibold text-zinc-200">点击下载按钮</h3>
            </div>
            <p className="text-zinc-400 text-sm leading-relaxed pl-10">
              点击主界面的
              <span className="text-orange-500 mx-1">
                "下载 Flash 插件 (PPAPI)"
              </span>
              按钮,系统将自动使用外部浏览器打开 Adobe Flash Player
              官方下载页面。
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="flex items-center justify-center w-7 h-7 rounded-full bg-orange-500 text-white text-sm font-bold">
                2
              </span>
              <h3 className="font-semibold text-zinc-200">
                选择对应版本并下载
              </h3>
            </div>
            <p className="text-zinc-400 text-sm leading-relaxed pl-10">
              在打开的网页中,寻找适用于您操作系统的 Flash 插件。
              <span className="block mt-2 font-medium text-zinc-300 italic">
                ⚠️ 请务必选择 PPAPI 版本:
              </span>
            </p>
            <div className="pl-10">
              <div className="relative rounded-2xl border border-zinc-700 overflow-hidden bg-zinc-800/50 group">
                <img
                  src="/tutorial.webp"
                  alt="Flash 下载教程"
                  className="w-full h-auto object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                />
                <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-2xl pointer-events-none"></div>
              </div>
            </div>
          </div>

          <div className="space-y-3 pb-4">
            <div className="flex items-center gap-3">
              <span className="flex items-center justify-center w-7 h-7 rounded-full bg-orange-500 text-white text-sm font-bold">
                3
              </span>
              <h3 className="font-semibold text-zinc-200">安装并重启应用</h3>
            </div>
            <p className="text-zinc-400 text-sm leading-relaxed pl-10">
              安装程序下载完成后运行并按照提示完成安装。安装完成后,请
              <span className="text-white font-medium underline underline-offset-4 decoration-orange-500/50">
                务必退出并重新启动
              </span>
              本应用,插件即可生效。
            </p>
          </div>
        </div>

        <div className="mt-6 pt-6 bg-zinc-800/30 border-t border-zinc-800 flex justify-end -mx-4 -mb-4 px-6 pb-6">
          <Button
            onClick={() => setShowModal(false)}
            variant="secondary"
            className="px-8"
          >
            我知道了
          </Button>
        </div>
      </Modal>
    </div>
  );
};

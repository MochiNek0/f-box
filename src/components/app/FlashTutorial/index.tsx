import React, { useState, useCallback } from "react";
import { Download, AlertCircle, ExternalLink, X, ZoomIn } from "lucide-react";
import { Modal } from "../../common/Modal";
import { Button } from "../../common/Button";
import tutorialImage from "../../../assets/tutorial.webp";

export const FlashTutorial: React.FC = () => {
  const [showModal, setShowModal] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const handleClosePreview = useCallback(() => setShowPreview(false), []);

  return (
    <>
      <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-gr-5">
        <div className="max-w-2xl w-full glass-card p-gr-5 flex flex-col gap-gr-4 shadow-2xl">
          <div className="flex items-center gap-gr-3">
            <div className="p-gr-3 bg-red-500/10 rounded-gr-3 max-md:hidden border border-red-500/20">
              <AlertCircle className="text-red-500" size={32} />
            </div>
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tighter">未检测到 Flash 插件</h1>
              <p className="text-zinc-500 text-sm font-medium">
                本应用需要 Pepper Flash (PPAPI) 插件才能运行游戏。
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-gr-5">
            <div className="bg-white/5 rounded-gr-4 p-gr-4 border border-white/10">
              <h2 className="text-[10px] font-black text-zinc-400 mb-gr-3 uppercase tracking-widest border-b border-white/5 pb-gr-1">
                安装步骤
              </h2>
              <ol className="list-decimal list-inside space-y-gr-2 text-zinc-400 text-sm font-medium">
                <li>
                  点击下方按钮前往下载{" "}
                  <span className="text-primary font-bold">
                    Flash Player
                  </span>{" "}
                  官方插件。
                </li>
                <li>
                  下载并安装{" "}
                  <code className="bg-white/10 px-1.5 py-0.5 rounded-gr-1 text-primary-foreground font-mono">
                    PPAPI
                  </code>{" "}
                  版本的 Flash Player。
                </li>
                <li>安装完成后, 请彻底关闭并重启本应用。</li>
              </ol>
            </div>

            <div className="flex gap-gr-3 max-md:flex-col">
              <Button
                onClick={() =>
                  window.electron.openExternal(
                    "https://www.flash.cn/download-wins",
                  )
                }
                variant="primary"
                fullWidth
                size="lg"
                className="flex items-center justify-center gap-gr-2"
              >
                <Download size={18} />
                <span>下载 Flash 插件 (PPAPI)</span>
              </Button>
              <Button
                onClick={() => setShowModal(true)}
                variant="secondary"
                fullWidth
                size="lg"
                className="flex items-center justify-center gap-gr-2"
              >
                <ExternalLink size={18} />
                <span>查看详细教程</span>
              </Button>
            </div>

            <div className="pt-gr-3 border-t border-border">
              <p className="text-[10px] text-zinc-600 text-center font-medium">
                注: Flash Player 已停止支持, 请确保从信任的来源获取插件。
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
          <div className="flex flex-col p-6">
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
                <div className="pl-10 pr-4">
                  <div
                    className="relative rounded-2xl border border-zinc-700 overflow-hidden bg-zinc-800/50 group cursor-zoom-in"
                    onClick={() => setShowPreview(true)}
                    title="点击放大预览"
                  >
                    <img
                      src={tutorialImage}
                      alt="Flash 下载教程"
                      className="w-full h-auto object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                    />
                    <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-2xl pointer-events-none" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 rounded-2xl">
                      <div className="bg-black/60 rounded-full p-2">
                        <ZoomIn size={20} className="text-white" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3 pb-4">
                <div className="flex items-center gap-3">
                  <span className="flex items-center justify-center w-7 h-7 rounded-full bg-orange-500 text-white text-sm font-bold">
                    3
                  </span>
                  <h3 className="font-semibold text-zinc-200">
                    安装并重启应用
                  </h3>
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
          </div>
        </Modal>
      </div>

      {/* 图片放大预览 */}
      {showPreview && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={handleClosePreview}
        >
          <button
            className="absolute top-4 right-4 p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 transition-colors text-zinc-300 hover:text-white outline-none"
            onClick={handleClosePreview}
            aria-label="关闭预览"
          >
            <X size={22} />
          </button>
          <img
            src={tutorialImage}
            alt="Flash 下载教程"
            className="max-w-[90vw] max-h-[90vh] rounded-2xl shadow-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
};

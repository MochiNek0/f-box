import React, { useState } from "react";
import { Download, AlertCircle, ExternalLink, X } from "lucide-react";

export const FlashTutorial: React.FC = () => {
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-zinc-100 p-8">
      <div className="max-w-2xl w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-3 bg-red-500/10 rounded-xl">
            <AlertCircle className="text-red-500" size={32} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">未检测到 Flash 插件</h1>
            <p className="text-zinc-500">
              本应用需要 Pepper Flash (PPAPI) 插件才能运行游戏。
            </p>
          </div>
        </div>

        <div className="space-y-6">
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
              <li>安装完成后，请彻底关闭并重启本应用。</li>
            </ol>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() =>
                window.electron.openExternal(
                  "https://www.flash.cn/download-wins",
                )
              }
              className="flex-1 flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-orange-500/20 outline-none"
            >
              <Download size={18} />
              <span>下载 Flash 插件 (PPAPI)</span>
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="flex-1 flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium py-3 rounded-xl transition-all outline-none"
            >
              <ExternalLink size={18} />
              <span>查看详细教程</span>
            </button>
          </div>

          <div className="pt-4 border-t border-zinc-800">
            <p className="text-[10px] text-zinc-600 text-center">
              注：Flash Player 已停止支持，请确保从信任的来源获取插件。
            </p>
          </div>
        </div>
      </div>

      {/* 教程弹窗 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* 头部 */}
            <div className="flex items-center justify-between p-6 border-b border-zinc-800">
              <h2 className="text-xl font-bold flex items-center gap-3">
                <div className="p-2 bg-orange-500/10 rounded-lg">
                  <ExternalLink className="text-orange-500" size={20} />
                </div>
                Flash 插件安装详细教程
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 bg-transparent rounded-xl text-zinc-400 hover:text-white transition-colors outline-none"
                aria-label="关闭"
              >
                <X size={24} />
              </button>
            </div>

            {/* 内容 */}
            <div className="p-6 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {/* 第一步 */}
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
                    “下载 Flash 插件 (PPAPI)”
                  </span>
                  按钮，系统将自动使用外部浏览器打开 Adobe Flash Player
                  官方下载页面。
                </p>
              </div>

              {/* 第二步 */}
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
                  在打开的网页中，寻找适用于您操作系统的 Flash 插件。
                  <span className="block mt-2 font-medium text-zinc-300 italic">
                    ⚠️ 请务必选择 PPAPI 版本：
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

              {/* 第三步 */}
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
                  安装程序下载完成后运行并按照提示完成安装。安装完成后，请
                  <span className="text-white font-medium underline underline-offset-4 decoration-orange-500/50">
                    务必退出并重新启动
                  </span>
                  本应用，插件即可生效。
                </p>
              </div>
            </div>

            {/* 底部按钮 */}
            <div className="p-6 bg-zinc-800/30 border-t border-zinc-800 flex justify-end">
              <button
                onClick={() => setShowModal(false)}
                className="px-8 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium rounded-xl transition-all active:scale-95 outline-none"
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

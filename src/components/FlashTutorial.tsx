import React from "react";
import { Download, AlertCircle, ExternalLink } from "lucide-react";

export const FlashTutorial: React.FC = () => {
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
            <button className="flex-1 flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium py-3 rounded-xl transition-all outline-none">
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
    </div>
  );
};

import React, { useState, useEffect } from "react";
import { X, Download, FolderOpen } from "lucide-react";
import { Button } from "../../common/Button";
import { IconButton } from "../../common/IconButton";

export const UpdateNotifier: React.FC = () => {
  const [updateInfo, setUpdateInfo] = useState<{
    version: string;
    url: string;
  } | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const result = await window.electron.checkUpdate();

        if (result.available && result.version && result.url) {
          setUpdateInfo({ version: result.version, url: result.url });
          setIsVisible(true);
        }
      } catch (error) {
        // Silently catch errors (e.g. network timeout or blocked by firewall).
        console.info("Update check skipped due to network or timeout:", error);
      }
    };

    // Check slightly after startup to not block initial render and animations
    setTimeout(checkUpdate, 3000);
  }, []);

  useEffect(() => {
    if (isDownloading) {
      window.electron.onUpdateProgress((percent: number) => {
        setDownloadProgress(percent);
      });
      return () => {
        window.electron.offUpdateProgress();
      };
    }
  }, [isDownloading]);

  const handleDownload = async () => {
    if (!updateInfo) return;
    setIsDownloading(true);
    setError(null);
    try {
      const result = await window.electron.downloadUpdate(updateInfo.url);
      if (!result.success) {
        setError(result.error || "下载失败");
        setIsDownloading(false);
      } else {
        // 下载完成，文件夹已打开
        setDownloaded(true);
        setIsDownloading(false);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "更新过程中发生错误";
      setError(message);
      setIsDownloading(false);
    }
  };

  if (!isVisible || !updateInfo) return null;

  return (
    <div className="fixed bottom-gr-4 right-gr-4 glass border border-white/10 shadow-2xl rounded-gr-3 p-gr-4 flex flex-col gap-gr-3 z-[100] animate-in slide-in-from-bottom-5 fade-in duration-300 w-80 text-foreground">
      <div className="flex justify-between items-start">
        <h3 className="font-black text-[10px] uppercase tracking-widest text-zinc-500">发现新版本</h3>
        {!isDownloading && !downloaded && (
          <IconButton
            icon={<X size={16} />}
            onClick={() => setIsVisible(false)}
            size="sm"
            className="text-zinc-600 hover:text-foreground -mr-1 -mt-1"
          />
        )}
      </div>

      <p className="text-sm font-medium leading-relaxed">
        F-Box{" "}
        <span className="font-black text-primary px-1">
          {updateInfo.version}
        </span>{" "}
        现已发布。下载完成后将打开下载目录，请手动解压并替换当前版本。
      </p>

      {isDownloading && (
        <div className="space-y-gr-2">
          <div className="flex justify-between text-[10px] font-black text-zinc-500 uppercase tracking-tighter">
            <span>正在下载...</span>
            <span>{downloadProgress}%</span>
          </div>
          <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
            <div
              className="h-full bg-primary transition-all duration-300 shadow-[0_0_10px_rgba(var(--primary),0.5)]"
              style={{ width: `${downloadProgress}%` }}
            />
          </div>
        </div>
      )}

      {downloaded && (
        <div className="flex items-center gap-gr-2 text-xs font-black uppercase tracking-tighter text-emerald-400 bg-emerald-500/10 px-gr-3 py-gr-2 rounded-gr-2 border border-emerald-500/20">
          <FolderOpen size={16} />
          <span>已打开下载目录，请手动解压替换</span>
        </div>
      )}

      {error && <p className="text-[10px] font-bold text-red-400 mt-1 uppercase">{error}</p>}

      {!isDownloading && !downloaded && (
        <div className="flex justify-end gap-gr-2 mt-gr-1">
          <Button
            onClick={() => setIsVisible(false)}
            variant="ghost"
            size="sm"
            className="text-zinc-500 hover:text-foreground"
          >
            稍后
          </Button>
          <Button
            onClick={handleDownload}
            size="sm"
            className="gap-gr-2 px-gr-4 text-black"
          >
            <Download size={13} strokeWidth={3} />
            <span>下载更新</span>
          </Button>
        </div>
      )}

      {downloaded && (
        <div className="flex justify-end mt-gr-1">
          <Button
            onClick={() => setIsVisible(false)}
            variant="ghost"
            size="sm"
            className="text-zinc-500 hover:text-foreground"
          >
            关闭
          </Button>
        </div>
      )}
    </div>
  );
};

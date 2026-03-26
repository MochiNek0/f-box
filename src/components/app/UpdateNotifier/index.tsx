import React, { useState, useEffect } from "react";
import { X, Download, FolderOpen } from "lucide-react";

interface GithubReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface GithubRelease {
  tag_name?: string;
  assets?: GithubReleaseAsset[];
}

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
        const currentVersion = await window.electron.getAppVersion();

        // Use an AbortController for setting a timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

        const response = await fetch(
          "https://api.github.com/repos/MochiNek0/f-box/releases/latest",
          {
            signal: controller.signal,
          },
        );

        clearTimeout(timeoutId);

        if (!response.ok) return;

        const data = (await response.json()) as GithubRelease;
        const latestVersionStr = data.tag_name || "";

        // Find zip asset
        const zipAsset = data.assets?.find((asset) =>
          asset.name.toLowerCase().endsWith(".zip"),
        );
        const downloadUrl = zipAsset?.browser_download_url;

        if (!downloadUrl) return;

        // Simple version comparison. Assumes tags like 'v1.0.0' or '1.0.0'
        const cleanLatest = latestVersionStr.replace(/^v/, "");
        const cleanCurrent = currentVersion.replace(/^v/, "");

        // Basic string/numeric comparison for major.minor.patch
        const parseVersion = (v: string) => v.split(".").map(Number);
        const latestParts = parseVersion(cleanLatest);
        const currentParts = parseVersion(cleanCurrent);

        let isNewer = false;
        for (
          let i = 0;
          i < Math.max(latestParts.length, currentParts.length);
          i++
        ) {
          const l = latestParts[i] || 0;
          const c = currentParts[i] || 0;
          if (l > c) {
            isNewer = true;
            break;
          } else if (l < c) {
            break;
          }
        }

        if (isNewer) {
          setUpdateInfo({ version: latestVersionStr, url: downloadUrl });
          setIsVisible(true);
        }
      } catch (error) {
        // Silently catch errors (e.g. network timeout or blocked by firewall)
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
          <button
            onClick={() => setIsVisible(false)}
            className="text-zinc-600 hover:text-foreground transition-colors p-1 -mr-1 -mt-1 rounded focus:outline-none"
          >
            <X size={16} />
          </button>
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
          <button
            onClick={() => setIsVisible(false)}
            className="px-gr-3 py-gr-2 text-[10px] font-black text-zinc-500 hover:text-foreground uppercase tracking-widest transition-colors"
          >
            稍后
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center justify-center gap-gr-2 px-gr-4 py-gr-2 text-[10px] font-black bg-primary text-black rounded-gr-2 shadow-lg transition-all uppercase tracking-tighter"
          >
            <Download size={13} strokeWidth={3} />
            <span>下载更新</span>
          </button>
        </div>
      )}

      {downloaded && (
        <div className="flex justify-end mt-gr-1">
          <button
            onClick={() => setIsVisible(false)}
            className="px-gr-3 py-gr-2 text-[10px] font-black text-zinc-500 hover:text-foreground uppercase tracking-widest transition-colors"
          >
            关闭
          </button>
        </div>
      )}
    </div>
  );
};

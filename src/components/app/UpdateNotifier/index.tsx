import React, { useState, useEffect } from "react";
import { X, Download, Loader2 } from "lucide-react";

export const UpdateNotifier: React.FC = () => {
  const [updateInfo, setUpdateInfo] = useState<{
    version: string;
    url: string;
  } | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

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

        const data = await response.json();
        const latestVersionStr = data.tag_name || "";

        // Find zip asset
        const zipAsset = data.assets?.find((a: any) =>
          a.name.toLowerCase().endsWith(".zip"),
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
      }
    } catch (err: any) {
      setError(err.message || "更新过程中发生错误");
      setIsDownloading(false);
    }
  };

  if (!isVisible || !updateInfo) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-zinc-800 border border-zinc-700 shadow-xl rounded-lg p-4 flex flex-col gap-3 z-[100] animate-in slide-in-from-bottom-5 fade-in duration-300 w-80 text-zinc-100">
      <div className="flex justify-between items-start">
        <h3 className="font-semibold text-sm">发现新版本</h3>
        {!isDownloading && (
          <button
            onClick={() => setIsVisible(false)}
            className="text-zinc-400 hover:text-white transition-colors p-1 -mr-1 -mt-1 rounded focus:outline-none"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <p className="text-[13px] text-zinc-300 leading-relaxed">
        F-Box{" "}
        <span className="font-mono bg-zinc-700/50 px-1 py-0.5 rounded text-zinc-200">
          {updateInfo.version}
        </span>{" "}
        现已发布。更新将自动下载并替换当前版本。
      </p>

      {isDownloading && (
        <div className="space-y-2">
          <div className="flex justify-between text-[11px] text-zinc-400">
            <span>正在下载并准备更新...</span>
            <span>{downloadProgress}%</span>
          </div>
          <div className="h-1.5 w-full bg-zinc-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-orange-500 transition-all duration-300"
              style={{ width: `${downloadProgress}%` }}
            />
          </div>
        </div>
      )}

      {error && <p className="text-[11px] text-red-400 mt-1">{error}</p>}

      {!isDownloading && (
        <div className="flex justify-end gap-2 mt-1">
          <button
            onClick={() => setIsVisible(false)}
            className="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-700/50 rounded transition-colors"
          >
            稍后
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-orange-600 hover:bg-orange-500 text-white rounded shadow-sm transition-all hover:shadow focus:ring-2 focus:ring-orange-500/50 outline-none"
          >
            {isDownloading ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                <span>更新中...</span>
              </>
            ) : (
              <>
                <Download size={13} />
                <span>立即更新</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

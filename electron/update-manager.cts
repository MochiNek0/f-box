import { app, ipcMain, shell } from "electron";
import path from "path";
import fs from "fs";
import https from "https";
import { getFastestProxy } from "./proxy-utils.cjs";

interface ReleaseAsset {
  name: string;
  browser_download_url?: string;
  url?: string;
}

interface ReleaseInfo {
  tag_name?: string;
  version?: string;
  downloadUrl?: string;
  download_url?: string;
  url?: string;
  assets?: ReleaseAsset[];
}

interface UpdateInfo {
  version: string;
  url: string;
  assetName?: string;
  source: EndpointSource;
}

type EndpointSource = "cloudflare" | "github";

const CLOUDFLARE_UPDATE_ENDPOINTS: string[] = [
  "https://fbox-cdn.bearbug.dpdns.org/update.json",
];

const GITHUB_LATEST_RELEASE_API =
  "https://api.github.com/repos/MochiNek0/f-box/releases/latest";

function uniqueUrls(urls: Array<string | undefined | null>): string[] {
  return Array.from(new Set(urls.filter(Boolean) as string[]));
}

function getConfiguredUpdateEndpoints(
  sources: EndpointSource[] = ["cloudflare", "github"],
): Array<{ url: string; source: EndpointSource }> {
  const cloudflareEndpoints: Array<{ url: string; source: EndpointSource }> =
    CLOUDFLARE_UPDATE_ENDPOINTS.map((url) => ({
      url,
      source: "cloudflare",
    }));
  const fallbackEndpoints: Array<{ url: string; source: EndpointSource }> = [
    { url: GITHUB_LATEST_RELEASE_API, source: "github" },
  ];

  const seen = new Set<string>();
  return [
    ...cloudflareEndpoints,
    ...fallbackEndpoints,
  ].filter((endpoint) => {
    if (!sources.includes(endpoint.source)) return false;
    if (seen.has(endpoint.url)) return false;
    seen.add(endpoint.url);
    return true;
  });
}

function compareVersions(latest: string, current: string): number {
  const parseVersion = (version: string) =>
    version
      .replace(/^v/i, "")
      .split(/[.-]/)
      .map((part) => Number.parseInt(part, 10))
      .map((part) => (Number.isFinite(part) ? part : 0));

  const latestParts = parseVersion(latest);
  const currentParts = parseVersion(current);
  const length = Math.max(latestParts.length, currentParts.length);

  for (let i = 0; i < length; i++) {
    const latestPart = latestParts[i] || 0;
    const currentPart = currentParts[i] || 0;

    if (latestPart > currentPart) return 1;
    if (latestPart < currentPart) return -1;
  }

  return 0;
}

function pickDownloadAsset(release: ReleaseInfo): ReleaseAsset | undefined {
  return release.assets?.find((asset) =>
    asset.name.toLowerCase().endsWith(".zip"),
  );
}

function resolveUpdateUrl(baseUrl: string, downloadUrl: string): string {
  try {
    return new URL(downloadUrl, baseUrl).toString();
  } catch {
    return downloadUrl;
  }
}

export class UpdateManager {
  setupIPCHandlers(): void {
    ipcMain.handle("check-update", async () => {
      try {
        const latest = await this.getLatestUpdateInfo();
        if (!latest) {
          return { available: false };
        }

        const currentVersion = app.getVersion();
        const available = compareVersions(latest.version, currentVersion) > 0;

        return {
          available,
          version: latest.version,
          url: latest.url,
          assetName: latest.assetName,
          source: latest.source,
        };
      } catch (error: any) {
        console.info("Update check skipped:", error);
        return { available: false, error: error.message };
      }
    });

    ipcMain.handle("download-update", async (event, url: string) => {
      try {
        const downloadUrls = uniqueUrls([await getFastestProxy(url), url]);

        const downloadDir = app.getPath("downloads");
        const zipPath = path.join(downloadDir, "F-Box-Update.zip");

        const downloadFile = (downloadUrl: string): Promise<string> => {
          return new Promise((resolve, reject) => {
            https
              .get(downloadUrl, (response) => {
                if (
                  response.statusCode === 301 ||
                  response.statusCode === 302 ||
                  response.statusCode === 307 ||
                  response.statusCode === 308
                ) {
                  return resolve(downloadFile(response.headers.location!));
                }

                if (response.statusCode !== 200) {
                  return reject(new Error(`HTTP ${response.statusCode}`));
                }

                const totalSize = parseInt(
                  response.headers["content-length"] || "0",
                  10,
                );
                let downloadedSize = 0;
                const file = fs.createWriteStream(zipPath);

                response.on("data", (chunk) => {
                  downloadedSize += chunk.length;
                  if (totalSize > 0) {
                    const percent = Math.round(
                      (downloadedSize / totalSize) * 100,
                    );
                    event.sender.send("update-progress", percent);
                  }
                });

                response.pipe(file);

                file.on("finish", () => {
                  file.close(() => resolve(zipPath));
                });

                file.on("error", (err) => {
                  fs.unlink(zipPath, () => reject(err));
                });
              })
              .on("error", reject);
          });
        };

        let lastError: Error | null = null;
        for (const downloadUrl of downloadUrls) {
          try {
            console.log("Using URL for download:", downloadUrl);
            await downloadFile(downloadUrl);
            lastError = null;
            break;
          } catch (error: any) {
            lastError = error;
            event.sender.send("update-progress", 0);
            console.warn(`Download failed from ${downloadUrl}:`, error);
          }
        }

        if (lastError) {
          const githubFallback = await this.getLatestUpdateInfo(["github"]);
          const githubUrls = githubFallback
            ? uniqueUrls([
                await getFastestProxy(githubFallback.url),
                githubFallback.url,
              ])
            : [];

          for (const downloadUrl of githubUrls) {
            if (downloadUrls.includes(downloadUrl)) continue;

            try {
              console.log(
                "Using GitHub fallback URL for download:",
                downloadUrl,
              );
              await downloadFile(downloadUrl);
              lastError = null;
              break;
            } catch (error: any) {
              lastError = error;
              event.sender.send("update-progress", 0);
              console.warn(
                `GitHub fallback download failed from ${downloadUrl}:`,
                error,
              );
            }
          }
        }

        if (lastError) {
          throw lastError;
        }

        console.log("Download completed:", zipPath);

        shell.showItemInFolder(zipPath);

        return { success: true };
      } catch (error: any) {
        console.error("Update error:", error);
        return { success: false, error: error.message };
      }
    });
  }

  private async getLatestUpdateInfo(
    sources?: EndpointSource[],
  ): Promise<UpdateInfo | null> {
    const endpoints = getConfiguredUpdateEndpoints(sources);

    for (const endpoint of endpoints) {
      const candidates = uniqueUrls([
        await getFastestProxy(endpoint.url),
        endpoint.url,
      ]);

      for (const candidate of candidates) {
        try {
          const release = await this.fetchJson<ReleaseInfo>(candidate);
          const version = release.version || release.tag_name;
          const asset = pickDownloadAsset(release);
          const downloadUrl =
            release.downloadUrl ||
            release.download_url ||
            asset?.browser_download_url ||
            (!release.assets ? release.url : undefined);

          if (version && downloadUrl) {
            return {
              version,
              url: resolveUpdateUrl(candidate, downloadUrl),
              assetName: asset?.name,
              source: endpoint.source,
            };
          }

          console.warn(
            `Update endpoint missing version or download URL: ${candidate}`,
          );
        } catch (error) {
          console.warn(`Update endpoint failed: ${candidate}`, error);
        }
      }
    }

    return null;
  }

  private fetchJson<T>(url: string, timeout = 8000): Promise<T> {
    return new Promise((resolve, reject) => {
      const request = https.get(
        url,
        {
          timeout,
          headers: {
            Accept: "application/vnd.github+json, application/json",
            "User-Agent": "F-Box-Updater",
          },
        },
        (response) => {
          if (
            response.statusCode === 301 ||
            response.statusCode === 302 ||
            response.statusCode === 307 ||
            response.statusCode === 308
          ) {
            response.resume();
            this.fetchJson<T>(response.headers.location!, timeout)
              .then(resolve)
              .catch(reject);
            return;
          }

          if (
            !response.statusCode ||
            response.statusCode < 200 ||
            response.statusCode >= 300
          ) {
            response.resume();
            reject(new Error(`HTTP ${response.statusCode}`));
            return;
          }

          let raw = "";
          response.setEncoding("utf8");
          response.on("data", (chunk) => {
            raw += chunk;
          });
          response.on("end", () => {
            try {
              resolve(JSON.parse(raw) as T);
            } catch (error) {
              reject(error);
            }
          });
        },
      );

      request.on("timeout", () => {
        request.destroy(new Error(`Timeout after ${timeout}ms`));
      });
      request.on("error", reject);
    });
  }

  cleanupIPCHandlers(): void {
    ipcMain.removeHandler("check-update");
    ipcMain.removeHandler("download-update");
  }
}

import { app, ipcMain, shell } from "electron";
import path from "path";
import fs from "fs";
import https from "https";
import { getFastestProxy } from "./proxy-utils.cjs";

export class UpdateManager {
  setupIPCHandlers(): void {
    ipcMain.handle("download-update", async (event, url: string) => {
      try {
        const downloadUrl = await getFastestProxy(url);
        console.log("Using URL for download:", downloadUrl);

        const downloadDir = app.getPath("downloads");
        const zipPath = path.join(downloadDir, "F-Box-Update.zip");

        // 下载文件
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

        await downloadFile(downloadUrl);
        console.log("Download completed:", zipPath);

        // 打开下载目录
        shell.showItemInFolder(zipPath);

        return { success: true };
      } catch (error: any) {
        console.error("Update error:", error);
        return { success: false, error: error.message };
      }
    });
  }
}

import https from "https";

const GITHUB_PROXIES = [
  "https://gh-proxy.org/",
  "https://cdn.gh-proxy.org/",
  "https://edgeone.gh-proxy.org/",
  "https://ghp.ci/",
  "https://mirror.ghproxy.com/",
];

/**
 * Tests a proxy URL to see if it's responsive.
 * @param proxyUrl The proxy base URL
 * @param githubUrl The original GitHub URL
 * @returns Promise that resolves if the proxy is responsive
 */
async function testProxy(proxyUrl: string, githubUrl: string): Promise<string> {
  const fullUrl = `${proxyUrl}${githubUrl}`;
  return new Promise((resolve, reject) => {
    // We use a HEAD request to quickly check connectivity without downloading the whole file.
    // However, some proxies might not support HEAD or might react differently.
    // So we'll use a GET request with a timeout.
    const req = https.get(fullUrl, { timeout: 5000 }, (res) => {
      // 200 is success, 3xx are redirects (likely to the actual file)
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
        req.destroy(); // Stop the request
        resolve(fullUrl);
      } else {
        reject(new Error(`Status: ${res.statusCode}`));
      }
    });

    req.on("error", (err) => {
      reject(err);
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Timeout"));
    });
  });
}

/**
 * Races multiple proxies to find the fastest one for a given GitHub URL.
 * @param githubUrl The original GitHub download URL
 * @returns The fastest proxy URL or the original URL if all proxies fail
 */
export async function getFastestProxy(githubUrl: string): Promise<string> {
  if (!githubUrl.includes("github.com")) {
    return githubUrl;
  }

  console.log(`Testing proxies for: ${githubUrl}`);

  // Clean the URL (remove any existing proxy prefix if present)
  let cleanUrl = githubUrl;
  if (cleanUrl.startsWith("https://ghp.ci/")) {
    cleanUrl = cleanUrl.replace("https://ghp.ci/", "");
  } else if (cleanUrl.startsWith("https://mirror.ghproxy.com/")) {
    cleanUrl = cleanUrl.replace("https://mirror.ghproxy.com/", "");
  }

  // Create promises for all proxies
  const tests = GITHUB_PROXIES.map((proxy) => testProxy(proxy, cleanUrl));

  try {
    // Return the first one that succeeds
    const fastest = await Promise.any(tests);
    console.log(`Fastest proxy selected: ${fastest}`);
    return fastest;
  } catch (e) {
    console.warn(
      "All proxies failed or timed out, falling back to original URL",
    );
    return cleanUrl;
  }
}

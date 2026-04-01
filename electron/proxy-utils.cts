import https from "https";

/**
 * 代理配置类型定义
 */
interface ProxyConfig {
  url: string;
  priority: number;
  name: string;
  /** 可选：自定义构建完整代理 URL 的方法。如果不提供，则默认直接拼接 */
  buildUrl?: (proxyUrl: string, githubUrl: string) => string;
}

/**
 * GitHub 代理列表（按优先级排序）
 * 经过筛选的稳定代理，适用于中国大陆地区访问
 */
const GITHUB_PROXIES: ProxyConfig[] = [
  // 高优先级 - 稳定性最好的代理
  { url: "https://mirror.ghproxy.com/", priority: 1, name: "ghproxy" },
  { url: "https://gh-proxy.com/", priority: 2, name: "gh-proxy.com" },
  { url: "https://ghp.ci/", priority: 3, name: "ghp.ci" },
  { url: "https://ghproxy.net/", priority: 4, name: "ghproxy.net" },
  { url: "https://hub.gitmirror.com/", priority: 5, name: "gitmirror" },
  { url: "https://github.moeyy.xyz/", priority: 6, name: "moeyy" },
  {
    url: "https://kkgithub.com/",
    priority: 7,
    name: "kkgithub",
    buildUrl: (proxyUrl, githubUrl) => {
      return githubUrl.replace(/^https?:\/\/github\.com/i, "https://kkgithub.com");
    },
  },
];

/**
 * 代理测试结果
 */
interface ProxyTestResult {
  proxy: ProxyConfig;
  speed: number;
  success: boolean;
  error?: string;
}

/**
 * 统一构建代理 URL
 */
function buildProxyUrl(proxy: ProxyConfig, cleanUrl: string): string {
  return proxy.buildUrl
    ? proxy.buildUrl(proxy.url, cleanUrl)
    : `${proxy.url}${cleanUrl}`;
}

/**
 * 标准化 GitHub URL，移除已有的代理前缀
 * @param url 原始 URL
 * @returns 标准化后的 GitHub URL
 */
function normalizeGitHubUrl(url: string): string {
  let normalized = url;

  // 1. 处理特殊的"相对路径"代理 (如 x-get)
  const relativeProxyPrefixes = ["https://xget.xi-xu.me/gh/"];
  for (const prefix of relativeProxyPrefixes) {
    if (normalized.startsWith(prefix)) {
      // 剥离前缀后，需要把 https://github.com/ 补回来
      normalized = `https://github.com/${normalized.slice(prefix.length)}`;
      return normalized;
    }
  }

  // 2. 处理常规的"绝对路径"代理
  const proxyPrefixes = [
    "https://ghp.ci/",
    "https://mirror.ghproxy.com/",
    "https://gh-proxy.llync.com/",
    "https://github.moeyy.xyz/",
    "https://ghproxy.cc/",
    "https://ghproxy.net/",
    "https://gh-proxy.org/",
    "https://cdn.gh-proxy.org/",
    "https://edgeone.gh-proxy.org/",
  ];

  for (const prefix of proxyPrefixes) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length);
      break;
    }
  }

  return normalized;
}

/**
 * 检查 URL 是否是有效的 GitHub URL
 * @param url 要检查的 URL
 * @returns 是否为 GitHub URL
 */
function isGitHubUrl(url: string): boolean {
  const cleanUrl = normalizeGitHubUrl(url);
  return (
    cleanUrl.includes("github.com") &&
    (cleanUrl.includes("/releases/download/") || cleanUrl.includes("/archive/"))
  );
}

/**
 * 使用 HEAD 请求快速测试 URL 连通性
 * @param url 要测试的 URL
 * @param timeout 超时时间（毫秒）
 * @returns 响应时间和状态码
 */
async function testUrlConnectivity(
  url: string,
  timeout: number = 5000,
): Promise<{ speed: number; statusCode: number | undefined }> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const req = https.request(
      url,
      {
        method: "HEAD",
        timeout,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      },
      (res) => {
        const speed = Date.now() - startTime;
        res.resume(); // 确保释放连接
        resolve({ speed, statusCode: res.statusCode });
      },
    );

    req.on("error", (err) => reject(err));

    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Timeout after ${timeout}ms`));
    });

    req.end();
  });
}

/**
 * 测试代理的连通性和速度
 * @param proxy 代理配置
 * @param githubUrl 原始 GitHub URL
 * @param timeout 超时时间
 * @returns 测试结果
 */
async function testProxy(
  proxy: ProxyConfig,
  githubUrl: string,
  timeout: number = 8000,
): Promise<ProxyTestResult> {
  // 使用新的构建函数生成 URL
  const fullUrl = buildProxyUrl(proxy, githubUrl);

  try {
    const { speed, statusCode } = await testUrlConnectivity(fullUrl, timeout);

    const isSuccess =
      statusCode !== undefined && statusCode >= 200 && statusCode < 400;

    return {
      proxy,
      speed,
      success: isSuccess,
      error: isSuccess ? undefined : `HTTP ${statusCode}`,
    };
  } catch (error) {
    return {
      proxy,
      speed: -1,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * 缓存最近的代理选择结果
 * 用于避免每次都重新测试
 */
const proxyCache = new Map<string, { url: string; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 分钟缓存

/**
 * 使用缓存的代理结果（如果可用）
 * @param githubUrl 原始 GitHub URL
 * @returns 缓存的代理 URL 或 null
 */
function getCachedProxy(githubUrl: string): string | null {
  const cacheKey = normalizeGitHubUrl(githubUrl);
  const cached = proxyCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log(`[Proxy] Using cached proxy: ${cached.url}`);
    return cached.url;
  }

  return null;
}

/**
 * 缓存代理选择结果
 * @param githubUrl 原始 GitHub URL
 * @param proxyUrl 选中的代理 URL
 */
function cacheProxy(githubUrl: string, proxyUrl: string): void {
  const cacheKey = normalizeGitHubUrl(githubUrl);
  proxyCache.set(cacheKey, { url: proxyUrl, timestamp: Date.now() });
}

/**
 * 批量测试代理，返回成功的代理列表
 * @param proxies 要测试的代理列表
 * @param githubUrl 原始 GitHub URL
 * @param concurrency 并发数量
 * @returns 成功的测试结果，按速度排序
 */
async function batchTestProxies(
  proxies: ProxyConfig[],
  githubUrl: string,
  concurrency: number = 3,
): Promise<ProxyTestResult[]> {
  const results: ProxyTestResult[] = [];

  // 按优先级分批测试
  for (let i = 0; i < proxies.length; i += concurrency) {
    const batch = proxies.slice(i, i + concurrency);
    const batchPromises = batch.map((proxy) => testProxy(proxy, githubUrl));
    const batchResults = await Promise.all(batchPromises);

    for (const result of batchResults) {
      if (result.success) {
        console.log(`[Proxy] ${result.proxy.name} OK (${result.speed}ms)`);
        results.push(result);
      } else {
        console.log(`[Proxy] ${result.proxy.name} FAILED: ${result.error}`);
      }
    }

    // 如果第一批就有成功的，优先使用第一批的结果
    if (results.length > 0 && i < concurrency) {
      break;
    }
  }

  // 按速度排序
  return results.sort((a, b) => a.speed - b.speed);
}

/**
 * 为 GitHub Release 下载选择最优的代理或直连
 * @param githubUrl 原始 GitHub 下载 URL
 * @returns 优化后的下载 URL
 */
export async function getFastestProxy(githubUrl: string): Promise<string> {
  // 非 GitHub URL 直接返回
  if (!isGitHubUrl(githubUrl)) {
    return githubUrl;
  }

  // 标准化 URL
  const cleanUrl = normalizeGitHubUrl(githubUrl);

  // 检查缓存
  const cached = getCachedProxy(githubUrl);
  if (cached) {
    return cached;
  }

  console.log(`[Proxy] Selecting proxy for: ${cleanUrl}`);

  // 步骤 1: 快速测试直连（HEAD 请求，3 秒超时）
  let useDirect = false;
  try {
    const { speed, statusCode } = await testUrlConnectivity(cleanUrl, 3000);
    const isSuccess =
      statusCode !== undefined && statusCode >= 200 && statusCode < 400;

    if (isSuccess) {
      console.log(`[Proxy] Direct connection OK (${speed}ms)`);
      // 直连响应快（< 1500ms），直接使用
      if (speed < 1500) {
        useDirect = true;
      }
    }
  } catch (e) {
    console.log(
      `[Proxy] Direct connection failed: ${e instanceof Error ? e.message : "Unknown"}`,
    );
  }

  if (useDirect) {
    console.log(`[Proxy] Using direct connection`);
    cacheProxy(githubUrl, cleanUrl);
    return cleanUrl;
  }

  // 步骤 2: 测试代理（按优先级分批）
  console.log(`[Proxy] Testing ${GITHUB_PROXIES.length} proxies...`);
  const results = await batchTestProxies(GITHUB_PROXIES, cleanUrl, 3);

  if (results.length > 0) {
    const bestProxy = results[0];

    // 使用统一的方法生成最终的 URL
    const proxyUrl = buildProxyUrl(bestProxy.proxy, cleanUrl);

    console.log(
      `[Proxy] Selected: ${bestProxy.proxy.name} (${bestProxy.speed}ms) -> ${proxyUrl}`,
    );
    cacheProxy(githubUrl, proxyUrl);
    return proxyUrl;
  }

  // 步骤 3: 所有代理失败，降级到直连
  console.warn(`[Proxy] All proxies failed, falling back to direct connection`);
  cacheProxy(githubUrl, cleanUrl);
  return cleanUrl;
}

/**
 * 清除代理缓存
 */
export function clearProxyCache(): void {
  proxyCache.clear();
  console.log("[Proxy] Cache cleared");
}

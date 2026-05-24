/** 抖音视频解析核心逻辑
 *
 * 解析策略（2026 年更新）：
 * - www.douyin.com 已启用 JS VM 保护，RENDER_DATA 不再服务端渲染
 * - 主路径：iesdouyin.com/share/video/{id} 的 window._ROUTER_DATA
 * - 备选：抖音内部 API（需要有效 Cookie + 签名，当前受限）
 */

import type {
  VideoInfo,
  IesdouyinItem,
  IesdouyinRouterData,
  DouyinApiResponse,
  DouyinAwemeDetail,
  ParsedUrlResult,
} from './types';
import {
  getDouyinApiHeaders,
  extractVideoId,
  extractCleanUrl,
  ensureHttps,
  toWatermarkFreeUrl,
  isDouyinUrl,
  MOBILE_USER_AGENT,
} from './utils';

/**
 * 解析抖音分享链接，获取视频信息
 * 解析流程：
 * 1. 跟踪短链重定向获取 iesdouyin 分享页 URL 和视频 ID
 * 2. 优先从 iesdouyin 分享页的 _ROUTER_DATA 提取视频信息
 * 3. 备选：调用抖音内部 API 获取视频详情
 * @param shareUrl - 抖音分享链接
 * @returns 解析后的视频信息
 * @throws 解析失败时抛出错误
 */
export async function parseDouyinVideo(shareUrl: string): Promise<VideoInfo> {
  // Step 1: 校验链接
  if (!isDouyinUrl(shareUrl)) {
    throw new Error('无效的抖音链接，请检查链接格式');
  }

  // Step 2: 跟踪重定向，获取长链接和视频 ID
  const parsedUrl = await resolveShortUrl(shareUrl);
  if (!parsedUrl.videoId) {
    throw new Error('无法从链接中提取视频ID，请确认链接是否正确');
  }

  // Step 3: 尝试多种方式获取视频详情
  let videoInfo: VideoInfo | null = null;
  let lastError: string | null = null;

  // 方式一：从 iesdouyin 分享页的 _ROUTER_DATA 中提取（主路径）
  try {
    videoInfo = await parseFromIesdouyin(parsedUrl.videoId);
  } catch (err) {
    lastError = err instanceof Error ? err.message : '_ROUTER_DATA 解析失败';
    // 如果是"视频不存在"类的确定性错误，直接抛出，不再尝试 API
    if (isVideoNotFoundError(lastError)) {
      throw new Error(lastError);
    }
  }

  // 方式二：调用抖音内部 API（受限，需要有效 Cookie + 签名）
  if (!videoInfo) {
    try {
      videoInfo = await parseFromApi(parsedUrl.videoId);
    } catch (err) {
      const apiError = err instanceof Error ? err.message : 'API 解析失败';
      lastError = lastError ? `${lastError} | ${apiError}` : apiError;
    }
  }

  if (!videoInfo) {
    throw new Error(
      lastError || '视频解析失败，可能是因为抖音接口变更或视频已被删除。请稍后重试或更换链接'
    );
  }

  return videoInfo;
}

/**
 * 判断错误信息是否为"视频不存在"类的确定性错误
 * 这类错误不应再尝试其他解析方式，应直接返回给用户
 * @param errorMsg - 错误信息
 * @returns 是否为确定性错误
 */
function isVideoNotFoundError(errorMsg: string): boolean {
  const notFoundKeywords = [
    '已被删除',
    '设为私密',
    '权限',
    '不见了',
    '无法观看',
    '信息为空',
  ];
  return notFoundKeywords.some((kw) => errorMsg.includes(kw));
}

/**
 * 跟踪短链重定向，获取最终长链接并提取视频 ID
 * 移动端 UA 的短链会直接 302 到 iesdouyin.com/share/video/{id}
 * @param shareUrl - 抖音分享短链接
 * @returns 包含视频 ID 和长链接的解析结果
 */
async function resolveShortUrl(shareUrl: string): Promise<ParsedUrlResult> {
  // 先尝试从原始 URL 提取视频 ID（用户可能直接传入长链接）
  const directVideoId = extractVideoId(shareUrl);
  if (directVideoId) {
    // 如果已有视频 ID，直接构造 iesdouyin 分享页 URL
    return {
      videoId: directVideoId,
      longUrl: `https://www.iesdouyin.com/share/video/${directVideoId}`,
    };
  }

  // 短链需要跟踪重定向（使用移动端 UA，会直接跳转到 iesdouyin）
  const response = await fetch(shareUrl, {
    method: 'GET',
    headers: {
      'User-Agent': MOBILE_USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    redirect: 'manual',
  });

  // 抖音短链可能经过多次 302 重定向
  let currentUrl = shareUrl;
  let currentResponse: Response = response;
  const maxRedirects = 10;
  let redirectCount = 0;

  while (
    (currentResponse.status === 301 ||
      currentResponse.status === 302 ||
      currentResponse.status === 307 ||
      currentResponse.status === 308) &&
    redirectCount < maxRedirects
  ) {
    const location = currentResponse.headers.get('location');
    if (!location) {
      break;
    }

    // 处理相对路径的重定向
    currentUrl = new URL(location, currentUrl).href;

    // 尝试从重定向 URL 中提取视频 ID
    const videoId = extractVideoId(currentUrl);
    if (videoId) {
      return { videoId, longUrl: currentUrl };
    }

    // 继续跟踪重定向
    currentResponse = await fetch(currentUrl, {
      method: 'GET',
      headers: {
        'User-Agent': MOBILE_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'manual',
    });

    redirectCount++;
  }

  // 最终 URL 仍未提取到视频 ID，尝试从最终响应的 HTML 中查找
  if (currentResponse.status === 200) {
    const html = await currentResponse.text();
    const videoId = extractVideoIdFromHtml(html);
    if (videoId) {
      return { videoId, longUrl: currentUrl };
    }
  }

  return { videoId: '', longUrl: currentUrl };
}

/**
 * 从 HTML 内容中提取视频 ID
 * @param html - 网页 HTML 内容
 * @returns 视频 ID，未找到返回 null
 */
function extractVideoIdFromHtml(html: string): string | null {
  const patterns = [
    /"aweme_id"\s*:\s*"(\d+)"/,
    /"itemId"\s*:\s*"(\d+)"/,
    /\/video\/(\d+)/,
    /modal_id=(\d+)/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * 从 iesdouyin 分享页的 _ROUTER_DATA 中提取视频信息
 * 这是当前（2026）唯一可靠的服务端解析路径
 * @param videoId - 视频 ID
 * @returns 视频信息
 */
async function parseFromIesdouyin(videoId: string): Promise<VideoInfo> {
  const shareUrl = `https://www.iesdouyin.com/share/video/${videoId}`;

  const response = await fetch(shareUrl, {
    method: 'GET',
    headers: {
      'User-Agent': MOBILE_USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
  });

  if (!response.ok) {
    throw new Error(`请求 iesdouyin 页面失败: HTTP ${response.status}`);
  }

  const html = await response.text();

  // 提取 window._ROUTER_DATA
  const routerDataMatch = html.match(
    /window\._ROUTER_DATA\s*=\s*/
  );

  if (!routerDataMatch) {
    throw new Error('未在页面中找到 _ROUTER_DATA');
  }

  // 手动解析 JSON（需要处理嵌套大括号）
  const jsonStr = extractJsonObject(html, routerDataMatch.index! + routerDataMatch[0].length);
  if (!jsonStr) {
    throw new Error('_ROUTER_DATA JSON 解析失败');
  }

  const routerData = JSON.parse(jsonStr) as IesdouyinRouterData;

  // 在 loaderData 中查找包含 videoInfoRes 的键
  // 键名格式：video_(id)/page
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loaderData = (routerData as any).loaderData;
  let videoInfoRes: {
    item_list: IesdouyinItem[];
    filter_list?: { notice?: string; detail_msg?: string }[];
  } | null = null;

  for (const key of Object.keys(loaderData)) {
    const loader = loaderData[key];
    if (loader && typeof loader === 'object' && 'videoInfoRes' in loader) {
      videoInfoRes = loader.videoInfoRes;
      break;
    }
  }

  if (!videoInfoRes) {
    throw new Error('_ROUTER_DATA 中未找到 videoInfoRes');
  }

  // 检查视频是否被删除/私密
  if (!videoInfoRes.item_list || videoInfoRes.item_list.length === 0) {
    // 尝试从 filter_list 获取原因
    const filterList = videoInfoRes.filter_list;
    if (filterList && filterList.length > 0) {
      const filter = filterList[0];
      throw new Error(filter.detail_msg || filter.notice || '视频已被删除或设为私密');
    }
    throw new Error('视频信息为空，可能已被删除或设为私密');
  }

  const item = videoInfoRes.item_list[0];
  const videoInfo = mapIesdouyinItemToVideoInfo(item);

  // 跟随 302 获取真实 CDN 播放地址（浏览器直接访问 302 链接会被 CDN 拦截）
  if (videoInfo.playAddr) {
    try {
      videoInfo.playAddr = await resolveRedirect(videoInfo.playAddr);
    } catch {
      // 解析失败则保留原始链接
    }
  }

  return videoInfo;
}

/**
 * 跟随 302 重定向，获取最终 URL
 * 抖音的 playAddr 是 302 跳转链接，浏览器直接访问会被 CDN 拦截
 * 需要服务端跟随重定向获取真实 CDN 地址
 * @param url - 可能重定向的 URL
 * @returns 最终的直链 URL
 */
async function resolveRedirect(url: string): Promise<string> {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': MOBILE_USER_AGENT,
    },
    redirect: 'manual',
  });

  if (response.status === 301 || response.status === 302 || response.status === 307 || response.status === 308) {
    const location = response.headers.get('location');
    if (location) {
      return location;
    }
  }

  // 没有重定向，返回原始 URL
  return url;
}

/**
 * 从 HTML 字符串中提取完整的 JSON 对象
 * 通过跟踪大括号嵌套层级来确定 JSON 边界
 * @param html - HTML 字符串
 * @param startIndex - JSON 起始位置（'{' 的位置）
 * @returns JSON 字符串，解析失败返回 null
 */
function extractJsonObject(html: string, startIndex: number): string | null {
  let depth = 0;
  let inStr = false;
  let escape = false;

  for (let i = startIndex; i < html.length; i++) {
    const c = html[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (c === '\\' && inStr) {
      escape = true;
      continue;
    }

    if (c === '"') {
      inStr = !inStr;
      continue;
    }

    if (inStr) continue;

    if (c === '{') {
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0) {
        return html.substring(startIndex, i + 1);
      }
    }
  }

  return null;
}

/**
 * 将 iesdouyin 返回的视频项映射为统一的 VideoInfo 结构
 * @param item - iesdouyin 视频项数据
 * @returns 标准化的视频信息
 */
function mapIesdouyinItemToVideoInfo(item: IesdouyinItem): VideoInfo {
  // 提取视频播放地址（带水印），然后去水印
  const rawPlayAddr = extractCleanUrl(item.video.play_addr.url_list);
  const playAddr = toWatermarkFreeUrl(rawPlayAddr);

  // 提取封面图
  const cover = extractCleanUrl(item.video.cover.url_list);

  // 提取动态封面（可选字段）
  const dynamicCover = item.video.dynamic_cover
    ? extractCleanUrl(item.video.dynamic_cover.url_list)
    : '';

  // 提取作者头像（优先 medium，fallback thumb）
  const avatar = item.author.avatar_medium
    ? extractCleanUrl(item.author.avatar_medium.url_list)
    : extractCleanUrl(item.author.avatar_thumb.url_list);

  return {
    videoId: item.aweme_id || '',
    playAddr,
    cover,
    dynamicCover,
    desc: item.desc || '',
    duration: item.video.duration || 0,
    author: {
      uid: item.author.short_id || '',
      nickname: item.author.nickname || '',
      avatar: ensureHttps(avatar),
      signature: item.author.signature || '',
    },
    stats: {
      diggCount: item.statistics.digg_count || 0,
      commentCount: item.statistics.comment_count || 0,
      collectCount: item.statistics.collect_count || 0,
      shareCount: item.statistics.share_count || 0,
      playCount: item.statistics.play_count || 0,
    },
    createTime: item.create_time || 0,
  };
}

/**
 * 通过抖音内部 API 获取视频详情（受限备选方案）
 * 注意：此 API 需要有效的 Cookie 和 X-Bogus 签名，当前大概率会失败
 * @param videoId - 视频 ID
 * @returns 视频信息
 */
async function parseFromApi(videoId: string): Promise<VideoInfo> {
  const apiUrl = `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${videoId}&aid=6383&cookie_enabled=true`;

  const response = await fetch(apiUrl, {
    method: 'GET',
    headers: getDouyinApiHeaders(),
  });

  if (!response.ok) {
    throw new Error(`请求抖音 API 失败: HTTP ${response.status}`);
  }

  const result = (await response.json()) as DouyinApiResponse;

  if (result.status_code !== 0 || !result.aweme_detail) {
    throw new Error(
      `抖音 API 返回异常: status_code=${result.status_code}`
    );
  }

  const videoInfo = mapAwemeDetailToVideoInfo(result.aweme_detail);

  // 跟随 302 获取真实 CDN 播放地址
  if (videoInfo.playAddr) {
    try {
      videoInfo.playAddr = await resolveRedirect(videoInfo.playAddr);
    } catch {
      // 解析失败则保留原始链接
    }
  }

  return videoInfo;
}

/**
 * 将抖音 API 返回的原始数据映射为统一的 VideoInfo 结构
 * @param detail - 抖音 API 返回的视频详情
 * @returns 标准化的视频信息
 */
function mapAwemeDetailToVideoInfo(detail: DouyinAwemeDetail): VideoInfo {
  const rawPlayAddr = extractCleanUrl(detail.video.play_addr.url_list);
  const playAddr = toWatermarkFreeUrl(rawPlayAddr);
  const cover = extractCleanUrl(detail.video.cover.url_list);
  const dynamicCover = extractCleanUrl(detail.video.dynamic_cover.url_list);
  const avatar = extractCleanUrl(detail.author.avatar_larger.url_list);

  return {
    videoId: detail.aweme_id || '',
    playAddr,
    cover,
    dynamicCover,
    desc: detail.desc || '',
    duration: detail.duration || 0,
    author: {
      uid: detail.author.uid || '',
      nickname: detail.author.nickname || '',
      avatar: ensureHttps(avatar),
      signature: detail.author.signature || '',
    },
    stats: {
      diggCount: detail.statistics.digg_count || 0,
      commentCount: detail.statistics.comment_count || 0,
      collectCount: detail.statistics.collect_count || 0,
      shareCount: detail.statistics.share_count || 0,
      playCount: detail.statistics.play_count || 0,
    },
    createTime: detail.create_time || 0,
  };
}

/** 工具函数：User-Agent、CORS 响应头、JSON 响应构建等 */

import type { ApiResponse } from './types';

/** 桌面端 User-Agent，模拟浏览器访问 */
export const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** 移动端 User-Agent */
export const MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';

/**
 * 构建 CORS 响应头
 * @returns 允许所有来源的 CORS 头部
 */
export function getCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

/**
 * 构建成功响应
 * @param data - 响应数据
 * @param status - HTTP 状态码，默认 200
 * @returns Response 对象
 */
export function successResponse<T>(data: T, status: number = 200): Response {
  const body: ApiResponse<T> = {
    success: true,
    data,
    error: null,
    timestamp: Date.now(),
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...getCorsHeaders(),
    },
  });
}

/**
 * 构建错误响应
 * @param error - 错误信息
 * @param status - HTTP 状态码，默认 400
 * @returns Response 对象
 */
export function errorResponse(error: string, status: number = 400): Response {
  const body: ApiResponse<null> = {
    success: false,
    data: null,
    error,
    timestamp: Date.now(),
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...getCorsHeaders(),
    },
  });
}

/**
 * 构建 OPTIONS 预检请求响应
 * @returns 204 No Content 响应
 */
export function optionsResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(),
  });
}

/**
 * 从 URL 列表中提取第一个有效的 https 地址
 * 抖音 API 返回的 url_list 中可能包含带协议前缀的字符串，需要清理
 * @param urlList - URL 列表
 * @returns 清理后的 HTTPS URL，或空字符串
 */
export function extractCleanUrl(urlList: string[]): string {
  if (!urlList || urlList.length === 0) {
    return '';
  }
  const rawUrl = urlList[0];
  // 抖音返回的 URL 可能带有 "https://" 或 "http://" 前缀重复的情况
  // 例如: "https://https://v26-web.douyinvod.com/..."
  const cleaned = rawUrl.replace(/^https?:\/\/https?:\/\//, 'https://');
  return ensureHttps(cleaned);
}

/**
 * 确保 URL 使用 HTTPS 协议
 * @param url - 原始 URL
 * @returns HTTPS URL
 */
export function ensureHttps(url: string): string {
  if (!url) return '';
  return url.replace(/^http:\/\//, 'https://');
}

/**
 * 将视频播放地址转换为无水印版本
 * 抖音有水印的播放地址域名中包含 playwm，替换为 play 即可获取无水印版本
 * @param playUrl - 原始播放地址
 * @returns 无水印播放地址
 */
export function toWatermarkFreeUrl(playUrl: string): string {
  if (!playUrl) return '';
  // 将 playwm 替换为 play 去除水印
  return playUrl.replace(/playwm/g, 'play');
}

/**
 * 从抖音长链接中提取视频 ID
 * 支持格式：
 * - https://www.douyin.com/video/7xxxxxxxxxxxxx
 * - https://www.douyin.com/user/xxx?modal_id=7xxxxxxxxxxxxx
 * - https://www.iesdouyin.com/share/video/7xxxxxxxxxxxxx
 * @param url - 抖音长链接
 * @returns 视频 ID，提取失败返回 null
 */
export function extractVideoId(url: string): string | null {
  // 匹配 /video/{id} 路径
  const videoMatch = url.match(/\/video\/(\d+)/);
  if (videoMatch) {
    return videoMatch[1];
  }

  // 匹配 modal_id 参数
  const modalIdMatch = url.match(/modal_id=(\d+)/);
  if (modalIdMatch) {
    return modalIdMatch[1];
  }

  // 匹配 /share/video/{id} 路径（iesdouyin）
  const shareMatch = url.match(/\/share\/video\/(\d+)/);
  if (shareMatch) {
    return shareMatch[1];
  }

  // 匹配 /note/{id} 路径
  const noteMatch = url.match(/\/note\/(\d+)/);
  if (noteMatch) {
    return noteMatch[1];
  }

  return null;
}

/**
 * 判断 URL 是否为抖音分享链接
 * @param url - 待检测 URL
 * @returns 是否为有效的抖音链接
 */
export function isDouyinUrl(url: string): boolean {
  const patterns = [
    /^https?:\/\/v\.douyin\.com\//i,
    /^https?:\/\/www\.douyin\.com\//i,
    /^https?:\/\/www\.iesdouyin\.com\//i,
    /^https?:\/\/www\.amemv\.com\//i,
  ];
  return patterns.some((pattern) => pattern.test(url));
}

/**
 * 构建请求抖音 API 时的 headers
 * 注意：此 API 需要有效 Cookie + X-Bogus 签名，当前仅作为备选方案
 * @returns API 请求头对象
 */
export function getDouyinApiHeaders(): Record<string, string> {
  return {
    'User-Agent': DESKTOP_USER_AGENT,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    Referer: 'https://www.douyin.com/',
  };
}

/** Cloudflare Worker 主入口 - 路由分发与请求处理 */

import { parseDouyinVideo } from './parser';
import { successResponse, errorResponse, optionsResponse } from './utils';

/** Workers 环境变量绑定（当前无需额外绑定，预留扩展） */
interface Env {}

/** 前端页面 HTML（同域部署，无需跨域） */
import PLAYER_HTML from './player.html';

/** Worker 入口 */
export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    // 处理 CORS 预检请求
    if (request.method === 'OPTIONS') {
      return optionsResponse();
    }

    // 路由分发
    switch (pathname) {
      case '/':
        return handleIndex();
      case '/api/parse':
        return handleParse(request, url);
      case '/api/proxy':
        return handleProxy(url);
      case '/api/health':
        return handleHealth();
      default:
        return errorResponse('接口不存在', 404);
    }
  },
} satisfies ExportedHandler<Env>;

/**
 * 处理根路径请求，返回前端页面
 * @returns HTML 页面响应
 */
function handleIndex(): Response {
  return new Response(PLAYER_HTML, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

/**
 * 处理 /api/parse 请求
 * GET /api/parse?url=<douyin_share_url>
 * @param request - 原始请求对象
 * @param url - 解析后的 URL 对象
 * @returns 解析结果响应
 */
async function handleParse(request: Request, url: URL): Promise<Response> {
  // 仅允许 GET 方法
  if (request.method !== 'GET') {
    return errorResponse('仅支持 GET 请求', 405);
  }

  // 获取抖音链接参数
  const douyinUrl = url.searchParams.get('url');

  if (!douyinUrl) {
    return errorResponse('缺少必要参数: url。用法: /api/parse?url=<抖音分享链接>');
  }

  // searchParams.get() 已自动解码 URL 参数，无需再次 decodeURIComponent
  const decodedUrl = douyinUrl.trim();

  try {
    const videoInfo = await parseDouyinVideo(decodedUrl);
    return successResponse(videoInfo);
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : '未知错误';
    return errorResponse(errorMessage, 500);
  }
}

/**
 * 处理 /api/proxy 请求，代理视频流
 * GET /api/proxy?url=<cdn_url>
 * 伪造 Referer 绕过 CDN 防盗链
 * @param url - 解析后的 URL 对象
 * @returns 视频流响应
 */
async function handleProxy(url: URL): Promise<Response> {
  const targetUrl = url.searchParams.get('url');
  if (!targetUrl) {
    return errorResponse('缺少必要参数: url', 400);
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'Referer': 'https://www.douyin.com/',
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15',
      },
    });

    const headers = new Headers();
    const copyHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control', 'etag', 'last-modified'];
    for (const h of copyHeaders) {
      const v = response.headers.get(h);
      if (v) headers.set(h, v);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (e) {
    return errorResponse('代理视频流失败: ' + (e instanceof Error ? e.message : String(e)), 500);
  }
}

/**
 * 处理 /api/health 健康检查请求
 * @returns 服务健康状态
 */
function handleHealth(): Response {
  return successResponse({
    status: 'healthy',
    service: 'douyin-video-parser',
    version: '1.0.0',
  });
}


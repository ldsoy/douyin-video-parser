/**
 * utils.ts 单元测试
 * 覆盖：CORS、响应构建、URL 清理、视频 ID 提取、水印去除、链接判断
 */

import { describe, it, expect } from 'vitest';
import {
  getCorsHeaders,
  successResponse,
  errorResponse,
  optionsResponse,
  extractCleanUrl,
  ensureHttps,
  toWatermarkFreeUrl,
  extractVideoId,
  isDouyinUrl,
  DESKTOP_USER_AGENT,
  MOBILE_USER_AGENT,
} from '../src/utils';

// ─── CORS 相关 ────────────────────────────────────────────

describe('getCorsHeaders', () => {
  it('应返回包含 Allow-Origin * 的 CORS 头', () => {
    const headers = getCorsHeaders();
    expect(headers['Access-Control-Allow-Origin']).toBe('*');
  });

  it('应包含 GET 和 OPTIONS 方法', () => {
    const headers = getCorsHeaders();
    expect(headers['Access-Control-Allow-Methods']).toContain('GET');
    expect(headers['Access-Control-Allow-Methods']).toContain('OPTIONS');
  });

  it('应包含 Content-Type 允许头', () => {
    const headers = getCorsHeaders();
    expect(headers['Access-Control-Allow-Headers']).toContain('Content-Type');
  });
});

// ─── 响应构建 ────────────────────────────────────────────

describe('successResponse', () => {
  it('应返回 200 状态码和正确的 JSON 结构', async () => {
    const res = successResponse({ foo: 'bar' });
    expect(res.status).toBe(200);

    const body = await res.json() as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ foo: 'bar' });
    expect(body.error).toBeNull();
    expect(typeof body.timestamp).toBe('number');
  });

  it('应支持自定义状态码', () => {
    const res = successResponse({ ok: true }, 201);
    expect(res.status).toBe(201);
  });

  it('响应应包含 CORS 头和 Content-Type', () => {
    const res = successResponse({});
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

describe('errorResponse', () => {
  it('应返回 400 状态码和错误信息', async () => {
    const res = errorResponse('参数错误');
    expect(res.status).toBe(400);

    const body = await res.json() as Record<string, unknown>;
    expect(body.success).toBe(false);
    expect(body.data).toBeNull();
    expect(body.error).toBe('参数错误');
  });

  it('应支持自定义状态码', () => {
    const res = errorResponse('未找到', 404);
    expect(res.status).toBe(404);
  });

  it('响应应包含 CORS 头', () => {
    const res = errorResponse('err');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

describe('optionsResponse', () => {
  it('应返回 204 状态码', () => {
    const res = optionsResponse();
    expect(res.status).toBe(204);
  });

  it('应包含 CORS 头', () => {
    const res = optionsResponse();
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('响应体应为空', async () => {
    const res = optionsResponse();
    const text = await res.text();
    expect(text).toBe('');
  });
});

// ─── URL 清理 ────────────────────────────────────────────

describe('extractCleanUrl', () => {
  it('应返回空字符串当输入为空数组', () => {
    expect(extractCleanUrl([])).toBe('');
  });

  it('应返回空字符串当输入为空', () => {
    expect(extractCleanUrl(null as unknown as string[])).toBe('');
  });

  it('应提取第一个 URL', () => {
    const urls = ['https://example.com/video.mp4', 'https://backup.com/video.mp4'];
    expect(extractCleanUrl(urls)).toBe('https://example.com/video.mp4');
  });

  it('应修复重复协议前缀 https://https://', () => {
    const urls = ['https://https://v26-web.douyinvod.com/video.mp4'];
    expect(extractCleanUrl(urls)).toBe('https://v26-web.douyinvod.com/video.mp4');
  });

  it('应将 http 协议升级为 https', () => {
    const urls = ['http://v26-web.douyinvod.com/video.mp4'];
    expect(extractCleanUrl(urls)).toBe('https://v26-web.douyinvod.com/video.mp4');
  });

  it('应同时处理重复协议和 http 升级', () => {
    const urls = ['http://https://v26-web.douyinvod.com/video.mp4'];
    expect(extractCleanUrl(urls)).toBe('https://v26-web.douyinvod.com/video.mp4');
  });
});

describe('ensureHttps', () => {
  it('应将 http 替换为 https', () => {
    expect(ensureHttps('http://example.com')).toBe('https://example.com');
  });

  it('不应改变已有的 https', () => {
    expect(ensureHttps('https://example.com')).toBe('https://example.com');
  });

  it('应返回空字符串当输入为空', () => {
    expect(ensureHttps('')).toBe('');
  });
});

// ─── 水印去除 ────────────────────────────────────────────

describe('toWatermarkFreeUrl', () => {
  it('应将 playwm 替换为 play', () => {
    expect(toWatermarkFreeUrl('https://playwm.douyinvod.com/video.mp4'))
      .toBe('https://play.douyinvod.com/video.mp4');
  });

  it('应替换所有出现的 playwm', () => {
    expect(toWatermarkFreeUrl('https://playwm.example.com/playwm/video.mp4'))
      .toBe('https://play.example.com/play/video.mp4');
  });

  it('不应改变不含 playwm 的 URL', () => {
    expect(toWatermarkFreeUrl('https://play.douyinvod.com/video.mp4'))
      .toBe('https://play.douyinvod.com/video.mp4');
  });

  it('应返回空字符串当输入为空', () => {
    expect(toWatermarkFreeUrl('')).toBe('');
  });
});

// ─── 视频 ID 提取 ────────────────────────────────────────────

describe('extractVideoId', () => {
  it('应从 /video/{id} 路径提取 ID', () => {
    expect(extractVideoId('https://www.douyin.com/video/7123456789012345678')).toBe('7123456789012345678');
  });

  it('应从 modal_id 参数提取 ID', () => {
    expect(extractVideoId('https://www.douyin.com/user/xxx?modal_id=7123456789012345678')).toBe('7123456789012345678');
  });

  it('应从 /share/video/{id} 路径提取 ID', () => {
    expect(extractVideoId('https://www.iesdouyin.com/share/video/7123456789012345678')).toBe('7123456789012345678');
  });

  it('应从 /note/{id} 路径提取 ID', () => {
    expect(extractVideoId('https://www.douyin.com/note/7123456789012345678')).toBe('7123456789012345678');
  });

  it('应返回 null 当 URL 不包含视频 ID', () => {
    expect(extractVideoId('https://www.douyin.com/user/xxx')).toBeNull();
  });

  it('应返回 null 当输入为空字符串', () => {
    expect(extractVideoId('')).toBeNull();
  });

  it('应优先匹配 /video/{id} 路径', () => {
    // URL 同时包含 /video/ 和 modal_id 的情况
    const url = 'https://www.douyin.com/video/7111111111?modal_id=7222222222';
    expect(extractVideoId(url)).toBe('7111111111');
  });
});

// ─── 抖音链接判断 ────────────────────────────────────────────

describe('isDouyinUrl', () => {
  it('应识别 v.douyin.com 短链接', () => {
    expect(isDouyinUrl('https://v.douyin.com/xxxxx/')).toBe(true);
  });

  it('应识别 www.douyin.com 长链接', () => {
    expect(isDouyinUrl('https://www.douyin.com/video/123')).toBe(true);
  });

  it('应识别 www.iesdouyin.com 链接', () => {
    expect(isDouyinUrl('https://www.iesdouyin.com/share/video/123')).toBe(true);
  });

  it('应识别 www.amemv.com 链接', () => {
    expect(isDouyinUrl('https://www.amemv.com/xxx')).toBe(true);
  });

  it('应支持 http 协议', () => {
    expect(isDouyinUrl('http://v.douyin.com/xxxxx/')).toBe(true);
  });

  it('应拒绝非抖音链接', () => {
    expect(isDouyinUrl('https://www.youtube.com/watch?v=123')).toBe(false);
  });

  it('应拒绝空字符串', () => {
    expect(isDouyinUrl('')).toBe(false);
  });

  it('应拒绝不含域名的字符串', () => {
    expect(isDouyinUrl('just some text')).toBe(false);
  });
});

// ─── 常量验证 ────────────────────────────────────────────

describe('User-Agent 常量', () => {
  it('DESKTOP_USER_AGENT 应为非空字符串', () => {
    expect(typeof DESKTOP_USER_AGENT).toBe('string');
    expect(DESKTOP_USER_AGENT.length).toBeGreaterThan(0);
    expect(DESKTOP_USER_AGENT).toContain('Mozilla');
  });

  it('MOBILE_USER_AGENT 应为非空字符串', () => {
    expect(typeof MOBILE_USER_AGENT).toBe('string');
    expect(MOBILE_USER_AGENT.length).toBeGreaterThan(0);
    expect(MOBILE_USER_AGENT).toContain('iPhone');
  });
});

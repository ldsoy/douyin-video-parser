/**
 * index.ts 集成测试
 * 测试 Worker 主入口的路由分发和请求处理
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch 用于 parser 内部调用
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import worker from '../src/index';

/** 构造一个模拟的 Request 对象 */
function makeRequest(url: string, method: string = 'GET'): Request {
  return new Request(url, { method });
}

/** RENDER_DATA mock 数据 */
const MOCK_RENDER_DATA = [
  {
    aweme: {
      detail: {
        awemeId: '7123456789012345678',
        desc: '测试视频',
        createTime: '1700000000',
        video: {
          playAddr: 'https://playwm.douyinvod.com/video.mp4',
          cover: 'https://p3-sign.douyinpic.com/cover.jpg',
          dynamicCover: 'https://p3-sign.douyinpic.com/dynamic.jpg',
          duration: 15000,
          width: 1080,
          height: 1920,
          ratio: '540p',
        },
        authorInfo: {
          uid: '123456',
          nickname: '作者',
          avatar: 'https://p3-sign.douyinpic.com/avatar.jpg',
          signature: '签名',
        },
        stats: {
          diggCount: 100,
          commentCount: 10,
          collectCount: 5,
          shareCount: 2,
          playCount: 5000,
        },
      },
    },
  },
];

beforeEach(() => {
  mockFetch.mockReset();
});

// ─── 路由分发 ────────────────────────────────────────────

describe('路由分发', () => {
  it('GET / 应返回服务信息', async () => {
    const res = await worker.fetch(makeRequest('http://localhost/'), {} as never);
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    const data = body.data as Record<string, unknown>;
    expect(data.endpoints).toBeDefined();
  });

  it('GET /api/health 应返回健康状态', async () => {
    const res = await worker.fetch(makeRequest('http://localhost/api/health'), {} as never);
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    const data = body.data as Record<string, unknown>;
    expect(data.status).toBe('healthy');
  });

  it('GET 不存在的路径应返回 404', async () => {
    const res = await worker.fetch(makeRequest('http://localhost/not-found'), {} as never);
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe('接口不存在');
  });
});

// ─── CORS 预检 ────────────────────────────────────────────

describe('CORS 预检', () => {
  it('OPTIONS 请求应返回 204', async () => {
    const res = await worker.fetch(
      makeRequest('http://localhost/api/parse', 'OPTIONS'),
      {} as never
    );

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('OPTIONS 请求到任意路径都应返回 CORS 头', async () => {
    const res = await worker.fetch(
      makeRequest('http://localhost/any-path', 'OPTIONS'),
      {} as never
    );

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

// ─── /api/parse 端点 ─────────────────────────────────────

describe('/api/parse 端点', () => {
  it('缺少 url 参数时应返回 400', async () => {
    const res = await worker.fetch(
      makeRequest('http://localhost/api/parse'),
      {} as never
    );
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toContain('url');
  });

  it('url 参数不是抖音链接时应返回错误', async () => {
    const res = await worker.fetch(
      makeRequest('http://localhost/api/parse?url=https://www.youtube.com/watch'),
      {} as never
    );
    const body = await res.json() as Record<string, unknown>;

    expect(body.success).toBe(false);
    expect(body.error).toContain('无效');
  });

  it('有效链接应返回解析结果', async () => {
    // Mock fetch for parseFromHtml
    const encoded = encodeURIComponent(JSON.stringify(MOCK_RENDER_DATA));
    const html = `<html><head><script id="RENDER_DATA" type="application/json">${encoded}</script></head></html>`;
    mockFetch.mockResolvedValueOnce(new Response(html, { status: 200 }));

    const res = await worker.fetch(
      makeRequest('http://localhost/api/parse?url=https%3A%2F%2Fwww.douyin.com%2Fvideo%2F7123456789012345678'),
      {} as never
    );
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    const data = body.data as Record<string, unknown>;
    expect(data.videoId).toBe('7123456789012345678');
  });

  it('响应应包含 CORS 头', async () => {
    const encoded = encodeURIComponent(JSON.stringify(MOCK_RENDER_DATA));
    const html = `<html><head><script id="RENDER_DATA" type="application/json">${encoded}</script></head></html>`;
    mockFetch.mockResolvedValueOnce(new Response(html, { status: 200 }));

    const res = await worker.fetch(
      makeRequest('http://localhost/api/parse?url=https%3A%2F%2Fwww.douyin.com%2Fvideo%2F7123456789012345678'),
      {} as never
    );

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });

  it('解析失败时应返回 500 错误', async () => {
    // RENDER_DATA 失败
    mockFetch.mockResolvedValueOnce(new Response('error', { status: 500 }));
    // API 也失败
    mockFetch.mockResolvedValueOnce(new Response('error', { status: 500 }));

    const res = await worker.fetch(
      makeRequest('http://localhost/api/parse?url=https%3A%2F%2Fwww.douyin.com%2Fvideo%2F7123456789012345678'),
      {} as never
    );
    const body = await res.json() as Record<string, unknown>;

    expect(body.success).toBe(false);
    expect(res.status).toBe(500);
  });
});

// ─── 响应格式验证 ────────────────────────────────────────

describe('API 响应格式一致性', () => {
  it('成功响应应包含 success/data/error/timestamp 四个字段', async () => {
    const res = await worker.fetch(makeRequest('http://localhost/'), {} as never);
    const body = await res.json() as Record<string, unknown>;

    expect(body).toHaveProperty('success');
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('error');
    expect(body).toHaveProperty('timestamp');
  });

  it('错误响应应包含 success/data/error/timestamp 四个字段', async () => {
    const res = await worker.fetch(
      makeRequest('http://localhost/api/parse'),
      {} as never
    );
    const body = await res.json() as Record<string, unknown>;

    expect(body).toHaveProperty('success');
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('error');
    expect(body).toHaveProperty('timestamp');
    expect(body.success).toBe(false);
    expect(body.data).toBeNull();
  });

  it('timestamp 应为数字类型', async () => {
    const res = await worker.fetch(makeRequest('http://localhost/api/health'), {} as never);
    const body = await res.json() as Record<string, unknown>;

    expect(typeof body.timestamp).toBe('number');
    expect(body.timestamp).toBeGreaterThan(0);
  });
});

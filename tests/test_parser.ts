/**
 * parser.ts 单元测试
 * 覆盖：核心解析逻辑、短链重定向、RENDER_DATA 解析、API 备选方案
 * 使用 vi.fn mock fetch 请求
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch 全局对象
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// 导入被测模块（在 mock 之后）
import { parseDouyinVideo } from '../src/parser';

// ─── 测试辅助 ────────────────────────────────────────────

/** 构建一个模拟的 Response 对象 */
function makeResponse(
  body: string | Record<string, unknown>,
  options: { status?: number; headers?: Record<string, string> } = {}
): Response {
  const { status = 200, headers = {} } = options;
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(bodyStr, { status, headers });
}

/** 构建重定向 Response */
function makeRedirect(location: string, status: number = 302): Response {
  return new Response(null, {
    status,
    headers: { location },
  });
}

/** 构建包含 RENDER_DATA 的 HTML */
function makeRenderDataHtml(data: Record<string, unknown>): string {
  const encoded = encodeURIComponent(JSON.stringify(data));
  return `<!DOCTYPE html><html><head><script id="RENDER_DATA" type="application/json">${encoded}</script></head><body></body></html>`;
}

// ─── 测试用 RENDER_DATA ──────────────────────────────────

const MOCK_RENDER_DATA = [
  {
    aweme: {
      detail: {
        awemeId: '7123456789012345678',
        desc: '测试视频描述',
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
          nickname: '测试作者',
          avatar: 'https://p3-sign.douyinpic.com/avatar.jpg',
          signature: '测试签名',
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

const MOCK_API_RESPONSE = {
  status_code: 0,
  aweme_detail: {
    aweme_id: '7123456789012345678',
    desc: 'API 视频描述',
    create_time: 1700000000,
    duration: 15000,
    video: {
      play_addr: {
        uri: 'v0200fg10000',
        url_list: ['https://playwm.douyinvod.com/api_video.mp4'],
      },
      cover: {
        url_list: ['https://p3-sign.douyinpic.com/api_cover.jpg'],
      },
      dynamic_cover: {
        url_list: ['https://p3-sign.douyinpic.com/api_dynamic.jpg'],
      },
      width: 1080,
      height: 1920,
      ratio: '540p',
    },
    author: {
      uid: '654321',
      nickname: 'API 作者',
      avatar_larger: {
        url_list: ['https://p3-sign.douyinpic.com/api_avatar.jpg'],
      },
      signature: 'API 签名',
    },
    statistics: {
      digg_count: 200,
      comment_count: 20,
      collect_count: 10,
      share_count: 5,
      play_count: 10000,
    },
  },
};

// ─── 测试开始 ────────────────────────────────────────────

beforeEach(() => {
  mockFetch.mockReset();
});

describe('parseDouyinVideo - 链接校验', () => {
  it('应拒绝无效的抖音链接', async () => {
    await expect(parseDouyinVideo('https://www.youtube.com/watch?v=123'))
      .rejects.toThrow('无效的抖音链接');
  });

  it('应拒绝空字符串', async () => {
    await expect(parseDouyinVideo('')).rejects.toThrow();
  });
});

describe('parseDouyinVideo - 长链接直接提取', () => {
  it('应从长链接直接提取视频 ID 并通过 RENDER_DATA 解析', async () => {
    // 第一次 fetch：请求视频页面（parseFromHtml）
    mockFetch.mockResolvedValueOnce(
      makeResponse(makeRenderDataHtml(MOCK_RENDER_DATA))
    );

    const result = await parseDouyinVideo(
      'https://www.douyin.com/video/7123456789012345678'
    );

    expect(result.videoId).toBe('7123456789012345678');
    expect(result.desc).toBe('测试视频描述');
    expect(result.author.nickname).toBe('测试作者');
    expect(result.stats.diggCount).toBe(100);
    // playAddr 应该已经去除水印（playwm → play）
    expect(result.playAddr).toContain('play.douyinvod.com');
  });

  it('应从 /note/ 路径提取视频 ID', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse(makeRenderDataHtml(MOCK_RENDER_DATA))
    );

    const result = await parseDouyinVideo(
      'https://www.douyin.com/note/7123456789012345678'
    );

    expect(result.videoId).toBe('7123456789012345678');
  });
});

describe('parseDouyinVideo - 短链重定向', () => {
  it('应跟踪 302 重定向获取视频 ID', async () => {
    const longUrl = 'https://www.douyin.com/video/7123456789012345678';

    // 第一次 fetch：短链重定向
    mockFetch.mockResolvedValueOnce(makeRedirect(longUrl));
    // 第二次 fetch：请求视频页面（parseFromHtml）
    mockFetch.mockResolvedValueOnce(
      makeResponse(makeRenderDataHtml(MOCK_RENDER_DATA))
    );

    const result = await parseDouyinVideo('https://v.douyin.com/xxxxx/');

    expect(result.videoId).toBe('7123456789012345678');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('应处理多次重定向', async () => {
    const intermediateUrl = 'https://www.douyin.com/discover?modal_id=7123456789012345678';
    const finalUrl = 'https://www.douyin.com/video/7123456789012345678';

    // 第一次 fetch：重定向到中间 URL
    mockFetch.mockResolvedValueOnce(makeRedirect(intermediateUrl));
    // 第二次 fetch：从中间 URL 提取到 videoId，直接进入 parseFromHtml
    // （resolveShortUrl 在重定向 URL 中找到 videoId 后立即返回）
    // parseFromHtml 请求视频页面
    mockFetch.mockResolvedValueOnce(
      makeResponse(makeRenderDataHtml(MOCK_RENDER_DATA))
    );

    const result = await parseDouyinVideo('https://v.douyin.com/abc/');

    expect(result.videoId).toBe('7123456789012345678');
  });

  it('应在无法提取视频 ID 时抛出错误', async () => {
    // 短链重定向到一个不包含视频 ID 的页面
    mockFetch.mockResolvedValueOnce(
      makeRedirect('https://www.douyin.com/')
    );
    // 后续 fetch 返回无视频 ID 的页面
    mockFetch.mockResolvedValueOnce(makeResponse('<html>empty</html>'));

    await expect(parseDouyinVideo('https://v.douyin.com/xxxxx/'))
      .rejects.toThrow('无法从链接中提取视频ID');
  });
});

describe('parseDouyinVideo - RENDER_DATA 解析', () => {
  it('应正确解析 RENDER_DATA 中的视频信息', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse(makeRenderDataHtml(MOCK_RENDER_DATA))
    );

    const result = await parseDouyinVideo(
      'https://www.douyin.com/video/7123456789012345678'
    );

    expect(result.videoId).toBe('7123456789012345678');
    expect(result.playAddr).not.toContain('playwm');
    expect(result.cover).toContain('https://');
    expect(result.dynamicCover).toContain('https://');
    expect(result.desc).toBe('测试视频描述');
    expect(result.duration).toBe(15000);
    expect(result.createTime).toBe(1700000000);
  });

  it('应正确处理作者信息', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse(makeRenderDataHtml(MOCK_RENDER_DATA))
    );

    const result = await parseDouyinVideo(
      'https://www.douyin.com/video/7123456789012345678'
    );

    expect(result.author.uid).toBe('123456');
    expect(result.author.nickname).toBe('测试作者');
    expect(result.author.avatar).toContain('https://');
    expect(result.author.signature).toBe('测试签名');
  });

  it('应正确处理统计信息', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse(makeRenderDataHtml(MOCK_RENDER_DATA))
    );

    const result = await parseDouyinVideo(
      'https://www.douyin.com/video/7123456789012345678'
    );

    expect(result.stats.diggCount).toBe(100);
    expect(result.stats.commentCount).toBe(10);
    expect(result.stats.collectCount).toBe(5);
    expect(result.stats.shareCount).toBe(2);
    expect(result.stats.playCount).toBe(5000);
  });

  it('应处理 RENDER_DATA 中包含多个项的情况', async () => {
    const multiItemData = [
      { aweme: { detail: { awemeId: 'wrong_id', desc: 'wrong' } } },
      ...MOCK_RENDER_DATA,
    ];
    mockFetch.mockResolvedValueOnce(
      makeResponse(makeRenderDataHtml(multiItemData))
    );

    const result = await parseDouyinVideo(
      'https://www.douyin.com/video/7123456789012345678'
    );

    expect(result.videoId).toBe('7123456789012345678');
  });

  it('应在页面不包含 RENDER_DATA 时回退到 API', async () => {
    // 第一次 fetch：请求视频页面，但没有 RENDER_DATA
    mockFetch.mockResolvedValueOnce(
      makeResponse('<html><head></head><body>No RENDER_DATA</body></html>')
    );
    // 第二次 fetch：API 请求
    mockFetch.mockResolvedValueOnce(makeResponse(MOCK_API_RESPONSE));

    const result = await parseDouyinVideo(
      'https://www.douyin.com/video/7123456789012345678'
    );

    expect(result.videoId).toBe('7123456789012345678');
    expect(result.desc).toBe('API 视频描述');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe('parseDouyinVideo - API 备选方案', () => {
  it('应在 RENDER_DATA 失败时回退到 API', async () => {
    // 第一次 fetch：RENDER_DATA 解析失败（返回非 200）
    mockFetch.mockResolvedValueOnce(makeResponse('error', { status: 403 }));
    // 第二次 fetch：API 请求成功
    mockFetch.mockResolvedValueOnce(makeResponse(MOCK_API_RESPONSE));

    const result = await parseDouyinVideo(
      'https://www.douyin.com/video/7123456789012345678'
    );

    expect(result.videoId).toBe('7123456789012345678');
    expect(result.author.nickname).toBe('API 作者');
    expect(result.stats.playCount).toBe(10000);
  });

  it('应在两种方式都失败时抛出错误', async () => {
    // 第一次 fetch：RENDER_DATA 解析失败
    mockFetch.mockResolvedValueOnce(makeResponse('error', { status: 500 }));
    // 第二次 fetch：API 也失败
    mockFetch.mockResolvedValueOnce(makeResponse('error', { status: 500 }));

    await expect(parseDouyinVideo('https://www.douyin.com/video/7123456789012345678'))
      .rejects.toThrow('视频解析失败');
  });

  it('应正确处理 API 返回的错误状态码', async () => {
    // RENDER_DATA 失败
    mockFetch.mockResolvedValueOnce(makeResponse('error', { status: 403 }));
    // API 返回非零 status_code
    mockFetch.mockResolvedValueOnce(
      makeResponse({ status_code: 1, aweme_detail: null })
    );

    await expect(parseDouyinVideo('https://www.douyin.com/video/7123456789012345678'))
      .rejects.toThrow('视频解析失败');
  });
});

describe('parseDouyinVideo - RENDER_DATA 属性顺序兼容性', () => {
  it('应兼容 type 在 id 之前的属性顺序', async () => {
    const encoded = encodeURIComponent(JSON.stringify(MOCK_RENDER_DATA));
    const html = `<!DOCTYPE html><html><head><script type="application/json" id="RENDER_DATA">${encoded}</script></head><body></body></html>`;

    mockFetch.mockResolvedValueOnce(makeResponse(html));

    const result = await parseDouyinVideo(
      'https://www.douyin.com/video/7123456789012345678'
    );

    expect(result.videoId).toBe('7123456789012345678');
  });
});

describe('parseDouyinVideo - 边界情况', () => {
  it('应处理空的作者信息（回退为空字符串）', async () => {
    const dataWithEmptyAuthor = [
      {
        aweme: {
          detail: {
            awemeId: '7123456789012345678',
            desc: '',
            createTime: '0',
            video: {
              playAddr: '',
              cover: '',
              dynamicCover: '',
              duration: 0,
              width: 0,
              height: 0,
              ratio: '',
            },
            authorInfo: {
              uid: '',
              nickname: '',
              avatar: '',
              signature: '',
            },
            stats: {
              diggCount: 0,
              commentCount: 0,
              collectCount: 0,
              shareCount: 0,
              playCount: 0,
            },
          },
        },
      },
    ];

    mockFetch.mockResolvedValueOnce(
      makeResponse(makeRenderDataHtml(dataWithEmptyAuthor))
    );

    const result = await parseDouyinVideo(
      'https://www.douyin.com/video/7123456789012345678'
    );

    expect(result.videoId).toBe('7123456789012345678');
    expect(result.author.nickname).toBe('');
    expect(result.stats.diggCount).toBe(0);
    expect(result.duration).toBe(0);
  });

  it('应处理 iesdouyin 链接', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse(makeRenderDataHtml(MOCK_RENDER_DATA))
    );

    const result = await parseDouyinVideo(
      'https://www.iesdouyin.com/share/video/7123456789012345678'
    );

    expect(result.videoId).toBe('7123456789012345678');
  });
});

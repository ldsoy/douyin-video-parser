/**
 * types.ts 类型验证测试
 * 确保 TypeScript 类型定义与实际使用一致
 * 由于类型在编译时检查，这里主要验证运行时行为
 */

import { describe, it, expect } from 'vitest';
import type {
  ApiResponse,
  VideoInfo,
  AuthorInfo,
  VideoStats,
  DouyinAwemeDetail,
  DouyinApiResponse,
  RenderDataItem,
  ParsedUrlResult,
} from '../src/types';

describe('ApiResponse 类型', () => {
  it('应构建成功响应结构', () => {
    const response: ApiResponse<string> = {
      success: true,
      data: 'hello',
      error: null,
      timestamp: Date.now(),
    };
    expect(response.success).toBe(true);
    expect(response.data).toBe('hello');
    expect(response.error).toBeNull();
  });

  it('应构建错误响应结构', () => {
    const response: ApiResponse<null> = {
      success: false,
      data: null,
      error: 'Something went wrong',
      timestamp: Date.now(),
    };
    expect(response.success).toBe(false);
    expect(response.error).toBe('Something went wrong');
    expect(response.data).toBeNull();
  });
});

describe('VideoInfo 类型', () => {
  it('应正确构建完整的 VideoInfo 对象', () => {
    const videoInfo: VideoInfo = {
      videoId: '7123456789012345678',
      playAddr: 'https://play.douyinvod.com/video.mp4',
      cover: 'https://p3-sign.douyinpic.com/cover.jpg',
      dynamicCover: 'https://p3-sign.douyinpic.com/dynamic.jpg',
      desc: '测试视频',
      duration: 15000,
      author: {
        uid: '123456',
        nickname: '测试用户',
        avatar: 'https://p3-sign.douyinpic.com/avatar.jpg',
        signature: '个性签名',
      },
      stats: {
        diggCount: 100,
        commentCount: 10,
        collectCount: 5,
        shareCount: 2,
        playCount: 5000,
      },
      createTime: 1700000000,
    };

    expect(videoInfo.videoId).toBe('7123456789012345678');
    expect(videoInfo.author.nickname).toBe('测试用户');
    expect(videoInfo.stats.diggCount).toBe(100);
  });
});

describe('DouyinApiResponse 类型', () => {
  it('应解析标准 API 响应', () => {
    const apiResponse: DouyinApiResponse = {
      status_code: 0,
      aweme_detail: {
        aweme_id: '7123456789',
        desc: '视频描述',
        create_time: 1700000000,
        duration: 15000,
        video: {
          play_addr: {
            uri: 'v0200fg10000',
            url_list: ['https://playwm.douyinvod.com/video.mp4'],
          },
          cover: {
            url_list: ['https://p3-sign.douyinpic.com/cover.jpg'],
          },
          dynamic_cover: {
            url_list: ['https://p3-sign.douyinpic.com/dynamic.jpg'],
          },
          width: 1080,
          height: 1920,
          ratio: '540p',
        },
        author: {
          uid: '123456',
          nickname: '作者',
          avatar_larger: {
            url_list: ['https://p3-sign.douyinpic.com/avatar.jpg'],
          },
          signature: '签名',
        },
        statistics: {
          digg_count: 100,
          comment_count: 10,
          collect_count: 5,
          share_count: 2,
          play_count: 5000,
        },
      },
    };

    expect(apiResponse.status_code).toBe(0);
    expect(apiResponse.aweme_detail?.aweme_id).toBe('7123456789');
    expect(apiResponse.aweme_detail?.video.play_addr.url_list).toHaveLength(1);
  });

  it('应处理 aweme_detail 为 null 的情况', () => {
    const apiResponse: DouyinApiResponse = {
      status_code: 1,
      aweme_detail: null,
    };
    expect(apiResponse.aweme_detail).toBeNull();
  });
});

describe('RenderDataItem 类型', () => {
  it('应解析 RENDER_DATA 项', () => {
    const renderItem: RenderDataItem = {
      aweme: {
        detail: {
          awemeId: '7123456789',
          desc: '视频描述',
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
    };

    expect(renderItem.aweme.detail.awemeId).toBe('7123456789');
    // createTime 在 RenderDataItem 中为 string 类型
    expect(typeof renderItem.aweme.detail.createTime).toBe('string');
  });
});

describe('ParsedUrlResult 类型', () => {
  it('应包含 videoId 和 longUrl', () => {
    const result: ParsedUrlResult = {
      videoId: '7123456789',
      longUrl: 'https://www.douyin.com/video/7123456789',
    };
    expect(result.videoId).toBe('7123456789');
    expect(result.longUrl).toContain('douyin.com');
  });
});

/** 抖音视频解析相关类型定义 */

/** API 统一响应结构 */
export interface ApiResponse<T = unknown> {
  /** 是否成功 */
  success: boolean;
  /** 响应数据 */
  data: T | null;
  /** 错误信息 */
  error: string | null;
  /** 时间戳 */
  timestamp: number;
}

/** 解析后的视频信息 */
export interface VideoInfo {
  /** 视频ID */
  videoId: string;
  /** 无水印视频直链 */
  playAddr: string;
  /** 视频封面图 */
  cover: string;
  /** 视频动态封面图 */
  dynamicCover: string;
  /** 视频标题/描述 */
  desc: string;
  /** 视频时长（秒） */
  duration: number;
  /** 作者信息 */
  author: AuthorInfo;
  /** 统计信息 */
  stats: VideoStats;
  /** 创建时间（秒级时间戳） */
  createTime: number;
}

/** 作者信息 */
export interface AuthorInfo {
  /** 作者ID */
  uid: string;
  /** 作者昵称 */
  nickname: string;
  /** 作者头像 */
  avatar: string;
  /** 作者签名 */
  signature: string;
}

/** 视频统计信息 */
export interface VideoStats {
  /** 点赞数 */
  diggCount: number;
  /** 评论数 */
  commentCount: number;
  /** 收藏数 */
  collectCount: number;
  /** 分享数 */
  shareCount: number;
  /** 播放数 */
  playCount: number;
}

/** 抖音 API 返回的原始视频详情数据结构（关键字段） */
export interface DouyinAwemeDetail {
  aweme_id: string;
  desc: string;
  create_time: number;
  duration: number;
  video: {
    play_addr: {
      uri: string;
      url_list: string[];
    };
    cover: {
      url_list: string[];
    };
    dynamic_cover: {
      url_list: string[];
    };
    width: number;
    height: number;
    ratio: string;
  };
  author: {
    uid: string;
    nickname: string;
    avatar_larger: {
      url_list: string[];
    };
    signature: string;
  };
  statistics: {
    digg_count: number;
    comment_count: number;
    collect_count: number;
    share_count: number;
    play_count: number;
  };
}

/** 抖音 API 顶层响应结构 */
export interface DouyinApiResponse {
  status_code: number;
  aweme_detail: DouyinAwemeDetail | null;
}

/** iesdouyin _ROUTER_DATA 中的视频项结构 */
export interface IesdouyinItem {
  aweme_id: string;
  desc: string;
  create_time: number;
  author: {
    short_id: string;
    nickname: string;
    signature: string;
    avatar_thumb: {
      uri: string;
      url_list: string[];
    };
    avatar_medium: {
      uri: string;
      url_list: string[];
    };
  };
  video: {
    play_addr: {
      uri: string;
      url_list: string[];
    };
    cover: {
      uri: string;
      url_list: string[];
    };
    dynamic_cover?: {
      uri: string;
      url_list: string[];
    };
    width: number;
    height: number;
    duration: number;
    bit_rate?: unknown[];
  };
  statistics: {
    aweme_id: string;
    digg_count: number;
    comment_count: number;
    collect_count: number;
    share_count: number;
    play_count: number;
  };
  music?: {
    mid: string;
    title: string;
    author: string;
  };
}

/** iesdouyin _ROUTER_DATA 顶层结构 */
export interface IesdouyinRouterData {
  loaderData: Record<string, unknown>;
  errors: unknown;
}

/** 解析过程中的内部中间结果 */
export interface ParsedUrlResult {
  /** 视频ID */
  videoId: string;
  /** iesdouyin 分享页 URL（移动端短链302后直接得到） */
  longUrl: string;
}

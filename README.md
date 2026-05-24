# Douyin Video Parser / 抖音视频解析

部署在 Cloudflare Workers 上的抖音视频无水印解析服务，带在线播放页面。

## 功能

- 接收抖音分享链接，解析出无水印视频直链
- 内置在线播放页面，支持 Hash 传参自动播放
- 返回视频封面、标题、作者信息、统计数据等
- 支持 CORS 跨域调用
- 多种解析策略自动回退（iesdouyin SSR → 内部 API）
- 服务端代理视频流，绕过 CDN 防盗链

## 在线演示

```
https://your-worker.workers.dev/
```

Hash 传参自动播放：

```
https://your-worker.workers.dev/#https%3A%2F%2Fv.douyin.com%2Fxxxxx%2F
```

## API 文档

### 解析视频

```
GET /api/parse?url=<抖音分享链接>
```

**参数说明**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| url  | string | 是 | 抖音分享链接，需 URL 编码 |

**支持链接格式**：

- 短链：`https://v.douyin.com/xxxxx/`
- 长链：`https://www.douyin.com/video/7xxxxxxxxxxxxx`
- iesdouyin：`https://www.iesdouyin.com/share/video/7xxxxxxxxxxxxx`
- 纯视频 ID：`7xxxxxxxxxxxxx`
- 分享文本：`7.87 Rss:/ 复制打开抖音... https://v.douyin.com/xxxxx/`（正则自动提取）

**成功响应**：

```json
{
  "success": true,
  "data": {
    "videoId": "7xxxxxxxxxxxxx",
    "playAddr": "https://v26-web.douyinvod.com/...",
    "cover": "https://p3-sign.douyinpic.com/...",
    "dynamicCover": "https://p3-sign.douyinpic.com/...",
    "desc": "视频描述",
    "duration": 15000,
    "author": {
      "uid": "xxxxxxxx",
      "nickname": "作者昵称",
      "avatar": "https://p3-sign.douyinpic.com/...",
      "signature": "作者签名"
    },
    "stats": {
      "diggCount": 12345,
      "commentCount": 678,
      "collectCount": 890,
      "shareCount": 123,
      "playCount": 100000
    },
    "createTime": 1700000000
  },
  "error": null,
  "timestamp": 1700000000000
}
```

### 视频流代理

```
GET /api/proxy?url=<视频CDN地址>
```

代理视频流请求，伪造 Referer 绕过 CDN 防盗链。前端播放器使用此接口。

### 健康检查

```
GET /api/health
```

## 部署方式

### 前提条件

- Node.js >= 18
- Cloudflare 账号
- Wrangler CLI

### 安装依赖

```bash
npm install
```

### 本地开发

```bash
npm run dev
```

### 部署到 Cloudflare Workers

```bash
npm run deploy
```

## 解析原理

1. **短链跟踪**：使用移动端 UA 请求抖音短链，302 重定向至 `iesdouyin.com/share/video/{id}`
2. **SSR 数据提取**：从 iesdouyin 页面的 `window._ROUTER_DATA` → `loaderData["video_(id)/page"]` 提取视频详情
3. **去水印**：将播放地址中的 `playwm` 替换为 `play` 获取无水印版本
4. **302 跟随**：服务端跟随 playAddr 的 302 重定向，获取真实 CDN 地址
5. **API 回退**：SSR 解析失败时，回退至抖音内部 API `https://www.douyin.com/aweme/v1/web/aweme/detail/`

> ⚠️ `www.douyin.com` 已启用 JS VM 保护（`_$jsvmprt`），不再提供 SSR 数据，因此主路径走 `iesdouyin.com`。

## 注意事项

- 抖音接口可能随时变更，如解析失败请提 Issue
- 本项目仅供学习交流使用，请勿用于商业用途
- 视频版权归原作者所有

## 技术栈

- Cloudflare Workers
- TypeScript
- Wrangler
- Workers 原生 Fetch API（零依赖）

## 项目结构

```
douyin-video-parser/
├── wrangler.toml          # Workers 配置
├── package.json           # 项目依赖
├── tsconfig.json          # TypeScript 配置
├── src/
│   ├── index.ts           # Worker 主入口（路由分发）
│   ├── parser.ts          # 抖音解析核心逻辑
│   ├── player.html        # 前端播放页面
│   ├── types.ts           # TypeScript 类型定义
│   ├── utils.ts           # 工具函数
│   └── html.d.ts          # HTML 模块类型声明
└── tests/                 # 测试用例
```

## License

MIT

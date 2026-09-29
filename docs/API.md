# API

所有 consumer API 与 H5 同源。请求和响应使用 UTF-8 JSON。管理 API 需要 `X-Admin-Token`。

## Consumer

| Method | Path | 用途 |
|---|---|---|
| GET | `/api/health` | 服务状态和题目版本 |
| GET | `/api/questions` | 当前固定题库、顺序版本和选项分值 |
| GET | `/api/catalog` | 当前作品集版本与数据状态计数 |
| POST | `/api/session` | 创建/恢复匿名会话 |
| POST | `/api/session/{id}/answer` | 保存题目选项和原始分 |
| POST | `/api/session/{id}/complete` | 检查 25 题、算分、返回 Top 3 |
| GET | `/api/session/{id}` | 读取本人浏览器保留的会话状态或结果 |
| POST | `/api/session/{id}/rating` | 保存 1–5 分与可选反馈 |
| POST | `/api/session/{id}/share` | 记录分享点击 |
| POST | `/api/event` | 保存白名单消费端事件 |
| GET | `/api/share/{share_id}` | 返回只含作品与命中句的公开分享卡片 |

## Admin

| Method | Path | 用途 |
|---|---|---|
| GET | `/api/admin/artworks` | 获取作品与当前发布版本 |
| GET | `/api/admin/analytics` | 获取完成与反馈概览 |
| GET | `/api/admin/versions` | 获取题库和作品集版本记录 |
| POST | `/api/admin/artworks/save` | 保存单条草稿/复核状态 |
| POST | `/api/admin/artworks/import` | 导入标准化作品数组 |
| POST | `/api/admin/publish` | 将当前有效作品写入不可变版本快照 |

`/admin` 的视觉工作台使用上述 API。产品中没有密码登录、支付服务和公开用户资料端点。

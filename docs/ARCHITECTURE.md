# 架构

## 请求流程

```text
响应式 H5
  ├─ 题目展示与本地草稿（localStorage）
  ├─ 答案、五维计分、32 型归类
  ├─ 连续向量匹配 Top 3
  ├─ 结果反馈与分享
  └─ 管理 CMS
          │ same-origin JSON API
          ▼
Python ThreadingHTTPServer
  ├─ Question Set + Assessment Engine
  ├─ Artwork Matching Engine
  ├─ Consumer Product API
  ├─ Admin CMS API
  └─ Analytics event log
          │
          ▼
SQLite：答案、会话、版本快照、反馈、埋点
```

V1 是独立的移动端响应式 H5，覆盖小程序 WebView 可承载的页面体验，不包含原生微信授权、支付或分享 SDK。LLM 不进入计分和匹配路径。Python API 保持模块边界，后续可迁移到 FastAPI 和 PostgreSQL。

## 固定边界

- `database/questions.json` 是当前正式 25 题的唯一运行配置。
- `backend/assessment.py` 只从选项映射计分，不推断或重写问题。
- `backend/matching.py` 只比较五维连续向量，确定性排序。
- 32 型编码用于内部完整性和作品管理，不进入结果主标题。
- CMS 发布作品集时存一份 JSON 快照。会话记录题库版本、题序版本、计分版本、作品集版本、作品向量版本和报告版本；结果回读原快照。
- 用户答题稿同步存 localStorage 和 SQLite。完成时从 localStorage 重传整套答案，容忍答题途中短时断连。

## 模块

`frontend/` 提供首页、三段章节引导、单题流程、揭晓动画、主结果、五维图表、Top 3、评分和分享卡片。

`backend/assessment.py` 为确定性 Assessment Engine。`backend/matching.py` 为 Artwork Matching Engine。`backend/server.py` 提供同源 H5/API、持久化、CMS 和事件收集。

`admin/` 可校对作品、处理待复核状态、导入/导出 JSON、发布新的只读快照，并查看完成数、反馈均分、分享计数和版本记录。

`database/` 含 V1 题库、Schema 和 V0.6 合并目录。工作簿与 JSON 原件留在项目根目录，导入脚本可以重复生成运行目录。

## 后续接入建议

若转为多实例或公开高流量服务，迁移到 FastAPI/PostgreSQL，给会话接口加频率限制，对管理 API 使用正式身份认证，把图像迁入对象存储并使用 CDN。数据库现有字段和版本快照保留了迁移所需的主干数据。

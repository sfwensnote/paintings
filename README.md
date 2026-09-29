# 画见 · 你的人生像哪一幅名画？

一款面向消费者的艺术人格探索 H5。用户完成固定的 25 道生活选择题，系统按确定性计分生成五维连续向量，再以归一化欧氏距离匹配 V0.6 的 32 幅锚点作品。

## 本地启动

需要 Python 3.10 或更新版本。测评服务只用 Python 标准库和 SQLite。

```sh
export PORT=8000
export ART_ADMIN_TOKEN='换成仅管理员知道的长口令'
python3 backend/server.py
```

打开 `http://127.0.0.1:8000`。作品管理入口是 `http://127.0.0.1:8000/admin`。本地默认口令为 `local-art-admin`，部署前必须覆盖。

首次启动会在 `data/art_museum.sqlite3` 建立数据库并导入 `database/artworks.json`。运行后，可在 `backend/server.py` 所在目录之外用 `ART_MUSEUM_DB=/path/to/file.sqlite3` 指定数据位置。公开部署请看 [Docker 部署准备](docs/DEPLOYMENT.md)，生产模式必须配置随机管理口令和持久化数据卷。

## 项目结构

```text
frontend/       移动优先的 H5、样式与 PWA 壳层
backend/        确定性计分、作品匹配、SQLite API 与静态服务
admin/          作品 CMS、复核状态、版本发布与早期指标
database/       冻结题库、合并后的 32 幅作品目录与 SQL Schema
scripts/        Excel + JSON 资产导入工具
tests/          计分、匹配、题库与导入校验
docs/           架构、数据、API 与部署说明
```

根目录保留用户提供的 V0.5、V0.6 工作簿和 `artwork_personality_assets_v1.json`。`database/artworks.json` 是把 V0.6 工作簿锚点信息与 JSON 连续评分和叙事合并后的运行目录。

## 作品资料状态

V0.6 数据提供了完整 32 类型、作品名、作者、年代、文化/流派、五维评分、人生原型、关键词和结果叙事。源数据把 32 条内容都标成 `pending_human_review`，导入时保留了这一标记；它们可用于产品内测匹配。工作簿与 JSON 都没有图像 URL，管理页因此将图像和版权信息标为待补，结果页在缺图时显示作品名牌，不会展示错误画作。

首页用本地《星月夜》展示图，作品说明链接到 Wikimedia Commons 文件页，避免运行时依赖第三方图片服务器。匹配结果始终使用各自作品记录上的图像地址。

## 计分与匹配

- 25 题和 Q_V1.0 原文独立保存于 `database/questions.json`。
- 每维 5 题；按选项映射求原始分，并以 `raw / 15 * 100` 转成 0–100，保留一位小数。
- 32 型内部按五维位编码，`>= 50` 为高侧；消费者结果页不显示 T 编号。
- 匹配只使用连续五维向量，按 RMS 归一化欧氏距离排序并返回前三幅作品。
- 作品集发布会写入不可变 JSON 快照；已开始的会话继续使用启动时的题库和作品集版本。

## 作品内容管理

在 `/admin` 可搜索 32 幅锚点，编辑文案、五维评分、图像地址与版权状态，更新人工复核状态，导入/导出标准化 JSON 并发布新的作品集版本。输入 JSON 的结构可以从管理页导出，也可参考 `database/artworks.json`。

## 验证

```sh
python3 -m unittest discover -s tests -v
python3 -m py_compile backend/*.py scripts/*.py
node --check frontend/app.js
node --check admin/admin.js
```

这些检查覆盖题目数量和顺序、反向题、缺答与无效回答、极值计分、32 型可达性、向量 Top 3 稳定性，以及表格与 JSON 的逐条合并一致性。

更多说明见 [架构](docs/ARCHITECTURE.md)、[数据库](docs/DATABASE.md)、[API](docs/API.md) 与 [部署](docs/DEPLOYMENT.md)。

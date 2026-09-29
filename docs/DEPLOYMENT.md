# 部署与邀请测试

当前版本是同源 H5 + API + SQLite，适合先做小范围邀请测试。Docker 镜像可以运行在本机，也能部署到支持容器与持久化磁盘的云服务。

## 本机打包检查

需要安装 Docker。先构建镜像：

```sh
docker build -t huajian:pilot .
```

创建 `.env` 并填写随机管理口令。可用下列命令生成，然后把输出粘贴到 `.env` 的 `ART_ADMIN_TOKEN`：

```sh
python3 -c 'import secrets; print(secrets.token_urlsafe(32))'
```

```sh
cp .env.example .env
```

创建持久化卷并启动：

```sh
docker volume create huajian-data
docker run -d --name huajian --restart unless-stopped \
  --env-file .env -p 8000:8000 \
  --mount type=volume,source=huajian-data,target=/data \
  huajian:pilot
```

打开 `http://127.0.0.1:8000`，`http://127.0.0.1:8000/api/health` 应返回 `{"status":"ok",...}`。本机运行只用于检查，其他网络的测试者不能访问 `127.0.0.1`。

## 发布给外部测试者

1. 把项目推到 Git 仓库，仓库可以设为私有；不要提交 `.env`、SQLite 数据库或源工作簿。
2. 在支持 Docker 的托管服务创建 Web Service，使用仓库根目录的 `Dockerfile` 构建。
3. 配置 `ART_ADMIN_TOKEN`（至少 32 个字符的随机值）和 `PORT`（由托管服务分配）。保留镜像默认的 `APP_ENV=production`、`HOST=0.0.0.0`、`ART_MUSEUM_DB=/data/art_museum.sqlite3`。
4. 为服务挂载持久化磁盘到 `/data`。磁盘用于保存参与者答题、结果、反馈和匿名统计；不要使用重启后会清空的临时文件系统。
5. 用托管服务提供的 HTTPS 域名测试首页、完整答题、结果页和分享页，再把该链接发给测试者。需要长期使用时再绑定自己的域名。

生产启动会拒绝默认或过短的管理口令。管理员通过 `/admin` 输入该口令管理作品；不要把口令发给测试者。镜像以非 root 用户运行，只包含 WebP 展示图和运行所需文件，不包含用户提供的原始 JPG、工作簿或本地数据库。

## 小范围测试前

- 首页会说明服务端保存匿名答题记录、结果与自愿反馈；正式扩大测试前，建议补上明确的数据保存期限和删除流程。
- T01–T06 是用户提供素材，原始图片来源及公开传播授权尚待确认；确认许可前，仅用于经邀请的小范围原型测试。
- T10、T18、T22 暂无可用展示授权，页面显示作品名牌。其余图像来源和授权记录见 [素材清单](ASSET_CREDITS.md)。
- 这版适合小规模内测。它使用单实例 Python `ThreadingHTTPServer` 和 SQLite，不适合多实例扩容或高流量公开上线；扩大规模前应迁移到正式 Web 框架和托管数据库。
- 目前没有自动备份与过期清理。开始收集真实测试反馈后，应定期备份 `/data/art_museum.sqlite3`，并按既定的保留期限清理参与者记录。

## 作品资产更新

在根目录保留 V0.6 工作簿和源 JSON。安装 `requirements.txt` 中的 `openpyxl` 后运行：

```sh
python3 scripts/import_artworks.py
```

脚本会校验 T01–T32、锚点名、五位编码和五维阈值后再重建 `database/artworks.json`。已运行环境若要应用重导数据，应在 CMS 复核后导入并发布新版本；已存在的历史快照不会被覆盖。

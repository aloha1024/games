# Playground 玩点

一个可自行部署的 H5 小游戏网站。访客无需登录即可游玩；创作者注册后可以在浏览器中编写 HTML、CSS、JavaScript，保存草稿并发布游戏。

## 启动

需要 **Node.js 24 或以上版本**（使用内置 `node:sqlite`）。没有第三方运行时依赖，也没有额外构建步骤。

```bash
cd /workspace/games
npm start
```

默认监听端口 `3000`。开发时使用 `npm run dev` 自动重启服务。数据库默认保存在 `.data/games.sqlite`，首次启动自动创建表并加入三款示例游戏。

## 使用 Docker 运行

需要 Docker Engine / Docker Desktop 和 Docker Compose v2，无需在宿主机安装 Node.js。

在项目根目录执行：

```bash
docker compose up -d --build --wait
```

启动后，通过运行 Docker 的主机 IP 和 `3000` 端口访问网站。Compose 会等待健康检查通过后返回。容器使用 Node.js 24 官方镜像，以非 root 用户运行。

可选：复制 `.env.example` 为 `.env` 后修改配置。`APP_PORT` 控制宿主机端口，例如改为 `8080` 后通过主机的 `8080` 端口访问；容器内部仍使用 `3000`。如果部署 HTTPS 站点，将 `PUBLIC_ORIGIN` 设置为真实站点来源，并设置 `COOKIE_SECURE=1`。本地 HTTP 开发保持 `COOKIE_SECURE=0`。修改配置后重新运行启动命令。

```bash
# 查看状态和日志
docker compose ps
docker compose logs -f games

# 拉取代码更新后，重新构建并启动
git pull
docker compose up -d --build --wait

# 停止并移除容器，保留账号和游戏数据
docker compose down

# 在独立镜像构建阶段运行检查和集成测试
docker build --target test -t playground-h5:test .
```

数据库保存在名为 `<Compose项目名>_playground_data` 的 Docker 数据卷中，挂载到容器 `/data`。重启、重建和普通 `docker compose down` 均会保留数据。**`docker compose down -v` 会删除数据卷及全部账号和作品。** 使用相同的项目目录 / Compose 项目名重启，才能复用原数据卷。

Docker 初次运行使用独立的新数据库，不会自动导入本机 `.data` 中的已有数据。镜像构建不会包含 `.data`、`.env` 或 Git 历史。需要迁移已有数据时，先停止写入，再将完整数据库目录复制到数据卷，并确保容器用户 UID/GID `1000:1000` 可写。

不使用 Compose 时，也可以：

```bash
docker build -t playground-h5:local .
docker volume create playground_data
docker run -d --name playground --restart unless-stopped --init \
  -p 3000:3000 \
  --mount type=volume,src=playground_data,dst=/data \
  playground-h5:local
```

公网部署仍需配置 HTTPS 反向代理和域名；Docker 启动本身不会提供公网域名。

## 已实现

- 响应式中文游戏大厅，支持关键词搜索、分类和热门 / 最新排序。
- 贪吃蛇、记忆翻牌、接星星三款完整游戏及可修改的模板。
- 注册、登录、退出；密码使用随机盐和 scrypt 派生，会话保存在数据库中。
- HTML / CSS / JavaScript 编辑器，800 毫秒防抖预览，支持 Ctrl / ⌘ + Enter 手动刷新。
- 保存私有草稿、发布、编辑、取消发布、删除自己的游戏。
- 每款作品有 `/#play/<游戏ID>` 分享地址，可由其他访客游玩；记录启动次数。
- 玩家全屏、重新开始和复制分享链接。
- 游戏内容通过沙盒 iframe 和独立 CSP 响应运行，无法读取主站会话或请求网络。

## 使用流程

1. 点击「创建游戏」，选择一个模板并修改代码。
2. 在下方填写名称、简介、分类和封面主题。
3. 点击「保存草稿」或「发布游戏」，按提示注册或登录。
4. 发布后，游戏会出现在大厅。打开游戏页，点击「分享」复制地址。
5. 在「我的作品」中继续编辑、取消发布或删除作品。

HTML 编辑栏用于游戏页面内容；CSS 和 JavaScript 分别填入对应栏。资源可使用 data URL 内嵌。当前版本不支持外部脚本、远程资源和网络 API。预览保留约 10 分钟，过期后点击「运行预览」重新生成。未保存的代码仅保留在当前页面，离开前请保存。

## 配置与部署

| 变量            | 默认值           | 用途                                                           |
| --------------- | ---------------- | -------------------------------------------------------------- |
| `PORT`          | `3000`           | HTTP 监听端口                                                  |
| `HOST`          | `0.0.0.0`        | 监听地址                                                       |
| `DATA_DIR`      | 仓库下 `.data`   | SQLite 数据目录，应挂载持久化磁盘                              |
| `PUBLIC_ORIGIN` | 按请求 Host 校验 | 公网部署时设置为完整站点来源，例如 `https://games.example.com` |
| `COOKIE_SECURE` | 未设置           | HTTPS 部署时设置为 `1`，使会话 Cookie 仅通过 HTTPS 发送        |

生产环境应以常驻 Node 进程运行，在前面配置 HTTPS 反向代理。设置真实 `PUBLIC_ORIGIN`、`COOKIE_SECURE=1`，并保留原始 Host 请求头。注册限流依据直连来源 IP；共用反向代理时，建议由入口代理按真实来源设置限流。应用不会信任任意转发 IP 请求头。

这是带持久化数据库的单机 MVP，不适用于只有静态托管或文件系统临时性的部署平台。备份时使用 SQLite 在线备份，或先停止服务再复制整个数据目录（包含 WAL 文件）。不要提交数据库到 Git。发布云开发环境快照与将网站部署到公网是两件事；当前仓库不包含公网域名或托管服务配置。

当前注册对所有访问者开放，尚未包含作品审核、管理员后台、账号找回和文件上传。游玩计数为启动次数，不去重。

## 验证

```bash
npm run check
npm test
```

测试使用临时数据库和随机端口，覆盖示例游戏、独立预览、注册登录、字段校验、跨站请求拒绝、草稿隔离、作者权限、发布 / 取消发布、计数、删除以及重启后的数据和会话持久化，不会污染开发数据库。

已使用 Chromium 验证大厅筛选、注册、代码编辑、预览、草稿保存、发布、独立访客游玩、翻牌通关、游戏计时，以及手机宽度下的页面布局。

## 项目结构

- `server.js`：HTTP API、会话认证、SQLite 存储与沙盒游戏页面。
- `public/app.js`：页面路由、游戏大厅、创作台和播放器。
- `public/templates.js`：内置游戏源码及沙盒页面构建。
- `public/styles.css`：桌面和移动端样式。
- `test/server.test.js`：独立的 API 集成测试。

import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { templates, gameDocument, gamePolicy } from "./public/templates.js";
const scrypt = promisify(scryptCallback),
  root = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(process.env.DATA_DIR || join(root, ".data"));
mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(join(dataDir, "games.sqlite"));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,password TEXT NOT NULL,salt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS games(id TEXT PRIMARY KEY,owner TEXT REFERENCES users(id),title TEXT NOT NULL,description TEXT NOT NULL,category TEXT NOT NULL,cover TEXT NOT NULL,html TEXT NOT NULL,css TEXT NOT NULL,js TEXT NOT NULL,published INTEGER NOT NULL DEFAULT 0,plays INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL,updated INTEGER NOT NULL);`);
for (const g of templates)
  db.prepare(
    "INSERT OR IGNORE INTO games VALUES(?,NULL,?,?,?,?,?,?,?,1,0,?,?)",
  ).run(
    g.id,
    g.title,
    g.description,
    g.category,
    g.cover,
    g.html,
    g.css,
    g.js,
    Date.now(),
    Date.now(),
  );
const summary = `g.id,g.owner,g.title,g.description,g.category,g.cover,g.published,g.plays,g.created,g.updated,COALESCE(u.username,'Playground 官方') AS author`;
const digest = (t) => createHash("sha256").update(t).digest("hex");
function user(req) {
  const token = req.headers.cookie?.match(
    /(?:^|;\s*)session=([a-f0-9]{64})(?:;|$)/,
  )?.[1];
  return token
    ? db
        .prepare(
          "SELECT u.id,u.username FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token=? AND s.expires>?",
        )
        .get(digest(token), Date.now())
    : null;
}
function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}
async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 512000) fail(413, "游戏内容不能超过 500 KB");
    chunks.push(chunk);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!data || typeof data !== "object" || Array.isArray(data))
      fail(400, "请求内容必须为 JSON 对象");
    return data;
  } catch {
    fail(400, "请求内容格式错误");
  }
}
const limits = new Map();
function rate(req) {
  const ip = req.socket.remoteAddress,
    now = Date.now();
  if (limits.size > 10000) {
    for (const [key, v] of limits) if (v.until < now) limits.delete(key);
  }
  let v = limits.get(ip);
  if (!v || v.until < now) {
    v = { count: 0, until: now + 60000 };
    limits.set(ip, v);
  }
  if (++v.count > 20) fail(429, "尝试次数过多，请一分钟后重试");
}
function validate(b) {
  for (const key of [
    "title",
    "description",
    "category",
    "cover",
    "html",
    "css",
    "js",
  ])
    if (typeof b[key] !== "string") fail(400, "请填写完整的游戏信息");
  if (!b.title.trim() || b.title.length > 40)
    fail(400, "游戏名称需要 1–40 个字符");
  if (b.description.length > 200) fail(400, "简介最多 200 个字符");
  if (
    !["街机", "益智", "休闲"].includes(b.category) ||
    !["snake", "memory", "stars"].includes(b.cover)
  )
    fail(400, "请选择有效的分类和封面");
  if (typeof b.published !== "boolean") fail(400, "发布状态无效");
  return [
    b.title.trim(),
    b.description,
    b.category,
    b.cover,
    b.html,
    b.css,
    b.js,
    Number(b.published),
  ];
}
const previews = new Map();
const staticFiles = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
  "/templates.js": ["templates.js", "text/javascript; charset=utf-8"],
};
const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  const send = (status, data) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(data));
  };
  try {
    const url = new URL(req.url, "http://localhost"),
      path = url.pathname,
      method = req.method,
      me = user(req);
    if (!["GET", "HEAD"].includes(method)) {
      if (req.headers["sec-fetch-site"] === "cross-site")
        fail(403, "请求来源无效");
      if (req.headers.origin) {
        const expected = process.env.PUBLIC_ORIGIN;
        if (!URL.canParse(req.headers.origin)) fail(403, "请求来源无效");
        const origin = new URL(req.headers.origin);
        if (
          expected
            ? origin.origin !== new URL(expected).origin
            : origin.host !== req.headers.host
        )
          fail(403, "请求来源无效");
      }
      if (!req.headers["content-type"]?.startsWith("application/json"))
        fail(415, "请求需要 JSON 格式");
    }
    if (path === "/api/preview" && method === "POST") {
      const b = await body(req);
      for (const k of ["html", "css", "js"])
        if (typeof b[k] !== "string") fail(400, "预览内容无效");
      const now = Date.now();
      for (const [key, p] of previews)
        if (p.expires < now) previews.delete(key);
      if (previews.size >= 100) previews.delete(previews.keys().next().value);
      const id = randomBytes(20).toString("hex");
      previews.set(id, { document: gameDocument(b), expires: now + 600000 });
      return send(201, { url: "/preview/" + id });
    }
    if (path.startsWith("/preview/") && method === "GET") {
      const p = previews.get(path.slice(9));
      if (!p || p.expires < Date.now()) fail(404, "预览已过期，请重新运行");
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy":
          gamePolicy + "; sandbox allow-scripts; frame-ancestors 'self'",
        "Cache-Control": "no-store",
      });
      return res.end(p.document);
    }
    if (path === "/api/me" && method === "GET")
      return send(200, { user: me || null });
    if (["/api/register", "/api/login"].includes(path) && method === "POST") {
      rate(req);
      const b = await body(req);
      if (
        typeof b.username !== "string" ||
        !/^[\p{L}\p{N}_-]{2,24}$/u.test(b.username) ||
        typeof b.password !== "string" ||
        b.password.length < 8 ||
        b.password.length > 128
      )
        fail(400, "用户名需 2–24 位字母、数字或中文；密码需 8–128 位");
      let account;
      if (path === "/api/register") {
        const salt = randomBytes(16).toString("hex"),
          hash = (await scrypt(b.password, salt, 64)).toString("hex");
        try {
          db.prepare("INSERT INTO users VALUES(?,?,?,?)").run(
            randomBytes(12).toString("hex"),
            b.username,
            hash,
            salt,
          );
        } catch (e) {
          if (e.code?.includes("CONSTRAINT") || e.message.includes("UNIQUE"))
            fail(409, "用户名已被使用");
          throw e;
        }
        account = db
          .prepare("SELECT * FROM users WHERE username=?")
          .get(b.username);
      } else {
        account = db
          .prepare("SELECT * FROM users WHERE username=?")
          .get(b.username);
        const hash = await scrypt(
          b.password,
          account?.salt || "invalid-account",
          64,
        );
        if (
          !account ||
          !timingSafeEqual(hash, Buffer.from(account.password, "hex"))
        )
          fail(401, "用户名或密码不正确");
      }
      const token = randomBytes(32).toString("hex");
      db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
      db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
        digest(token),
        account.id,
        Date.now() + 604800000,
      );
      res.setHeader(
        "Set-Cookie",
        `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${process.env.COOKIE_SECURE === "1" ? "; Secure" : ""}`,
      );
      return send(200, {
        user: { id: account.id, username: account.username },
      });
    }
    if (path === "/api/logout" && method === "POST") {
      const t = req.headers.cookie?.match(
        /(?:^|;\s*)session=([a-f0-9]{64})(?:;|$)/,
      )?.[1];
      if (t) db.prepare("DELETE FROM sessions WHERE token=?").run(digest(t));
      res.setHeader(
        "Set-Cookie",
        "session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
      );
      return send(200, { ok: true });
    }
    if (path === "/api/games" && method === "GET") {
      const mine = url.searchParams.get("mine") === "1";
      if (mine && !me) fail(401, "请先登录");
      const games = mine
        ? db
            .prepare(
              `SELECT ${summary} FROM games g LEFT JOIN users u ON g.owner=u.id WHERE g.owner=? ORDER BY g.updated DESC`,
            )
            .all(me.id)
        : db
            .prepare(
              `SELECT ${summary} FROM games g LEFT JOIN users u ON g.owner=u.id WHERE g.published=1 ORDER BY g.created DESC`,
            )
            .all();
      return send(200, { games });
    }
    if (path === "/api/games" && method === "POST") {
      if (!me) fail(401, "请先登录");
      const values = validate(await body(req)),
        id = randomBytes(10).toString("hex"),
        now = Date.now();
      db.prepare(
        "INSERT INTO games(id,owner,title,description,category,cover,html,css,js,published,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
      ).run(id, me.id, ...values, now, now);
      return send(201, { id });
    }
    const match = path.match(/^\/api\/games\/([a-z0-9]+)(\/play)?$/);
    if (match) {
      const g = db
        .prepare(
          "SELECT g.*,COALESCE(u.username,'Playground 官方') AS author FROM games g LEFT JOIN users u ON g.owner=u.id WHERE g.id=?",
        )
        .get(match[1]);
      if (!g || (!g.published && g.owner !== me?.id))
        fail(404, "游戏不存在或尚未发布");
      if (match[2] && method === "GET") {
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy":
            gamePolicy + "; sandbox allow-scripts; frame-ancestors 'self'",
          "Cache-Control": "no-store",
        });
        return res.end(gameDocument(g));
      }
      if (!match[2] && method === "GET") return send(200, { game: g });
      if (match[2] && method === "POST") {
        db.prepare("UPDATE games SET plays=plays+1 WHERE id=?").run(g.id);
        return send(200, { ok: true });
      }
      if (!match[2] && ["PUT", "DELETE"].includes(method)) {
        if (!me) fail(401, "请先登录");
        if (g.owner !== me.id) fail(403, "只能管理自己的游戏");
        if (method === "DELETE") {
          db.prepare("DELETE FROM games WHERE id=?").run(g.id);
          return send(200, { ok: true });
        }
        const values = validate(await body(req));
        db.prepare(
          "UPDATE games SET title=?,description=?,category=?,cover=?,html=?,css=?,js=?,published=?,updated=? WHERE id=?",
        ).run(...values, Date.now(), g.id);
        return send(200, { id: g.id });
      }
    }
    if (path === "/favicon.ico" && method === "GET") {
      res.writeHead(204);
      return res.end();
    }
    if (method === "GET" && staticFiles[path]) {
      const [file, type] = staticFiles[path];
      res.writeHead(200, {
        "Content-Type": type,
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      });
      return res.end(readFileSync(join(root, "public", file)));
    }
    send(404, { error: "页面不存在" });
  } catch (e) {
    if (!e.status) console.error(e);
    send(e.status || 500, {
      error: e.status ? e.message : "服务器暂时不可用，请重试",
    });
  }
});
server.listen(
  Number(process.env.PORT || 3000),
  process.env.HOST || "0.0.0.0",
  () => console.log(`Playground is listening on port ${server.address().port}`),
);

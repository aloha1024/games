import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { templates } from "../public/templates.js";

test("完整创作、发布和访问隔离流程", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "playground-test-"));
  let processHandle, base;
  async function start() {
    processHandle = spawn(process.execPath, ["server.js"], {
      env: { ...process.env, PORT: "0", HOST: "127.0.0.1", DATA_DIR: dir },
      stdio: ["ignore", "pipe", "pipe"],
    });
    base = await new Promise((resolve, reject) => {
      let log = "";
      const timer = setTimeout(
        () => reject(new Error("Server startup timed out")),
        10000,
      );
      processHandle.stdout.on("data", (d) => {
        log += d;
        const m = log.match(/port (\d+)/);
        if (m) {
          clearTimeout(timer);
          resolve("http://127.0.0.1:" + m[1]);
        }
      });
      processHandle.on("error", reject);
      processHandle.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error("Server exited " + code));
      });
    });
  }
  async function stop() {
    const exited = once(processHandle, "exit");
    processHandle.kill();
    await exited;
  }
  t.after(async () => {
    if (processHandle.exitCode === null) await stop();
    await rm(dir, { recursive: true, force: true });
  });
  await start();
  async function req(path, method = "GET", body, cookie, origin) {
    return fetch(base + path, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { cookie } : {}),
        ...(origin ? { Origin: origin } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }
  let cookie, otherCookie, id;
  const game = {
    ...templates[0],
    title: "测试游戏 <script>",
    published: false,
  };
  await t.test("大厅有三款完整的示例游戏", async () => {
    const r = await req("/api/games");
    assert.equal(r.status, 200);
    assert.equal((await r.json()).games.length, 3);
    const html = await (await req("/api/games/snake/play")).text();
    assert.match(html, /setInterval/);
    assert.match(html, /<\/script>/);
  });
  await t.test("独立预览可运行且受沙盒和网络策略限制", async () => {
    const r = await req("/api/preview", "POST", templates[0]);
    assert.equal(r.status, 201);
    const { url } = await r.json();
    const preview = await req(url);
    assert.equal(preview.status, 200);
    assert.match(
      preview.headers.get("content-security-policy"),
      /sandbox allow-scripts/,
    );
    assert.match(await preview.text(), /setInterval/);
    assert.equal((await req("/preview/doesnotexist")).status, 404);
    assert.equal(
      (await req("/api/preview", "POST", { html: 1, css: "", js: "" })).status,
      400,
    );
  });
  await t.test("注册后获得 HttpOnly 会话，不能重复注册", async () => {
    const r = await req("/api/register", "POST", {
      username: "创作者",
      password: "password123",
    });
    assert.equal(r.status, 200);
    cookie = r.headers.get("set-cookie").split(";")[0];
    assert.match(r.headers.get("set-cookie"), /HttpOnly/);
    assert.equal(
      (await (await req("/api/me", "GET", null, cookie)).json()).user.username,
      "创作者",
    );
    assert.equal(
      (
        await req("/api/register", "POST", {
          username: "创作者",
          password: "password123",
        })
      ).status,
      409,
    );
  });
  await t.test("未登录不能创建，跨站请求被拒绝", async () => {
    assert.equal((await req("/api/games", "POST", game)).status, 401);
    assert.equal(
      (await req("/api/games", "POST", game, cookie, "https://evil.example"))
        .status,
      403,
    );
    const r = await fetch(base + "/api/games", {
      method: "POST",
      headers: { "Content-Type": "text/plain", cookie },
      body: JSON.stringify(game),
    });
    assert.equal(r.status, 415);
  });
  await t.test("保存草稿，私有草稿不在大厅且访客不能读取", async () => {
    const r = await req("/api/games", "POST", game, cookie);
    assert.equal(r.status, 201);
    id = (await r.json()).id;
    assert.equal((await req("/api/games/" + id)).status, 404);
    assert.equal((await req("/api/games/" + id + "/play")).status, 404);
    assert.equal(
      (await req("/api/games/" + id, "GET", null, cookie)).status,
      200,
    );
    assert.equal((await (await req("/api/games")).json()).games.length, 3);
    assert.equal(
      (await (await req("/api/games?mine=1", "GET", null, cookie)).json()).games
        .length,
      1,
    );
  });
  await t.test("错误密码被拒绝，正确密码可登录", async () => {
    assert.equal(
      (
        await req("/api/login", "POST", {
          username: "创作者",
          password: "wrongpassword",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await req("/api/login", "POST", {
          username: "创作者",
          password: "password123",
        })
      ).status,
      200,
    );
  });
  await t.test("发布后访客可读取，游戏响应带独立沙盒策略", async () => {
    assert.equal(
      (
        await req(
          "/api/games/" + id,
          "PUT",
          { ...game, published: true },
          cookie,
        )
      ).status,
      200,
    );
    assert.equal((await (await req("/api/games")).json()).games.length, 4);
    const r = await req("/api/games/" + id + "/play");
    assert.equal(r.status, 200);
    assert.match(
      r.headers.get("content-security-policy"),
      /sandbox allow-scripts/,
    );
    assert.match(
      r.headers.get("content-security-policy"),
      /connect-src 'none'/,
    );
    assert.doesNotMatch(
      r.headers.get("content-security-policy"),
      /allow-same-origin/,
    );
  });
  await t.test("另一账号不能修改或删除他人的作品", async () => {
    const r = await req("/api/register", "POST", {
      username: "其他用户",
      password: "password456",
    });
    otherCookie = r.headers.get("set-cookie").split(";")[0];
    assert.equal(
      (
        await req(
          "/api/games/" + id,
          "PUT",
          { ...game, published: true },
          otherCookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (await req("/api/games/" + id, "DELETE", {}, otherCookie)).status,
      403,
    );
  });
  await t.test("游戏可记录游玩次数", async () => {
    assert.equal(
      (await req("/api/games/" + id + "/play", "POST", {})).status,
      200,
    );
    assert.equal((await (await req("/api/games/" + id)).json()).game.plays, 1);
  });
  await t.test("字段与内容大小验证有效", async () => {
    assert.equal(
      (await req("/api/games", "POST", { ...game, title: "" }, cookie)).status,
      400,
    );
    assert.equal(
      (await req("/api/games", "POST", { ...game, published: "false" }, cookie))
        .status,
      400,
    );
    assert.equal(
      (
        await req(
          "/api/games",
          "POST",
          { ...game, html: "x".repeat(520000) },
          cookie,
        )
      ).status,
      413,
    );
  });
  await t.test("重启服务后作品及会话保持", async () => {
    await stop();
    await start();
    assert.equal(
      (await (await req("/api/games/" + id)).json()).game.title,
      game.title,
    );
    assert.equal(
      (await (await req("/api/me", "GET", null, cookie)).json()).user.username,
      "创作者",
    );
  });
  await t.test("取消发布、删除和退出会话正常", async () => {
    assert.equal(
      (await req("/api/games/" + id, "PUT", game, cookie)).status,
      200,
    );
    assert.equal((await req("/api/games/" + id)).status, 404);
    assert.equal(
      (await req("/api/games/" + id, "DELETE", {}, cookie)).status,
      200,
    );
    assert.equal(
      (await req("/api/games/" + id, "GET", null, cookie)).status,
      404,
    );
    assert.equal((await req("/api/logout", "POST", {}, cookie)).status, 200);
    assert.equal(
      (await (await req("/api/me", "GET", null, cookie)).json()).user,
      null,
    );
  });
});

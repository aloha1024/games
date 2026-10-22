import { templates } from "./templates.js";
import { mountWorld } from "./world-client.js";
let worldCleanup = null;
const $ = (s) => document.querySelector(s),
  app = $("#app");
const icons = {
  plus: "M12 5v14M5 12h14",
  search: "m21 21-4.4-4.4M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  play: "m9 5 11 7-11 7V5Z",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  bolt: "m13 2-9 12h7l-1 8 10-12h-7l1-8Z",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  game: "M8 7h8c4 0 6 11 3 12-2 1-4-3-5-3h-4c-1 0-3 4-5 3C2 18 4 7 8 7ZM8 9v5m-2-2h4m6-2h.01m2 3h.01",
  puzzle:
    "M3 3h6c-2 5 6 5 4 0h6v6c5-2 5 6 0 4v6h-6c2-5-6-5-4 0H3v-6c5 2 5-6 0-4V3Z",
  leaf: "M20 3C9 1 2 8 6 15s17 5 14-12ZM4 21 15 10",
  code: "m8 5-7 7 7 7m8-14 7 7-7 7m-3-17-2 20",
  shield: "m12 2 8 4v7c0 4-8 9-8 9s-8-5-8-9V6l8-4Zm-4 10 3 3 5-6",
  expand: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5",
  refresh: "M20 7V2m0 5h-5m5 0a9 9 0 1 0 1 8",
  share: "M12 16V2m-5 5 5-5 5 5M5 12H3v10h18V12h-2",
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[name] || icons.game}"/></svg>`;
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let currentUser = null,
  games = [],
  category = "全部",
  query = "",
  sort = "popular",
  editor = null,
  codeTab = "html",
  dirty = false,
  editRevision = 0,
  renderVersion = 0,
  toastTimer,
  authSuccess;
async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "请求失败，请重试");
  return data;
}
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("visible"), 3200);
}
function artwork(type, hero = false) {
  if (type === "snake")
    return `<svg viewBox="0 0 600 320" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="600" height="320" fill="#dceacb"/><path d="M0 80h600M0 160h600M0 240h600M100 0v320M200 0v320M300 0v320M400 0v320M500 0v320" stroke="#cbdcba" stroke-width="1"/><circle cx="300" cy="160" r="125" fill="#eaf2df"/><path d="M200 230h-25v-95h75v55h100v-80h65" fill="none" stroke="#496c3c" stroke-width="43" stroke-linejoin="round" stroke-linecap="round" opacity=".15" transform="translate(5 10)"/><path d="M200 220h-25v-95h75v55h100v-80h65" fill="none" stroke="#7ca85a" stroke-width="40" stroke-linejoin="round" stroke-linecap="round"/><rect x="389" y="76" width="57" height="49" rx="16" fill="#a8cc76"/><rect x="418" y="84" width="8" height="10" rx="2" fill="#344b2b"/><rect x="418" y="107" width="8" height="10" rx="2" fill="#344b2b"/><path d="m458 161 10-12 10 12-10 12Z" fill="#f8b071"/><path d="m117 79 4-9 4 9 9 4-9 4-4 9-4-9-9-4Z" fill="#a3be82"/><circle cx="430" cy="245" r="6" fill="#a9c68b"/><text x="300" y="295" text-anchor="middle" fill="#77905f" font-size="11" letter-spacing="5" font-family="monospace">JUST ONE MORE BITE</text></svg>`;
  if (type === "memory")
    return `<svg viewBox="0 0 600 320" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="600" height="320" fill="#efe0e7"/><circle cx="300" cy="156" r="127" fill="#f6edf1"/><g transform="translate(160 52) rotate(-10 62 88)"><rect x="5" y="9" width="125" height="170" rx="16" fill="#d8b9c9"/><rect width="125" height="170" rx="16" fill="#bc8caf"/><rect x="9" y="9" width="107" height="152" rx="10" fill="none" stroke="#dcb5d0" stroke-width="2" stroke-dasharray="4 5"/><path d="m62 52 9 21 23 9-23 9-9 22-9-22-23-9 23-9Z" fill="#efd8e7"/></g><g transform="translate(291 75) rotate(12 65 88)"><rect x="5" y="9" width="125" height="170" rx="16" fill="#d8b9c9"/><rect width="125" height="170" rx="16" fill="#fffaf7"/><circle cx="51" cy="96" r="23" fill="#e98c94"/><circle cx="82" cy="96" r="23" fill="#dd778b"/><path d="M51 77q-2-30 19-40M82 76 70 37q24-2 30 16-23 7-30-16" fill="#9bac70" stroke="#8c9c66" stroke-width="4"/><path d="M39 88q0-5 6-7" fill="none" stroke="#ffcad0" stroke-width="5" stroke-linecap="round"/></g><path d="m443 65 4-12 4 12 12 4-12 4-4 12-4-12-12-4Z" fill="#b994b0"/><circle cx="134" cy="229" r="5" fill="#cfa2bf"/><text x="300" y="295" text-anchor="middle" fill="#ad87a0" font-size="11" letter-spacing="5" font-family="monospace">A PERFECT LITTLE MATCH</text></svg>`;
  return `<svg viewBox="0 0 600 320" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="600" height="320" fill="#dcdcf1"/><circle cx="300" cy="155" r="121" fill="#e8e6f7"/><g fill="#aaa4cc"><circle cx="130" cy="75" r="3"/><circle cx="439" cy="112" r="3"/><circle cx="459" cy="218" r="3"/><circle cx="193" cy="241" r="3"/><circle cx="388" cy="42" r="3"/></g><path d="m296 53 19 39 43 6-31 30 7 43-38-20-38 20 7-43-31-30 43-6Z" fill="#f5ce7b" stroke="#e8b966" stroke-width="2" transform="rotate(12 296 110)"/><path d="m287 93-6 12m33-8-6 12" stroke="#a98545" stroke-width="5" stroke-linecap="round"/><path d="m286 120q9 11 18 0" fill="none" stroke="#a98545" stroke-width="3" stroke-linecap="round"/><path d="M229 200h139l-18 49H247Z" fill="#9691c2"/><path d="M230 201q68 25 136 0" fill="none" stroke="#b2aed9" stroke-width="13" stroke-linecap="round"/><path d="m404 164 5-13 5 13 13 5-13 5-5 13-5-13-13-5Z" fill="#b9b2d5"/><path d="m191 118 4-10 4 10 10 4-10 4-4 10-4-10-10-4Z" fill="#c4b7d7"/><text x="300" y="295" text-anchor="middle" fill="#938bb7" font-size="11" letter-spacing="5" font-family="monospace">CATCH A LITTLE WONDER</text></svg>`;
}
function heroArt() {
  return `<svg viewBox="0 0 630 400" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><ellipse cx="337" cy="212" rx="228" ry="160" fill="#e5ead8"/><circle cx="349" cy="194" r="139" fill="none" stroke="#d9dfc9" stroke-dasharray="5 8"/><g transform="translate(181 58) rotate(11 140 130)"><rect x="8" y="14" width="285" height="251" rx="22" fill="#d0d6bf"/><rect width="285" height="251" rx="22" fill="#fffef7" stroke="#e0e2d8"/><circle cx="20" cy="19" r="3" fill="#f1b7b3"/><circle cx="32" cy="19" r="3" fill="#efdaa1"/><circle cx="44" cy="19" r="3" fill="#bdd29c"/><text x="263" y="23" text-anchor="end" fill="#9d9f94" font-size="8" font-family="monospace">SNAKE.EXE</text><rect x="13" y="36" width="259" height="201" rx="12" fill="#e7edda"/><path d="M28 77h230M28 113h230M28 149h230M28 185h230M67 48v177M106 48v177M145 48v177M184 48v177M223 48v177" stroke="#d9e2c8"/><path d="M95 181H67v-68h73v68h61v-68h34" fill="none" stroke="#8ba864" stroke-width="25" stroke-linejoin="round" stroke-linecap="round"/><rect x="211" y="98" width="38" height="31" rx="9" fill="#a3be7c"/><path d="M234 103v4m0 12v4" stroke="#4f643a" stroke-width="4"/><path d="m177 64 9 9-9 9-9-9Z" fill="#d8a86f"/><text x="28" y="218" font-family="monospace" font-size="8" fill="#889873">SCORE 00080</text><text x="256" y="218" text-anchor="end" font-family="monospace" font-size="8" fill="#889873">LEVEL 02</text></g><g transform="translate(97 200) rotate(-16 64 59)"><rect x="6" y="8" width="117" height="108" rx="23" fill="#bfc8ac"/><rect width="117" height="108" rx="23" fill="#b8a0de"/><path d="M30 76V47a29 29 0 0 1 58 0v29l-10-7-10 9-10-9-10 9-9-9Z" fill="#f7f0ff"/><rect x="45" y="43" width="8" height="13" rx="4" fill="#8f6bbb"/><rect x="67" y="43" width="8" height="13" rx="4" fill="#8f6bbb"/></g><g transform="translate(422 210) rotate(14)"><rect x="6" y="9" width="106" height="98" rx="23" fill="#c3caac"/><rect width="106" height="98" rx="23" fill="#d6e7ab"/><path d="M43 23v19H24v16h19v19h17V58h19V42H60V23Z" fill="#7a9255"/><path d="M47 27h9v19H28v8h19v19h9V54h19v-8H56V27" fill="#8fa66b"/></g><path d="m468 65 5-17 5 17 17 5-17 5-5 17-5-17-17-5Z" fill="#ad97d0"/><path d="m117 115 4-13 4 13 13 4-13 4-4 13-4-13-13-4Z" fill="#b1bd90"/><circle cx="512" cy="170" r="7" fill="#e3c28f"/><circle cx="284" cy="338" r="5" fill="#b4a3c9"/><path d="m353 330 6 10-6 10-6-10Z" fill="#adb98c"/><g transform="translate(359 23) rotate(8)"><rect width="105" height="28" rx="14" fill="#fffdf6"/><text x="52" y="18" text-anchor="middle" font-size="10" font-family="system-ui" fill="#8e987b">✦  PLAY. CREATE. REPEAT.</text></g></svg>`;
}
function updateAccount() {
  const el = $("#account");
  el.innerHTML = currentUser
    ? `<a href="#mine" class="btn btn-ghost user-button" title="${esc(currentUser.username)}">${esc(currentUser.username)}</a><button class="btn btn-ghost" id="logout" aria-label="退出登录">退出</button><a class="btn btn-primary" href="#studio">${icon("plus")} 创建游戏</a>`
    : `<button class="btn btn-ghost" id="login">登录 / 注册</button><a class="btn btn-primary" href="#studio">${icon("plus")} 创建游戏</a>`;
  $("#login")?.addEventListener("click", () => openAuth());
  $("#logout")?.addEventListener("click", async () => {
    try {
      await api("/api/logout", { method: "POST", body: {} });
      currentUser = null;
      updateAccount();
      location.hash = "";
      toast("已退出登录");
    } catch (e) {
      toast(e.message);
    }
  });
}
function openAuth(onSuccess, register = false) {
  authSuccess = onSuccess;
  const dialog = $("#auth-dialog");
  renderAuth(register);
  if (!dialog.open) dialog.showModal();
}
function renderAuth(register) {
  const dialog = $("#auth-dialog");
  dialog.innerHTML = `<div class="dialog-top"><span class="brand">✦ playground</span><button class="close" aria-label="关闭">×</button></div><h2>${register ? "让创意，从这里开始" : "欢迎回到玩点"}</h2><p>${register ? "创建账号，把你的第一个小游戏分享给世界。" : "登录后继续创作，下一份快乐由你定义。"}</p><form id="auth-form"><label class="field">用户名<input name="username" autocomplete="username" placeholder="2–24 位中文、字母或数字" required minlength="2" maxlength="24"></label><label class="field">密码<input type="password" name="password" autocomplete="${register ? "new-password" : "current-password"}" placeholder="至少 8 位字符" required minlength="8" maxlength="128"></label><div class="form-error" role="alert"></div><button class="btn btn-primary" type="submit">${register ? "创建账号" : "登录"} ${icon("arrow")}</button></form><p class="auth-bottom">${register ? "已有账号？" : "第一次来？"} <button class="switch">${register ? "直接登录" : "免费注册"}</button></p>`;
  dialog.querySelector(".close").onclick = () => dialog.close();
  dialog.querySelector(".switch").onclick = () => renderAuth(!register);
  if (register) dialog.querySelector('h2 + p').textContent = '创建账号后，当前浏览器的游客角色和进度会自动转入账号，无需重新开始。';
  dialog.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    const button = e.target.querySelector("button[type=submit]");
    button.disabled = true;
    const values = Object.fromEntries(new FormData(e.target));
    try {
      const data = await api(register ? "/api/world/register" : "/api/login", {
        method: "POST",
        body: values,
      });
      currentUser = data.user;
      updateAccount();
      dialog.close();
      toast(data.guestProgressTransferred ? "注册成功！游客角色与全部进度已转入账号，继续冒险吧。" : register ? "账号已创建，开始创作吧！" : "欢迎回来！");
      const didRefresh = !!authSuccess;
      authSuccess?.();
      authSuccess = null;
      if (location.hash === "#mine") render();
      else if (location.hash === "#world" && !didRefresh) render();
    } catch (error) {
      dialog.querySelector(".form-error").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
}
function card(g, mine = false, template = false) {
  return `<article class="game-card"><a class="cover" href="${template ? "#studio/" + g.id : "#play/" + g.id}" aria-label="${template ? "使用模板" : "游玩"}：${esc(g.title)}">${artwork(g.cover)}<span class="cover-tag">${template ? "开箱即用" : g.owner ? "社区创作" : "编辑精选"}</span><div class="play-overlay"><span>${template ? "使用这个模板 ↗" : "▷ 即刻开玩"}</span></div></a><div class="card-body">${template ? '<p class="template-label">HTML · CSS · JAVASCRIPT</p>' : ""}<div class="card-heading"><h3><a href="${template ? "#studio/" + g.id : "#play/" + g.id}">${esc(g.title)}</a></h3><span class="category">${esc(g.category)}</span></div><p class="card-description">${esc(g.description || "一份来自创作者的快乐，等你来发现。")}</p><div class="card-meta"><span class="author"><span class="avatar">${g.owner ? esc(g.author?.slice(0, 1) || "玩") : "✦"}</span>${esc(g.author || "Playground 官方")}</span>${mine ? `<span class="status-pill ${g.published ? "" : "draft"}">${g.published ? "已发布" : "草稿"}</span>` : `<span class="plays">${icon(template ? "code" : "play")}${template ? "自由修改 · 免费使用" : `${g.plays || 0} 次游玩`}</span>`}</div>${mine ? `<div class="card-actions"><a class="btn btn-light" href="#edit/${g.id}">编辑作品</a><button class="btn btn-light" data-toggle="${g.id}">${g.published ? "取消发布" : "发布游戏"}</button><button class="btn btn-ghost" data-delete="${g.id}" aria-label="删除 ${esc(g.title)}">删除</button></div>` : ""}</div></article>`;
}
function home() {
  app.innerHTML = `<div class="container"><section class="hero"><div class="hero-copy"><div class="eyebrow"><span class="dot"></span> A LITTLE PLAY, A LOT OF JOY</div><h1>让快乐，<br><em>即刻发生。</em></h1><p>发现有趣的小游戏，也创造属于你的那一个。<br>无需下载，点开就玩，让灵感自由生长。</p><a href="#games" class="btn btn-primary" id="explore">${icon("play")} 探索游戏</a><a class="hero-link" href="#studio">成为创作者 <span>↗</span></a></div><div class="hero-art">${heroArt()}</div><span class="hero-note">YOUR NEXT HAPPY PLACE.</span></section><div class="features"><span>${icon("bolt")}即点即玩，无需下载</span><span>${icon("code")}用代码，把脑洞变成游戏</span><span>${icon("shield")}免费游玩，自由创造</span></div><section id="games"><div class="section-top"><div class="section-title"><span class="spark">✳</span><h2>发现好玩的</h2><span>给日常加一点快乐</span></div><label class="search">${icon("search")}<input id="search" type="search" placeholder="搜索游戏，发现你的心头好…" aria-label="搜索游戏" value="${esc(query)}"></label></div><div class="filter-row"><div class="filters">${[
    ["全部", "grid"],
    ["街机", "game"],
    ["益智", "puzzle"],
    ["休闲", "leaf"],
  ]
    .map(
      ([name, i]) =>
        `<button class="filter ${category === name ? "active" : ""}" data-category="${name}" aria-pressed="${category === name}">${icon(i)}${name === "全部" ? "全部游戏" : name}</button>`,
    )
    .join(
      "",
    )}</div><select id="sort" class="sort" aria-label="游戏排序"><option value="popular">热门推荐</option><option value="new">最新发布</option></select></div><div class="game-grid" id="game-list"></div></section><section class="creator-banner"><div class="code-art">&lt;/&gt;</div><div><h2>下一个好玩的，来自你。</h2><p>从一个灵感出发，用 HTML5 创造你的游戏世界。</p></div><span class="banner-spark">✳</span><a href="#studio" class="btn">开启创作之旅 ${icon("arrow")}</a></section><div class="bottom-note">保持好奇，继续玩耍</div></div>`;
  $("#sort").value = sort;
  $("#sort").onchange = (e) => {
    sort = e.target.value;
    drawGames();
  };
  $("#search").oninput = (e) => {
    query = e.target.value;
    drawGames();
  };
  document.querySelectorAll("[data-category]").forEach(
    (b) =>
      (b.onclick = () => {
        category = b.dataset.category;
        document.querySelectorAll("[data-category]").forEach((x) => {
          x.classList.toggle("active", x === b);
          x.setAttribute("aria-pressed", x === b);
        });
        drawGames();
      }),
  );
  $("#explore").onclick = (e) => {
    e.preventDefault();
    $("#games").scrollIntoView({ behavior: "smooth", block: "start" });
  };
  drawGames();
  const worldBanner = document.createElement("section");
  worldBanner.className = "world-banner";
  worldBanner.innerHTML = '<div><span>多人冒险 · 账号存档</span><h2>星野纪元 <small>STARFALL ONLINE</small></h2><p>走进微光森林，和伙伴一起唤醒古老的星辉。</p></div><a href="#world">进入世界 ↗</a>';
  $("#games").before(worldBanner);
}
function drawGames() {
  let shown = games.filter(
    (g) =>
      (category === "全部" || g.category === category) &&
      `${g.title} ${g.description} ${g.author}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  shown.sort(
    sort === "new"
      ? (a, b) => b.created - a.created
      : (a, b) => b.plays - a.plays,
  );
  $("#game-list").innerHTML = shown.length
    ? shown.map((g) => card(g)).join("")
    : `<div class="empty"><div class="empty-icon">⌕</div><h3>还没找到这款游戏</h3><p>换一个关键词，或试试其他分类。</p><button class="btn btn-light" id="clear-search">查看全部游戏</button></div>`;
  $("#clear-search")?.addEventListener("click", () => {
    query = "";
    category = "全部";
    home();
  });
}
function templatesPage() {
  app.innerHTML = `<div class="container"><div class="page-head"><div><div class="eyebrow">A SMALL START, A BIG IDEA</div><h1>好创意，从这里发芽。</h1><p>选一个喜欢的模板，改一改，就成为你的第一款小游戏。</p></div><a class="btn btn-primary" href="#studio">${icon("plus")} 开始创作</a></div><div class="templates-intro">✦ 每一个模板都是完整可玩的游戏。调整样式、改变规则，或让它变成一个全新的故事。所有模板均支持键盘和触摸操作。</div><div class="game-grid">${templates.map((g) => card(g, false, true)).join("")}</div></div>`;
}
async function minePage(version) {
  if (!currentUser) {
    app.innerHTML = `<div class="container"><div class="page-head"><div><h1>我的创作空间</h1><p>每一个小小的灵感，都值得被看见。</p></div></div><div class="empty"><div class="empty-icon">✦</div><h3>你的下一个作品，在这里开始</h3><p>登录后保存草稿、发布游戏，管理你的所有作品。</p><button class="btn btn-primary" id="mine-login">登录 / 注册</button></div></div>`;
    $("#mine-login").onclick = () => openAuth();
    return;
  }
  const { games: mine } = await api("/api/games?mine=1");
  if (version !== renderVersion) return;
  app.innerHTML = `<div class="container"><div class="page-head"><div><div class="eyebrow">YOUR CREATIVE CORNER</div><h1>我的作品 <span class="category">${mine.length}</span></h1><p>从一行代码开始，让更多人遇见你的快乐。</p></div><a class="btn btn-primary" href="#studio">${icon("plus")} 创建游戏</a></div><div class="game-grid">${mine.length ? mine.map((g) => card(g, true)).join("") : `<div class="empty"><div class="empty-icon">&lt;/&gt;</div><h3>这里，留给你的第一个作品</h3><p>从现成模板开始，几分钟就能发布自己的小游戏。</p><a href="#templates" class="btn btn-primary">挑选灵感模板 ${icon("arrow")}</a></div>`}</div></div>`;
  document.querySelectorAll("[data-toggle]").forEach(
    (b) =>
      (b.onclick = async () => {
        b.disabled = true;
        try {
          const { game } = await api("/api/games/" + b.dataset.toggle);
          await api("/api/games/" + game.id, {
            method: "PUT",
            body: { ...game, published: !game.published },
          });
          toast(
            game.published ? "游戏已取消发布" : "游戏已发布，大家都能来玩了！",
          );
          render();
        } catch (e) {
          toast(e.message);
          b.disabled = false;
        }
      }),
  );
  document.querySelectorAll("[data-delete]").forEach(
    (b) =>
      (b.onclick = async () => {
        if (!confirm("确定删除这个游戏？删除后无法恢复。")) return;
        b.disabled = true;
        try {
          await api("/api/games/" + b.dataset.delete, {
            method: "DELETE",
            body: {},
          });
          toast("作品已删除");
          render();
        } catch (e) {
          toast(e.message);
          b.disabled = false;
        }
      }),
  );
}
function collectEditor() {
  if (!editor || !$("#code")) return;
  editor[codeTab] = $("#code").value;
  for (const key of ["title", "description", "category", "cover"])
    editor[key] = $("#field-" + key).value;
}
let previewVersion = 0,
  livePreviewTimer;
async function updatePreview(notify = false) {
  const version = ++previewVersion,
    frame = $("#preview");
  try {
    const { url } = await api("/api/preview", {
      method: "POST",
      body: { html: editor.html, css: editor.css, js: editor.js },
    });
    if (version !== previewVersion || !frame.isConnected) return;
    frame.src = url;
    if (notify) toast("预览已更新");
  } catch (e) {
    toast("预览失败：" + e.message);
  }
}
function preview() {
  clearTimeout(livePreviewTimer);
  collectEditor();
  updatePreview(true);
}
function markDirty() {
  editRevision++;
  dirty = true;
  $("#save-status").textContent = "有尚未保存的更改";
}
async function studioPage(parts, version) {
  let initial;
  if (parts[0] === "edit") {
    const { game } = await api("/api/games/" + parts[1]);
    if (game.owner !== currentUser?.id)
      throw new Error("请登录创作者账号后编辑这个作品");
    initial = { ...game, published: !!game.published };
  } else {
    const t = templates.find((t) => t.id === parts[1]) || templates[0];
    initial = { ...t, id: null, title: "我的" + t.title, published: false };
  }
  if (version !== renderVersion) return;
  editor = initial;
  codeTab = "html";
  dirty = false;
  app.innerHTML = `<div class="container"><div class="page-head"><div><a href="#mine" class="back-link">← 返回我的作品</a><h1>${editor.id ? "编辑作品" : "把灵感，变成好玩的。"}</h1><p>写一点代码，创造一点快乐。</p></div><div class="head-actions"><span class="save-status" id="save-status">${editor.id ? "已保存" : "新建作品"}</span><button class="btn btn-light" id="save">${editor.published ? "保存更新" : "保存草稿"}</button><button class="btn btn-primary" id="publish">${icon("arrow")}${editor.published ? "保存并查看" : "发布游戏"}</button></div></div><div class="template-picker"><span>从模板开始</span>${templates.map((t) => `<button class="btn btn-light" data-template="${t.id}">${t.title}</button>`).join("")}</div><div class="editor-layout"><section class="panel code-panel"><div class="panel-header"><div class="code-tabs">${["html", "css", "js"].map((t) => `<button class="code-tab ${t === codeTab ? "active" : ""}" data-tab="${t}" aria-pressed="${t === codeTab}">${t.toUpperCase()}</button>`).join("")}</div><span>✦ CODE YOUR JOY</span></div><textarea id="code" class="code-editor" spellcheck="false" aria-label="HTML 代码"></textarea><div class="code-footer"><span>UTF-8</span><span>Ctrl / ⌘ + Enter 运行预览</span></div></section><section class="panel"><div class="panel-header"><span>◉ 实时预览</span><button class="btn btn-light" id="preview-run">${icon("play")}运行预览</button></div><iframe class="preview-frame" id="preview" sandbox="allow-scripts" title="游戏预览"></iframe></section></div><section class="panel game-info"><h3>作品信息</h3><div class="form-grid"><label class="field">游戏名称<input id="field-title" value="${esc(editor.title)}" maxlength="40" required placeholder="给你的游戏起个名字"></label><label class="field">游戏分类<select id="field-category">${["街机", "益智", "休闲"].map((v) => `<option ${v === editor.category ? "selected" : ""}>${v}</option>`).join("")}</select></label><label class="field full">一句话介绍<textarea id="field-description" maxlength="200" placeholder="告诉大家，你的游戏有什么特别之处？">${esc(editor.description)}</textarea></label><label class="field">封面主题<select id="field-cover">${templates.map((t) => `<option value="${t.cover}" ${t.cover === editor.cover ? "selected" : ""}>${t.title} · ${t.cover === "snake" ? "森林绿" : t.cover === "memory" ? "樱花粉" : "星空紫"}</option>`).join("")}</select></label></div><p class="editor-note">游戏发布后会出现在游戏大厅，并拥有可分享的独立链接。可在「我的作品」中随时取消发布。游戏在独立沙盒中运行；请将资源内嵌到代码中，不支持外部网络请求。</p></section></div>`;
  $("#code").value = editor.html;
  updatePreview();
  $("#code").oninput = () => {
    markDirty();
    clearTimeout(livePreviewTimer);
    const currentEditor = editor;
    livePreviewTimer = setTimeout(() => {
      if (editor !== currentEditor || !$("#code")) return;
      collectEditor();
      updatePreview();
    }, 800);
  };
  document
    .querySelectorAll(".game-info input,.game-info textarea,.game-info select")
    .forEach((e) => e.addEventListener("input", markDirty));
  document.querySelectorAll("[data-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        collectEditor();
        codeTab = b.dataset.tab;
        $("#code").value = editor[codeTab];
        $("#code").setAttribute("aria-label", codeTab.toUpperCase() + " 代码");
        document.querySelectorAll("[data-tab]").forEach((x) => {
          x.classList.toggle("active", x === b);
          x.setAttribute("aria-pressed", x === b);
        });
      }),
  );
  $("#code").onkeydown = (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const start = e.target.selectionStart,
        end = e.target.selectionEnd;
      e.target.setRangeText("  ", start, end, "end");
      e.target.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      preview();
    }
  };
  $("#preview-run").onclick = preview;
  $("#save").onclick = () => saveGame(false);
  $("#publish").onclick = () => saveGame(true);
  document.querySelectorAll("[data-template]").forEach(
    (b) =>
      (b.onclick = () => {
        if (
          dirty &&
          !confirm("切换模板会替换代码，并更新默认作品信息，是否继续？")
        )
          return;
        clearTimeout(livePreviewTimer);
        collectEditor();
        const t = templates.find((t) => t.id === b.dataset.template);
        const useDefaultTitle =
          !editor.title.trim() ||
          templates.some((item) => editor.title === "我的" + item.title);
        const useDefaultDescription =
          !editor.description.trim() ||
          templates.some((item) => editor.description === item.description);
        Object.assign(editor, {
          html: t.html,
          css: t.css,
          js: t.js,
          cover: t.cover,
          category: t.category,
          title: useDefaultTitle ? "我的" + t.title : editor.title,
          description: useDefaultDescription ? t.description : editor.description,
        });
        $("#code").value = editor[codeTab];
        $("#field-title").value = editor.title;
        $("#field-description").value = editor.description;
        $("#field-cover").value = t.cover;
        $("#field-category").value = t.category;
        markDirty();
        updatePreview();
      }),
  );
}
async function saveGame(publish) {
  collectEditor();
  if (!editor.title.trim()) {
    toast("先给游戏起一个名字吧");
    $("#field-title").focus();
    return;
  }
  if (!currentUser) {
    openAuth(() => saveGame(publish));
    return;
  }
  const save = $("#save"),
    pub = $("#publish");
  if (save.disabled) return;
  const savingEditor = editor,
    savingVersion = renderVersion,
    savedRevision = editRevision,
    body = { ...savingEditor, published: publish || !!savingEditor.published };
  const isCurrentEditor = () =>
    editor === savingEditor &&
    renderVersion === savingVersion &&
    save.isConnected;
  save.disabled = pub.disabled = true;
  $("#save-status").textContent = "正在保存…";
  try {
    const result = await api(
      savingEditor.id ? "/api/games/" + savingEditor.id : "/api/games",
      { method: savingEditor.id ? "PUT" : "POST", body },
    );
    savingEditor.id = result.id;
    savingEditor.published = body.published;
    if (!isCurrentEditor()) return;
    dirty = editRevision !== savedRevision;
    $("#save-status").textContent = dirty
      ? "有尚未保存的更改"
      : "所有更改已保存";
    $("#save").textContent = editor.published ? "保存更新" : "保存草稿";
    pub.innerHTML = `${icon("arrow")}${editor.published ? "保存并查看" : "发布游戏"}`;
    toast(
      dirty
        ? publish
          ? "已发布提交时的版本，后续更改尚未保存"
          : "本次提交已保存，后续更改尚未保存"
        : publish
          ? "发布成功，让快乐被更多人发现！"
          : "作品已保存",
    );
    if (publish && !dirty) location.hash = "#play/" + result.id;
    else {
      history.replaceState(null, "", "#edit/" + result.id);
    }
  } catch (error) {
    if (isCurrentEditor()) {
      $("#save-status").textContent = "保存失败，请重试";
      toast(error.message);
    }
  } finally {
    save.disabled = pub.disabled = false;
  }
}
async function playerPage(id, version) {
  const { game } = await api("/api/games/" + id);
  if (version !== renderVersion) return;
  app.innerHTML = `<div class="container"><div class="page-head"><div><a href="#" class="back-link">← 返回游戏大厅</a><h1>${esc(game.title)}</h1></div><span class="category">${esc(game.category)} · 即点即玩</span></div><div class="player-layout"><section class="player" id="player"><iframe id="play-frame" src="/api/games/${game.id}/play" sandbox="allow-scripts" title="${esc(game.title)}"></iframe><div class="player-toolbar"><span>✦ 放松一下，玩得开心。</span><div><button class="btn" id="restart">${icon("refresh")}重新开始</button><button class="btn" id="fullscreen">${icon("expand")}全屏</button><button class="btn" id="share">${icon("share")}分享</button></div></div></section><aside class="panel game-aside"><span class="category">${esc(game.category)}</span><h2>${esc(game.title)}</h2><p>${esc(game.description)}</p><div class="detail-row"><span>创作者</span><span>${esc(game.author)}</span></div><div class="detail-row"><span>游玩次数</span><span>${game.plays + 1}</span></div><hr><h3>怎么玩？</h3><p>点击游戏内的开始按钮。支持键盘、鼠标或触摸操作，具体规则见游戏内说明。</p>${game.owner === currentUser?.id ? `<a class="btn btn-light" href="#edit/${game.id}">${icon("code")} 编辑作品</a>` : `<a class="btn btn-light" href="#studio">我也要创作 ${icon("arrow")}</a>`}</aside></div></div>`;
  api("/api/games/" + id + "/play", { method: "POST", body: {} }).catch(
    () => {},
  );
  $("#restart").onclick = () => {
    $("#play-frame").src = "/api/games/" + id + "/play";
  };
  $("#fullscreen").onclick = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await $("#player").requestFullscreen();
    } catch {
      toast("当前浏览器暂不支持全屏模式");
    }
  };
  $("#share").onclick = async () => {
    if (!game.published) {
      toast("这是私有草稿，请先发布再分享");
      return;
    }
    try {
      await navigator.clipboard.writeText(location.href);
      toast("游戏链接已复制，分享给朋友吧！");
    } catch {
      prompt("复制这个链接，邀请朋友来玩", location.href);
    }
  };
}
async function render() {
  worldCleanup?.();
  worldCleanup = null;
  const version = ++renderVersion,
    parts = location.hash.slice(1).split("/"),
    route = parts[0];
  document
    .querySelectorAll("[data-nav]")
    .forEach((a) =>
      a.classList.toggle(
        "active",
        a.dataset.nav ===
          (route === "world" ? "world" : route === "templates"
            ? "templates"
            : route === "mine" || route === "edit" || route === "studio"
              ? "mine"
              : "home"),
      ),
    );
  app.innerHTML = '<div class="loading">✦ 正在准备快乐…</div>';
  try {
    if (route === "studio" || route === "edit")
      await studioPage(parts, version);
    else {
      editor = null;
      dirty = false;
      if (route === "mine") await minePage(version);
      else if (route === "templates") templatesPage();
      else if (route === "world") {
        worldCleanup = mountWorld(app, { currentUser, openAuth, refresh: render });
      }
      else if (route === "play") await playerPage(parts[1], version);
      else {
        const data = await api("/api/games");
        if (version !== renderVersion) return;
        games = data.games;
        home();
      }
    }
    window.scrollTo(0, 0);
  } catch (e) {
    if (version !== renderVersion) return;
    app.innerHTML = `<div class="container"><div class="empty error-page"><div class="empty-icon">☁</div><h2>暂时无法打开</h2><p>${esc(e.message)}</p><a class="btn btn-light" href="#">回到游戏大厅</a> <button class="btn btn-primary" id="retry">重试</button></div></div>`;
    $("#retry").onclick = () => render();
  }
}
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
document.addEventListener("click", (e) => {
  const link = e.target.closest('a[href^="#"]');
  if (link && dirty && link.hash !== location.hash && link.id !== "explore") {
    if (!confirm("有尚未保存的更改，确定离开吗？")) {
      e.preventDefault();
      return;
    }
    dirty = false;
  }
});
window.addEventListener("hashchange", (e) => {
  if (dirty && !confirm("有尚未保存的更改，确定离开吗？")) {
    history.replaceState(null, "", e.oldURL);
    return;
  }
  clearTimeout(livePreviewTimer);
  dirty = false;
  render();
});
try {
  currentUser = (await api("/api/me")).user;
} catch {
  toast("暂时无法连接服务器，请稍后重试");
}
updateAccount();
render();

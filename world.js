import { randomBytes } from "node:crypto";
import { WORLD, CLASSES, NPC, NODES, QUESTS, xpNeeded, maxHp, distance, canStand } from "./public/world-rules.js";

const reject = (status, message) => { throw Object.assign(new Error(message), { status }); };
export function createWorld(db, now = Date.now) {
  db.exec(`CREATE TABLE IF NOT EXISTS world_characters (
    user_id TEXT PRIMARY KEY REFERENCES users(id), data TEXT NOT NULL, saved_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS world_guests (
    id TEXT PRIMARY KEY, token TEXT UNIQUE NOT NULL, expires INTEGER NOT NULL,
    data TEXT, saved_at INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS world_guests_expiry ON world_guests(expires);`);
  const active = new Map(), chat = [], monsters = [], nodes = NODES.map(n => ({ ...n, readyAt: 0 }));
  let lastTick = now(), lastSave = now(), chatId = 0;
  const spawns = [[730,690],[920,800],[1120,620],[1270,900],[1460,780],[1550,530],[1680,980],[1880,1080]];
  for (let i = 0; i < spawns.length; i++) {
    const [x, y] = spawns[i];
    monsters.push({ id: `m${i}`, name: i < 4 ? "苔原团子" : "暮色幽灵", x, y, homeX:x, homeY:y,
      hp: i < 4 ? 60 : 100, maxHp: i < 4 ? 60 : 100, damage: i < 4 ? 7 : 11,
      xp: i < 4 ? 25 : 40, gold: i < 4 ? 12 : 20, deadUntil: 0, hitAt: 0, contributors: new Map() });
  }
  monsters.push({ id:"boss", name:"古树守卫", x:2110, y:670, homeX:2110, homeY:670,
    hp:650, maxHp:650, damage:20, xp:160, gold:120, deadUntil:0, hitAt:0, contributors:new Map() });
  function save(p) {
    const savedAt = now();
    if (p.guest) {
      db.prepare("UPDATE world_guests SET data=?,saved_at=? WHERE id=?")
        .run(JSON.stringify(p.data), savedAt, p.userId);
    } else db.prepare("INSERT INTO world_characters VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data,saved_at=excluded.saved_at")
      .run(p.userId, JSON.stringify(p.data), savedAt);
    p.savedAt = savedAt;
  }
  function load(userId, guest = false) {
    const row = db.prepare(guest ? "SELECT * FROM world_guests WHERE id=?" : "SELECT * FROM world_characters WHERE user_id=?").get(userId);
    return row?.data ? { data: JSON.parse(row.data), savedAt: row.saved_at } : null;
  }
  function summary(userId, guest = false) {
    const p = active.get(userId) || load(userId, guest);
    return { character: p?.data || null, savedAt: p?.savedAt || null, online: active.size, guest };
  }
  function join(user, b) {
    let p = active.get(user.id);
    if (!p && active.size >= 64) reject(503, "世界已满（64 人），请稍后再试");
    if (!p) {
      const stored = load(user.id, user.guest);
      if (!stored && !Object.hasOwn(CLASSES, b.classId)) reject(400, "请选择一个职业");
      const data = stored?.data || { name:user.username, classId:b.classId, ...WORLD.spawn,
        level:1, xp:0, hp:b.classId === "knight" ? 130 : 100, gold:30, potions:3,
        weapon:0, crystals:0, kills:0, gathered:0, bossKills:0, quest:0, deaths:0 };
      p = { userId:user.id, guest:!!user.guest, data, savedAt:stored?.savedAt || 0, attackAt:0, skillAt:0,
        potionAt:0, chatAt:0, inputAt:0, dx:0, dy:0 };
      active.set(user.id, p);
      save(p);
    }
    // A new tab takes control explicitly; stale tabs can never overwrite its save.
    p.clientId = randomBytes(16).toString("hex");
    p.guestExpires = user.guest ? user.expires : null;
    p.seen = now(); p.dx = p.dy = 0;
    return { clientId:p.clientId, ...snapshot(p) };
  }
  function requirePlayer(userId, clientId) {
    const p = active.get(userId);
    if (!p || p.clientId !== clientId) reject(409, "连接已结束或角色已在另一窗口打开，请重新进入世界");
    p.seen = now();
    return p;
  }
  function gain(p, xp, gold) {
    const d = p.data; d.xp += xp; d.gold += gold;
    while (d.xp >= xpNeeded(d.level)) {
      d.xp -= xpNeeded(d.level); d.level++; d.hp = maxHp(d);
    }
  }
  function snapshot(p) {
    return { me:{ ...p.data, maxHp:maxHp(p.data) }, playerId:p.userId,
      guest:p.guest, guestExpires:p.guestExpires, savedAt:p.savedAt, time:now(),
      players:[...active.values()].map(v => ({ id:v.userId, ...v.data, maxHp:maxHp(v.data) })),
      monsters:monsters.map(({ contributors, ...m }) => m),
      nodes:nodes.map(n => ({ ...n })), chat:chat.slice(-35), online:active.size };
  }
  function hurt(p, damage) {
    p.data.hp = Math.max(0, p.data.hp - damage);
    if (!p.data.hp) {
      p.data.deaths++; Object.assign(p.data, WORLD.spawn); p.data.hp = maxHp(p.data);
      p.dx = p.dy = 0; p.notice = "你已在营地复苏，装备和任务进度均已保留。";
      save(p);
    }
  }
  function kill(m, attacker) {
    m.hp = 0; m.deadUntil = now() + (m.id === "boss" ? 45000 : 16000);
    for (const [id, at] of m.contributors) {
      const p = active.get(id);
      if (!p || now() - at > 15000 || distance(p.data, m) > 500) continue;
      gain(p, m.xp, m.gold); p.data.kills++;
      if (m.id === "boss") p.data.bossKills++;
      save(p);
    }
    attacker.notice = `击败${m.name}！参与战斗的伙伴共同获得奖励。`;
    m.contributors.clear();
  }
  function action(userId, b) {
    const p = requirePlayer(userId, b.clientId), d = p.data, time = now();
    if (!p.rateUntil || time >= p.rateUntil) { p.rateUntil=time+1000; p.rateCount=0; }
    if (++p.rateCount > 35) reject(429,"操作过于频繁，请稍等");
    if (b.type === "input") {
      if (![b.dx,b.dy].every(v => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1)) reject(400,"移动方向无效");
      const length = Math.max(1, Math.hypot(b.dx,b.dy));
      p.dx = b.dx / length; p.dy = b.dy / length; p.inputAt = time;
    } else if (b.type === "attack" || b.type === "skill") {
      const cls = CLASSES[d.classId], skill = b.type === "skill";
      if (time < (skill ? p.skillAt : p.attackAt)) reject(429, "技能尚在冷却");
      const m = monsters.find(m => m.id === b.target && m.hp > 0);
      if (!m || distance(d,m) > cls.range + (skill ? 60 : 0)) reject(400, "目标超出攻击距离，请靠近一些");
      if (m.id === "boss" && d.level < 3) reject(400, "达到 3 级后才能挑战古树守卫");
      p.attackAt = time + cls.cooldown;
      if (skill) p.skillAt = time + 6500;
      const targets = skill ? monsters.filter(n => n.hp > 0 && distance(n,m) < 150 && (n.id !== "boss" || d.level >= 3)) : [m];
      for (const target of targets) {
        target.contributors.set(userId,time);
        target.hp -= Math.round((cls.damage + (d.level-1)*3 + d.weapon*6) * (skill ? 1.7 : 1));
        if (target.hp <= 0) kill(target,p);
      }
    } else if (b.type === "gather") {
      const n = nodes.find(n => n.id === b.target);
      if (!n || n.readyAt > time || distance(d,n) > 95) reject(400,"请靠近一枚可采集的星辉结晶");
      n.readyAt = time + 22000; d.crystals++; d.gathered++; gain(p,15,5); save(p);
      p.notice = "获得星辉结晶 ×1、经验 +15、金币 +5";
    } else if (b.type === "potion") {
      if (!d.potions) reject(400,"药水不足，请前往营地购买");
      if (d.hp >= maxHp(d)) reject(400,"生命值已满");
      if (time < p.potionAt) reject(429,"药水冷却中");
      p.potionAt = time+2000; d.potions--; d.hp = Math.min(maxHp(d), d.hp+65); save(p);
    } else if (["quest","upgrade","buy","rest"].includes(b.type)) {
      if (distance(d,NPC) > 160) reject(400,"请回到营地，与守林人艾拉交谈");
      if (b.type === "quest") {
        const q = QUESTS[d.quest];
        if (!q || d[q.key] < q.goal) reject(400,"任务尚未完成");
        gain(p,q.xp,q.gold); d.quest++; p.notice = `任务完成，获得 ${q.gold} 金币 / ${q.xp} 经验`;
      } else if (b.type === "upgrade") {
        const cost = 50*(d.weapon+1);
        if (d.weapon >= 10) reject(400,"武器已达到最高强化等级");
        if (d.gold < cost) reject(400,`需要 ${cost} 金币`);
        d.gold -= cost; d.weapon++; p.notice = "武器强化成功，攻击力提升 6 点";
      } else if (b.type === "buy") {
        if (d.gold < 15) reject(400,"金币不足，需要 15 金币");
        d.gold -= 15; d.potions++; p.notice = "购买了恢复药水 ×1";
      } else { d.hp = maxHp(d); p.notice = "休息完毕，生命值已恢复"; }
      save(p);
    } else if (b.type === "chat") {
      if (typeof b.text !== "string" || !b.text.trim() || b.text.length > 120) reject(400,"消息需要 1–120 个字符");
      if (time < p.chatAt) reject(429,"发送太快，请稍等");
      p.chatAt = time+1500;
      chat.push({ id:++chatId, name:d.name, text:b.text.trim() });
      if (chat.length > 35) chat.shift();
    } else if (b.type === "save") save(p);
    else if (b.type === "leave") { save(p); active.delete(userId); return { ok:true }; }
    else reject(400,"未知操作");
    const notice = p.notice; p.notice = null;
    return { ...snapshot(p), notice, cooldowns:{ attack:p.attackAt, skill:p.skillAt } };
  }
  function tick() {
    const time = now(), dt = Math.max(0,Math.min((time-lastTick)/1000,0.15)); lastTick = time;
    for (const [id,p] of active) {
      if (time-p.seen > 15000) { save(p); active.delete(id); continue; }
      if (time-p.inputAt > 650) p.dx = p.dy = 0;
      const d = p.data, x = d.x+p.dx*WORLD.speed*dt, y = d.y+p.dy*WORLD.speed*dt;
      if (canStand(x,d.y)) d.x=x;
      if (canStand(d.x,y)) d.y=y;
    }
    for (const m of monsters) {
      if (m.hp <= 0) {
        if (time >= m.deadUntil) Object.assign(m,{hp:m.maxHp,x:m.homeX,y:m.homeY,deadUntil:0});
        continue;
      }
      const targets = [...active.values()].filter(p => distance(p.data,WORLD.spawn)>280 && (m.id !== "boss" || p.data.level >= 3));
      targets.sort((a,b) => distance(a.data,m)-distance(b.data,m));
      const target = targets[0];
      if (target && distance(target.data,m) < (m.id === "boss" ? 300 : 250) && distance(m,{x:m.homeX,y:m.homeY}) < 350) {
        const dist=distance(target.data,m);
        if (dist > 40) {
          const step=Math.min(dist-40,dt*(m.id === "boss" ? 70 : 90));
          const x=m.x+(target.data.x-m.x)/dist*step, y=m.y+(target.data.y-m.y)/dist*step;
          if(canStand(x,y)) { m.x=x; m.y=y; }
        }
        if (dist < 62 && time >= m.hitAt) { m.hitAt=time+1100; hurt(target,m.damage); }
      } else {
        const dist=Math.hypot(m.x-m.homeX,m.y-m.homeY);
        if(dist>2) { m.x+=(m.homeX-m.x)/dist*dt*60; m.y+=(m.homeY-m.y)/dist*dt*60; }
      }
    }
    if(time-lastSave >= 5000) {
      for(const p of active.values()) save(p);
      db.prepare("DELETE FROM world_guests WHERE expires<=?").run(time);
      lastSave=time;
    }
  }
  function close() { for(const p of active.values()) save(p); }
  // Called inside the registration transaction; memory is changed only after COMMIT.
  function transferGuest(guestId, account) {
    const row = db.prepare("SELECT data FROM world_guests WHERE id=? AND expires>?").get(guestId, now());
    if (!row) reject(409, "游客进度已迁移或身份已过期，请刷新页面后重试");
    if (active.has(account.id) || db.prepare("SELECT 1 FROM world_characters WHERE user_id=?").get(account.id))
      reject(409, "账号已有角色，不能覆盖原有进度");
    const source = active.get(guestId)?.data || (row.data ? JSON.parse(row.data) : null);
    if (!source) reject(409, "游客角色尚未建立，请刷新页面后重试");
    const data = { ...source, name:account.username }, savedAt = now();
    db.prepare("INSERT INTO world_characters(user_id,data,saved_at) VALUES(?,?,?)")
      .run(account.id, JSON.stringify(data), savedAt);
    db.prepare("DELETE FROM world_guests WHERE id=?").run(guestId);
    return { guestId, accountId:account.id, data, savedAt };
  }
  function finishGuestTransfer(transfer) {
    const p = active.get(transfer.guestId);
    if (p) {
      active.delete(transfer.guestId);
      Object.assign(p, { userId:transfer.accountId, guest:false, guestExpires:null,
        data:transfer.data, savedAt:transfer.savedAt, dx:0, dy:0, seen:now(),
        clientId:randomBytes(16).toString("hex") });
      active.set(transfer.accountId,p);
    }
    for (const m of monsters) if (m.contributors.has(transfer.guestId)) {
      m.contributors.set(transfer.accountId,m.contributors.get(transfer.guestId));
      m.contributors.delete(transfer.guestId);
    }
  }
  return { summary, join, action, tick, close, transferGuest, finishGuestTransfer };
}

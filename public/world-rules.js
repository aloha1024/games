// Shared map and progression constants. All authoritative decisions run on the server.
export const WORLD = { width: 2400, height: 1600, spawn: { x: 410, y: 790 }, speed: 190 };
export const CLASSES = {
  ranger: { name: "游侠", color: "#91d7b0", range: 215, damage: 18, cooldown: 650 },
  knight: { name: "骑士", color: "#f4cf80", range: 100, damage: 27, cooldown: 700 },
  mage: { name: "法师", color: "#bca7f6", range: 250, damage: 24, cooldown: 950 },
};
export const NPC = { x: 420, y: 660, name: "守林人 · 艾拉" };
export const NODES = [
  { id: "c1", x: 650, y: 780 }, { id: "c2", x: 820, y: 560 },
  { id: "c3", x: 1050, y: 960 }, { id: "c4", x: 1300, y: 590 },
  { id: "c5", x: 1580, y: 1080 }, { id: "c6", x: 1800, y: 730 },
];
export const OBSTACLES = [
  { x: 860, y: 180, w: 180, h: 190 }, { x: 1080, y: 1120, w: 370, h: 190 },
  { x: 1680, y: 250, w: 250, h: 170 }, { x: 180, y: 1050, w: 260, h: 180 },
];
export const QUESTS = [
  { name: "林间的异动", text: "击败 5 只森林怪物", key: "kills", goal: 5, gold: 90, xp: 100 },
  { name: "失落的星光", text: "采集 4 枚星辉结晶", key: "gathered", goal: 4, gold: 120, xp: 130 },
  { name: "古树的回响", text: "击败遗迹中的古树守卫", key: "bossKills", goal: 1, gold: 250, xp: 250 },
];
export const xpNeeded = (level) => level * 60;
export const maxHp = (p) => 100 + (p.level - 1) * 15 + (p.classId === "knight" ? 30 : 0);
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function canStand(x, y) {
  return x >= 28 && x <= WORLD.width - 28 && y >= 28 && y <= WORLD.height - 28 &&
    !OBSTACLES.some(o => x > o.x - 16 && x < o.x + o.w + 16 && y > o.y - 16 && y < o.y + o.h + 16);
}

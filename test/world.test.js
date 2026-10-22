import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createWorld } from '../world.js';
import { maxHp } from '../public/world-rules.js';

test('游客转存保留最新内存进度，提交后旧角色失效且不占双份在线名额',t=>{
  const s=setup(t);
  const guestUser={id:'guest_transfer',username:'游客',guest:true,expires:2000000};
  const data={name:'游客',classId:'mage',x:650,y:780,level:4,xp:33,hp:82,gold:247,potions:7,weapon:2,crystals:8,kills:9,gathered:8,bossKills:1,quest:2,deaths:3};
  s.db.prepare('INSERT INTO world_guests VALUES(?,?,?,?,?)').run(guestUser.id,'token',guestUser.expires,JSON.stringify(data),1000000);
  const guest=s.world.join(guestUser,{classId:'ranger'});
  s.world.action(guestUser.id,{clientId:guest.clientId,type:'input',dx:1,dy:0});s.advance(100);
  const latest=s.world.summary(guestUser.id,true).character;
  assert.ok(latest.x>data.x);
  const account={id:'a',username:'正式玩家'};
  s.db.exec('BEGIN');const transfer=s.world.transferGuest(guestUser.id,account);s.db.exec('COMMIT');s.world.finishGuestTransfer(transfer);
  const stored=JSON.parse(s.db.prepare('SELECT data FROM world_characters WHERE user_id=?').get('a').data);
  assert.deepEqual(stored,{...latest,name:'正式玩家'});
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM world_guests').get().n,0);
  assert.equal(s.world.summary('a').online,1);
  assert.throws(()=>s.world.action(guestUser.id,{clientId:guest.clientId,type:'save'}),/连接已结束/);
  assert.throws(()=>s.world.action('a',{clientId:guest.clientId,type:'save'}),/另一窗口/);
  const joined=s.join();assert.equal(joined.guest,false);assert.equal(joined.me.classId,'mage');
  s.restart();assert.deepEqual(s.world.summary('a').character,stored);
});

test('迁移事务回滚保留游客角色，并拒绝覆盖账号或重复领取',t=>{
  const s=setup(t),guestUser={id:'guest_rollback',username:'游客',guest:true,expires:2000000};
  s.db.prepare('INSERT INTO world_guests(id,token,expires) VALUES(?,?,?)').run(guestUser.id,'token',guestUser.expires);
  const guest=s.world.join(guestUser,{classId:'knight'}),account={id:'a',username:'正式玩家'};
  s.db.exec('BEGIN');s.world.transferGuest(guestUser.id,account);s.db.exec('ROLLBACK');
  assert.equal(s.world.action(guestUser.id,{clientId:guest.clientId,type:'save'}).me.classId,'knight');
  assert.equal(s.world.summary('a').character,null);
  s.join();
  assert.throws(()=>s.world.transferGuest(guestUser.id,account),/已有角色/);
  assert.equal(s.world.summary(guestUser.id,true).character.classId,'knight');
  s.db.exec('BEGIN');const transferred=s.world.transferGuest(guestUser.id,{id:'b',username:'新玩家'});s.db.exec('COMMIT');s.world.finishGuestTransfer(transferred);
  assert.throws(()=>s.world.transferGuest(guestUser.id,account),/已迁移/);
});

function setup(t, fixtures={}) {
  const db=new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON; CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT);');
  for(const id of ['a','b'])db.prepare('INSERT INTO users VALUES(?,?)').run(id,id);
  let time=1000000;
  let world=createWorld(db,()=>time);
  for(const [id,changes] of Object.entries(fixtures)) {
    const data={name:id,classId:'ranger',x:410,y:790,level:1,xp:0,hp:100,gold:30,potions:3,weapon:0,crystals:0,kills:0,gathered:0,bossKills:0,quest:0,deaths:0,...changes};
    db.prepare('INSERT INTO world_characters VALUES(?,?,?)').run(id,JSON.stringify(data),time);
  }
  t.after(()=>db.close());
  const join=(id='a',classId='ranger')=>world.join({id,username:id},{classId});
  const action=(client,type,extra={},id='a')=>world.action(id,{clientId:client.clientId,type,...extra});
  const advance=ms=>{for(let n=0;n<ms;n+=50){time+=50;world.tick();}};
  return {db,get world(){return world;},join,action,advance,restart(){world.close();world=createWorld(db,()=>time);}};
}

test('账号隔离、职业校验、重新进入会使旧窗口失效',t=>{
  const s=setup(t);
  assert.throws(()=>s.join('a','__proto__'),/请选择/);
  const a=s.join(), b=s.join('b','mage');
  assert.equal(s.action(a,'input',{dx:0,dy:0}).players.length,2);
  assert.throws(()=>s.action(a,'save',{},'b'),/另一窗口/);
  const again=s.join('a','knight');
  assert.equal(again.me.classId,'ranger');
  assert.throws(()=>s.action(a,'save'),/另一窗口/);
  assert.equal(b.me.classId,'mage');
});
test('移动由服务端时钟驱动，拒绝超速输入，断流停止，遇障碍停止',t=>{
  const s=setup(t,{a:{x:810,y:260}}),a=s.join();
  assert.throws(()=>s.action(a,'input',{dx:100,dy:0}),/移动方向/);
  assert.throws(()=>s.action(a,'input',{dx:NaN,dy:0}),/移动方向/);
  s.action(a,'input',{dx:1,dy:0,x:2000,gold:9999});
  s.advance(500);
  let p=s.action(a,'input',{dx:0,dy:0}).me;
  assert.ok(p.x<844);assert.equal(p.gold,30);
  s.action(a,'input',{dx:0,dy:1});s.advance(2000);
  p=s.action(a,'input',{dx:0,dy:0}).me;
  assert.ok(p.y<400,'输入过期后停止移动');
});
test('两名玩家共享怪物血量，协作奖励只发一次，冷却和距离由服务端校验',t=>{
  const s=setup(t,{a:{x:650,y:690},b:{x:650,y:695}}),a=s.join(),b=s.join('b');
  const first=s.action(a,'attack',{target:'m0'});
  assert.equal(first.monsters.find(m=>m.id==='m0').hp,42);
  assert.throws(()=>s.action(a,'attack',{target:'m0'}),/冷却/);
  const second=s.action(b,'attack',{target:'m0'},'b');
  assert.equal(second.monsters.find(m=>m.id==='m0').hp,24);
  s.advance(700);s.action(a,'skill',{target:'m0'});
  assert.equal(s.world.summary('a').character.kills,1);
  assert.equal(s.world.summary('b').character.kills,1);
  assert.equal(s.world.summary('a').character.gold,42);
  s.advance(700);
  assert.throws(()=>s.action(a,'attack',{target:'m0'}),/超出攻击距离/);
  assert.throws(()=>s.action(a,'attack',{target:'boss'}),/超出攻击距离/);
  s.advance(16000);
  const respawn=s.join();
  assert.equal(respawn.monsters.find(m=>m.id==='m0').hp,60);
});
test('共享采集点只能被采集一次；获得经验、物品并持久化',t=>{
  const s=setup(t,{a:{x:630,y:780},b:{x:630,y:790}}),a=s.join(),b=s.join('b');
  const r=s.action(a,'gather',{target:'c1'});
  assert.equal(r.me.crystals,1);assert.equal(r.me.xp,15);
  assert.throws(()=>s.action(b,'gather',{target:'c1'},'b'),/可采集/);
  assert.equal(JSON.parse(s.db.prepare('SELECT data FROM world_characters WHERE user_id=?').get('a').data).crystals,1);
});
test('任务交付、升级、购买和强化可存档，客户端不能直接写等级金币',t=>{
  const s=setup(t,{a:{x:420,y:730,kills:5,gathered:4}}),a=s.join();
  let r=s.action(a,'quest');assert.equal(r.me.quest,1);assert.equal(r.me.level,2);
  r=s.action(a,'quest');assert.equal(r.me.quest,2);assert.equal(r.me.level,3);
  assert.throws(()=>s.action(a,'quest'),/任务尚未完成/);
  r=s.action(a,'upgrade');assert.equal(r.me.weapon,1);
  r=s.action(a,'buy');assert.equal(r.me.potions,4);
  r=s.action(a,'save',{gold:99999,level:99});assert.equal(r.me.gold,175);assert.equal(r.me.level,3);
  s.restart();const resumed=s.join();
  assert.equal(resumed.me.weapon,1);assert.equal(resumed.me.quest,2);assert.equal(resumed.me.potions,4);
});
test('在营地外不能交任务或补给，低等级不能挑战 Boss',t=>{
  const s=setup(t,{a:{x:2110,y:800,kills:5}}),a=s.join();
  for(const type of ['quest','buy','upgrade','rest'])assert.throws(()=>s.action(a,type),/营地/);
  assert.throws(()=>s.action(a,'attack',{target:'boss'}),/3 级/);
});
test('怪物伤害、复苏、药水和营地恢复',t=>{
  const s=setup(t,{a:{x:730,y:700,hp:1}}),a=s.join();
  s.advance(100);
  let r=s.action(a,'input',{dx:0,dy:0});assert.equal(r.me.deaths,1);assert.equal(r.me.x,410);assert.equal(r.me.hp,maxHp(r.me));
  assert.throws(()=>s.action(a,'potion'),/已满/);
  const damaged=setup(t,{a:{hp:20,x:420,y:730}}),c=damaged.join();
  r=damaged.action(c,'potion');assert.equal(r.me.hp,85);assert.equal(r.me.potions,2);
  assert.throws(()=>damaged.action(c,'potion'),/冷却/);
  r=damaged.action(c,'rest');assert.equal(r.me.hp,100);
});
test('定时保存、掉线后离场、聊天校验及退出存档',t=>{
  const s=setup(t),a=s.join();
  s.action(a,'input',{dx:1,dy:0});s.advance(5500);
  const saved=JSON.parse(s.db.prepare('SELECT data FROM world_characters WHERE user_id=?').get('a').data);
  assert.ok(saved.x>410);
  const r=s.action(a,'chat',{text:'你好，旅人'});assert.equal(r.chat[0].text,'你好，旅人');
  assert.throws(()=>s.action(a,'chat',{text:'太快'}),/发送太快/);
  s.advance(1500);assert.throws(()=>s.action(a,'chat',{text:'x'.repeat(121)}),/120/);
  s.action(a,'leave');assert.equal(s.world.summary('a').online,0);
  const back=s.join();assert.ok(back.me.x>410);s.advance(15100);assert.equal(s.world.summary('a').online,0);
  assert.throws(()=>s.action(back,'save'),/连接已结束/);
});

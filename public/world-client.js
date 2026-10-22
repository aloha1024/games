import { WORLD, CLASSES, NPC, NODES, OBSTACLES, QUESTS, xpNeeded, distance } from "./world-rules.js";

const escape = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
export function mountWorld(root, { currentUser, openAuth, refresh }) {
  let disposed=false, state=null, clientId=null, movingTo=null, selected=null, frameId, timer,
    inflight=false, lastFrame=performance.now(), camera={x:WORLD.spawn.x,y:WORLD.spawn.y},
    choice="ranger", ready=false, stopped=false, lastChat="", lastPanel="", cooldowns={},
    panel="quest", width=900, height=620, lastNotice=0, netFailed=false, controlsEnabled=false,
    queuedAction=null, effects=[];
  const keys=new Set(), held=new Set(), listeners=new AbortController();
  root.innerHTML=`<div class="world-page"><div class="world-heading"><div><a href="#">← 返回游戏大厅</a><h1>星野纪元 <span>STARFALL ONLINE</span></h1><p>在星光坠落的地方，开启你的冒险。</p></div><div class="world-server"><i></i><span id="world-connection">微光森林 · 共享世界</span><small>小规模多人 RPG · v0.1</small></div></div>
    <div class="world-layout"><section class="world-stage" aria-label="微光森林游戏区域">
    <canvas id="world-canvas" tabindex="0" aria-label="游戏地图。WASD 或方向键移动，空格攻击，Q 技能，E 采集，R 喝药。"></canvas>
    <div class="world-location"><span>✧</span><div><strong id="world-area">微光森林</strong><small id="world-coordinates">STARFALL VALLEY / 01</small></div></div>
    <div id="world-vitals" class="world-vitals" hidden></div><canvas id="world-minimap" width="170" height="112" aria-label="世界小地图"></canvas>
    <div class="world-message" id="world-message" role="status" aria-live="polite">欢迎来到微光森林。你的冒险，将被世界记住。</div>
    <div id="world-entry" class="world-entry"><span class="world-kicker">A NEW JOURNEY AWAITS</span><h2>群星落下，<br>故事从你开始。</h2><p>探索森林、结识旅人、挑战古树守卫。<br>选择职业，建立属于你的永久角色。</p><div class="world-classes">${Object.entries(CLASSES).map(([id,c])=>`<button data-class="${id}" class="${id===choice?'chosen':''}" aria-pressed="${id===choice}"><b>${id==='ranger'?'➶':id==='knight'?'⚔':'✦'}</b>${c.name}<small>${id==='ranger'?'灵活 · 远程':id==='knight'?'坚韧 · 近战':'奥术 · 爆发'}</small></button>`).join('')}</div><button id="world-enter" class="world-primary" disabled>正在读取角色…</button><small id="world-entry-hint">账号自动存档 · 无需下载</small></div>
    <div class="world-mobile" id="world-mobile" hidden><button data-move="up" aria-label="向上">↑</button><div><button data-move="left" aria-label="向左">←</button><button data-move="down" aria-label="向下">↓</button><button data-move="right" aria-label="向右">→</button></div></div>
    <div class="world-actions" id="world-actions" hidden><button data-action="attack"><b>⚔</b><span>攻击</span><kbd>SPACE</kbd></button><button data-action="skill"><b>✦</b><span id="world-skill-label">星辉爆发</span><kbd>Q</kbd></button><button data-action="gather"><b>◇</b><span>采集</span><kbd>E</kbd></button><button data-action="potion"><b>♜</b><span id="world-potions">药水</span><kbd>R</kbd></button><button data-action="camp"><b>⌂</b><span>走回营地</span><kbd>C</kbd></button></div>
    </section><aside class="world-sidebar"><div class="world-side-title"><span>冒险手册</span><small>EXPLORER'S JOURNAL</small></div><div class="world-tabs" role="tablist" aria-label="冒险手册"><button role="tab" aria-selected="true" data-panel="quest">任务</button><button role="tab" aria-selected="false" data-panel="bag">背包</button><button role="tab" aria-selected="false" data-panel="chat">世界</button></div><div id="world-panel" class="world-panel"></div><div id="world-chat" hidden><div id="world-chat-log" role="log" aria-live="polite"></div><form id="world-chat-form"><input id="world-chat-input" maxlength="120" placeholder="向世界问好…" aria-label="世界聊天消息" required><button aria-label="发送消息">↗</button></form></div><div class="world-save"><span id="world-save-status">登录后启用账号存档</span><button id="world-save" disabled>立即存档 ↥</button></div></aside></div><div class="world-help"><span><kbd>W A S D</kbd> / 方向键移动 · 点击地面前往 · 点击怪物锁定</span><span>近身采集结晶 · 在营地补给和交付任务 · 同服玩家实时可见</span></div></div>`;
  const $=s=>root.querySelector(s), canvas=$("#world-canvas"), ctx=canvas.getContext("2d"), mini=$("#world-minimap"), mc=mini.getContext("2d");
  if (!currentUser) {
    const login = document.createElement('button');
    login.id = 'world-account-login'; login.className = 'world-secondary world-account-login';
    login.textContent = '登录 / 注册账号'; login.onclick = () => openAuth(refresh);
    $('#world-entry-hint').before(login);
    $('#world-entry p').innerHTML = '探索森林、结识旅人、挑战古树守卫。<br>选择职业，无需注册即可试玩。';
    $('#world-entry-hint').textContent = '游客进度保留 7 天 · 当前浏览器可继续';
    $('#world-save-status').textContent = '游客与账号均支持自动存档';
    const register = document.createElement('button');
    register.id = 'world-register-progress'; register.className = 'world-secondary';
    register.textContent = '注册账号，永久保留进度'; register.hidden = true;
    register.onclick = () => openAuth(refresh,true);
    $('.world-save').append(register);
  }
  const on=(target,type,fn,options={})=>target.addEventListener(type,fn,{...options,signal:listeners.signal});
  const message=text=>{if(disposed)return; $("#world-message").textContent=text; lastNotice=performance.now();};
  async function request(path,body) {
    const response=await fetch("/api/world/"+path,{method:body?"POST":"GET",headers:body?{"Content-Type":"application/json"}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(6000)});
    const data=await response.json();
    if(!response.ok) throw Object.assign(new Error(data.error||"连接失败"),{status:response.status});
    return data;
  }
  function accept(data) {
    if(disposed)return;
    state=data; netFailed=false;
    const register = $('#world-register-progress'); if(register)register.hidden=!data.guest;
    if(data.cooldowns) cooldowns=data.cooldowns;
    $("#world-connection").textContent=`微光森林 · ${data.online} 人在线`;
    if(data.notice) message(data.notice);
    $("#world-save-status").textContent=`${data.guest?'游客已存档':'已存档'} ${new Date(data.savedAt).toLocaleTimeString('zh-CN',{hour12:false})} · ${data.guest?'当前浏览器有效至 '+new Date(data.guestExpires).toLocaleDateString('zh-CN'):'每 5 秒自动保存'}`;
    $("#world-vitals").innerHTML=`<div class="world-avatar">${CLASSES[data.me.classId].name.slice(0,1)}</div><div><strong>${escape(data.me.name)} <small>Lv.${data.me.level}</small></strong><meter min="0" max="${data.me.maxHp}" value="${data.me.hp}" aria-label="生命值"></meter><span>${data.me.hp} / ${data.me.maxHp} HP</span><progress max="${xpNeeded(data.me.level)}" value="${data.me.xp}" aria-label="升级经验"></progress></div>`;
    $("#world-potions").textContent=`药水 ×${data.me.potions}`;
    drawPanel();
    const chatKey=JSON.stringify(data.chat);
    if(lastChat!==chatKey) {
      lastChat=chatKey; $("#world-chat-log").innerHTML=data.chat.length?data.chat.map(c=>`<p><strong>${escape(c.name)}</strong><span>${escape(c.text)}</span></p>`).join(''):'<p class="world-muted">森林很安静。成为第一个打招呼的人吧。</p>';
      $("#world-chat-log").scrollTop=$("#world-chat-log").scrollHeight;
    }
  }
  function failure(error) {
    if(disposed)return;
    if(error.status===401||error.status===409) {
      stopped=true; controlsEnabled=false; keys.clear(); held.clear();
      $("#world-connection").textContent="连接已结束";
      $("#world-entry").hidden=false;
      $("#world-entry h2").textContent="重新连接世界";
      $("#world-enter").textContent="重新进入"; $("#world-enter").disabled=false;
      $("#world-enter").onclick=refresh;
    } else if(!error.status||error.status>=500) {
      netFailed=true; $("#world-connection").textContent="连接中断 · 正在重试";
      $("#world-save-status").textContent="网络中断，尚未确认新的存档";
      keys.clear(); held.clear(); movingTo=null;
    }
    message(error.message.includes('timeout')?'连接超时，正在尝试恢复…':error.message);
  }
  async function act(type,target) {
    if(!clientId||stopped)return;
    if(inflight){queuedAction={type,target};return;}
    inflight=true;
    try { const data=await request("action",{clientId,type,target});
      if(type==='attack'||type==='skill'){
        const m=state?.monsters.find(m=>m.id===target);
        if(m)effects.push({x:m.x,y:m.y,fromX:state.me.x,fromY:state.me.y,at:performance.now(),skill:type==='skill'});
      }
      accept(data); if(type==='save')message(data.guest?'游客存档已保存，在有效期内用当前浏览器可继续冒险。':'角色存档已写入服务器，下次登录可继续冒险。'); }
    catch(error){failure(error);} finally { inflight=false; }
  }
  function drawPanel() {
    const p=state?.me, q=QUESTS[p?.quest||0];
    const panelKey=JSON.stringify([panel,p&&[p.level,p.xp,p.gold,p.weapon,p.potions,p.crystals,p.kills,p.gathered,p.bossKills,p.quest],p&&distance(p,NPC)<160]);
    if(panelKey===lastPanel)return; lastPanel=panelKey;
    $("#world-panel").hidden=panel==='chat'; $("#world-chat").hidden=panel!=='chat';
    if(panel==='quest') $("#world-panel").innerHTML=`<div class="world-chapter">CHAPTER ${String((p?.quest||0)+1).padStart(2,'0')} <span>主线任务</span></div><div class="world-quest-symbol">${q?'✧':'✺'}</div><h3>${q?.name||'森林的守护者'}</h3><p>${q?.text||'你已完成全部主线。继续探索、帮助伙伴，强化你的装备。'}</p>${q?`<div class="world-progress"><span>${Math.min(p?.[q.key]||0,q.goal)} / ${q.goal}</span><progress max="${q.goal}" value="${p?.[q.key]||0}"></progress></div><div class="world-reward"><span>◈ ${q.gold} 金币</span><span>✧ ${q.xp} 经验</span></div><button data-task="quest" class="world-primary" ${!p||p[q.key]<q.goal||distance(p,NPC)>160?'disabled':''}>${p&&p[q.key]>=q.goal?'返回营地领取奖励':'探索并完成任务'}</button>`:''}<div class="world-divider"></div><div class="world-npc"><span>⌂</span><div><strong>守林人 · 艾拉</strong><small>星辉营地 / 安全区域</small></div></div><p class="world-muted">“森林深处的古树正在苏醒。先收集力量，再去寻找答案。”</p><button data-task="rest" class="world-secondary" ${!p||distance(p,NPC)>160?'disabled':''}>营地休息 · 免费恢复生命</button><p class="world-tip">${p?'结晶与怪物会定时重生。多人参与战斗可共同获得击杀奖励。':'选择职业后可直接游客试玩，进度将自动保存。'}</p>`;
    if(panel==='bag') $("#world-panel").innerHTML=`<div class="world-chapter">YOUR INVENTORY <span>角色背包</span></div><h3>旅人的行囊</h3><div class="world-wallet">◈ <b>${p?.gold||0}</b><span>金币</span></div><div class="world-item"><b>⚔</b><div><strong>星辉武器 +${p?.weapon||0}</strong><small>强化攻击 +${(p?.weapon||0)*6} · 上限 +10</small></div></div><div class="world-item"><b>♜</b><div><strong>恢复药水 ×${p?.potions||0}</strong><small>恢复 65 点生命值</small></div></div><div class="world-item"><b>◇</b><div><strong>星辉结晶 ×${p?.crystals||0}</strong><small>探索所得的收藏素材</small></div></div><div class="world-divider"></div><h4>营地工坊</h4><p class="world-muted">靠近艾拉可购买补给、强化武器。</p><button data-task="upgrade" class="world-secondary" ${!p||distance(p,NPC)>160?'disabled':''}>强化武器 · ${50*((p?.weapon||0)+1)} 金币</button><button data-task="buy" class="world-secondary" ${!p||distance(p,NPC)>160?'disabled':''}>购买药水 · 15 金币</button>`;
    $("#world-panel").querySelectorAll('[data-task]').forEach(b=>b.onclick=()=>act(b.dataset.task));
  }
  function direction() {
    let dx=Number(keys.has('d')||keys.has('arrowright')||held.has('right'))-Number(keys.has('a')||keys.has('arrowleft')||held.has('left'));
    let dy=Number(keys.has('s')||keys.has('arrowdown')||held.has('down'))-Number(keys.has('w')||keys.has('arrowup')||held.has('up'));
    if(dx||dy)movingTo=null;
    if(!dx&&!dy&&movingTo&&state){const d=distance(state.me,movingTo); if(d<20)movingTo=null;else {dx=(movingTo.x-state.me.x)/d;dy=(movingTo.y-state.me.y)/d;}}
    return {dx,dy};
  }
  function perform(type) {
    if(!state||!controlsEnabled)return;
    if(type==='camp'){movingTo={x:NPC.x,y:NPC.y+80};message('正在走回营地；遇到水域或岩石时请绕行。');return;}
    if(type==='gather') {
      const node=state.nodes.filter(n=>n.readyAt<=state.time).sort((a,b)=>distance(a,state.me)-distance(b,state.me))[0];
      act(type,node?.id);return;
    }
    if(type==='attack'||type==='skill'){
      let m=state.monsters.find(m=>m.id===selected&&m.hp>0);
      if(!m)m=state.monsters.filter(m=>m.hp>0).sort((a,b)=>distance(a,state.me)-distance(b,state.me))[0];
      selected=m?.id;act(type,selected);return;
    }
    act(type);
  }
  async function join() {
    $("#world-enter").disabled=true;
    const login = $('#world-account-login'); if (login) login.disabled=true;
    try {
      const data=await request(currentUser?'join':'guest',{classId:choice}); clientId=data.clientId;
      if(disposed){leave();return;}
      accept(data); ready=true; controlsEnabled=true; camera={x:data.me.x,y:data.me.y};
      $("#world-entry").hidden=true;
      for(const id of ['world-vitals','world-actions','world-mobile'])$('#'+id).hidden=false;
      $("#world-save").disabled=false;
      message(data.guest?'已以游客身份进入世界。WASD 移动，空格攻击，E 采集。':'欢迎回来，旅人。WASD 移动，空格攻击，E 采集。');canvas.focus({preventScroll:true});
      timer=setInterval(async()=>{
        if(disposed||stopped||inflight)return; inflight=true;
        if(queuedAction){const action=queuedAction;queuedAction=null;inflight=false;act(action.type,action.target);return;}
        try{accept(await request('action',{clientId,type:'input',...direction()}));}catch(error){failure(error);}finally{inflight=false;}
      },160);
    } catch(error){failure(error);if(!disposed)$("#world-enter").disabled=false;}
    finally { if(login)login.disabled=false; }
  }
  async function initialize(){
    drawPanel();
    try{
      const data=await request('character');if(disposed)return;
      if(data.character){choice=data.character.classId;$("#world-entry h2").textContent=`欢迎回来，${data.character.name}`;$("#world-entry p").textContent=`${CLASSES[choice].name} · 等级 ${data.character.level} · ${data.character.gold} 金币`;$('.world-classes').hidden=true;$("#world-entry-hint").textContent=`上次存档：${new Date(data.savedAt).toLocaleString('zh-CN')}`;}
      if(data.guest)$('#world-entry-hint').textContent='游客进度保留 7 天。用当前浏览器注册即可转入账号；登录已有账号不会覆盖其角色。';
      $('#world-enter').textContent=data.guest?'继续游客试玩 →':data.character?'继续冒险 →':'创建角色，进入世界 →';$('#world-enter').disabled=false;$('#world-enter').onclick=join;
    }catch(error){
      if(disposed)return;
      if(error.status===401&&!currentUser){
        $('#world-enter').textContent='游客试玩，立即进入 →';$('#world-enter').disabled=false;$('#world-enter').onclick=join;
        $('#world-entry-hint').textContent='游客进度保留 7 天。用当前浏览器注册即可转入账号；清除 Cookie 或换浏览器将无法找回游客身份。';
      }else{message(error.message);$('#world-enter').textContent='读取失败，点击重试';$('#world-enter').disabled=false;$('#world-enter').onclick=refresh;}
    }
  }
  root.querySelectorAll('[data-class]').forEach(b=>on(b,'click',()=>{choice=b.dataset.class;root.querySelectorAll('[data-class]').forEach(n=>{n.classList.toggle('chosen',n===b);n.setAttribute('aria-pressed',String(n===b));});}));
  root.querySelectorAll('[data-panel]').forEach(b=>on(b,'click',()=>{panel=b.dataset.panel;root.querySelectorAll('[data-panel]').forEach(n=>n.setAttribute('aria-selected',String(n===b)));drawPanel();}));
  root.querySelectorAll('[data-action]').forEach(b=>on(b,'click',()=>{perform(b.dataset.action);canvas.focus({preventScroll:true});}));
  root.querySelectorAll('[data-move]').forEach(b=>{
    on(b,'pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);held.add(b.dataset.move);movingTo=null;});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])on(b,event,()=>held.delete(b.dataset.move));
  });
  on($('#world-save'),'click',()=>act('save'));
  on($('#world-chat-form'),'submit',async e=>{
    e.preventDefault();if(!clientId||inflight||stopped){message('请先进入世界，或稍后重试。');return;}
    const input=$('#world-chat-input'),text=input.value.trim();if(!text)return;inflight=true;
    try{accept(await request('action',{clientId,type:'chat',text}));input.value='';}catch(error){failure(error);}finally{inflight=false;}
  });
  on(window,'keydown',e=>{
    if(!controlsEnabled||e.target.closest('input,textarea,dialog'))return;
    const key=e.key.toLowerCase();
    if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' ','q','e','r','c'].includes(key)){
      e.preventDefault();keys.add(key);if(!e.repeat){const a={' ':'attack',q:'skill',e:'gather',r:'potion',c:'camp'}[key];if(a)perform(a);}
    }
  });
  on(window,'keyup',e=>keys.delete(e.key.toLowerCase()));
  const clearInput=()=>{keys.clear();held.clear();movingTo=null;};
  on(window,'blur',clearInput);on(document,'visibilitychange',()=>{if(document.hidden)clearInput();});
  on(canvas,'pointerdown',e=>{
    if(!controlsEnabled)return;canvas.focus({preventScroll:true});const r=canvas.getBoundingClientRect(),scale=getScale();
    const point={x:(e.clientX-r.left-width/2)/scale+camera.x,y:(e.clientY-r.top-height/2)/scale+camera.y};
    const monster=state.monsters.find(m=>m.hp>0&&distance(point,m)<36);
    if(monster){selected=monster.id;message(`已锁定 ${monster.name} · 靠近后按空格攻击`);}else movingTo=point;
  });
  const observer=new ResizeObserver(()=>{
    const r=canvas.getBoundingClientRect();width=r.width;height=r.height;
    const ratio=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);
  });observer.observe(canvas);
  function getScale(){return width<550?.70:width<850?.85:1;}
  function ellipse(x,y,rx,ry,color){ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();}
  function line(points,color,lineWidth=1){ctx.strokeStyle=color;ctx.lineWidth=lineWidth;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();}
  function label(text,x,y,color='#c8ddcf',size=12){ctx.font=`${size}px "Microsoft YaHei",sans-serif`;ctx.textAlign='center';ctx.fillStyle=color;ctx.fillText(text,x,y);}
  function tree(x,y,size=1,tint=0){
    ctx.save();ctx.translate(x,y);ctx.scale(size,size);ellipse(5,8,29,12,'#061f2480');ctx.fillStyle='#3c5147';ctx.fillRect(-4,-34,8,44);
    for(let n=0;n<3;n++){ctx.fillStyle=[['#214b48','#2a5b50','#356b59'],['#1c4144','#25514e','#2c6257']][tint][n];ctx.beginPath();ctx.moveTo(0,-105-n*4);ctx.lineTo(37-n*8,-20-n*22);ctx.lineTo(-37+n*8,-20-n*22);ctx.closePath();ctx.fill();}
    line([[0,-108],[0,-37]],'#85ba8b22',2);ctx.restore();
  }
  function avatar(p,self,t){
    const color=CLASSES[p.classId]?.color||'#92cbb7';ellipse(p.x,p.y+14,17,7,'#061e2890');
    if(self){ctx.strokeStyle='#c5e6b589';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(p.x,p.y+14,23,11,0,0,7);ctx.stroke();}
    const bob=Math.sin(t/260)*1.5;
    ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(p.x,p.y-12+bob);ctx.lineTo(p.x+13,p.y+10);ctx.lineTo(p.x-13,p.y+10);ctx.closePath();ctx.fill();
    ctx.fillStyle='#233642';ctx.fillRect(p.x-7,p.y+9,5,9);ctx.fillRect(p.x+3,p.y+9,5,9);
    ellipse(p.x,p.y-16+bob,9,10,'#edceab');ellipse(p.x,p.y-23+bob,10,5,color);
    if(p.classId==='mage'){line([[p.x+18,p.y+9],[p.x+18,p.y-24]],'#bca7f6',3);ellipse(p.x+18,p.y-29,4,6,'#d9bcff');}
    else if(p.classId==='ranger'){ctx.strokeStyle='#e8cc95';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x+10,p.y-3,15,-1.2,1.2);ctx.stroke();}
    else line([[p.x+18,p.y+7],[p.x+23,p.y-24]],'#e5e8ce',4);
    label(p.name+(self?' · 你':''),p.x,p.y-40,self?'#ecedc7':'#b9dbd0',11);
  }
  const trees=[];
  for(let i=0;i<290;i++){
    const x=(i*397+71)%WORLD.width,y=(i*719+47)%WORLD.height;
    if(distance({x,y},WORLD.spawn)<260||NODES.some(n=>distance({x,y},n)<75)||Math.abs(y-(780+Math.sin(x/260)*60))<90||distance({x,y},{x:2110,y:670})<200)continue;
    if(OBSTACLES.some(o=>x>o.x-30&&x<o.x+o.w+30&&y>o.y-30&&y<o.y+o.h+100))continue;
    trees.push({x,y,s:.65+(i%7)/12,t:i%2});
  }
  function draw(t){
    if(disposed)return;
    const dt=Math.min((t-lastFrame)/1000,.05);lastFrame=t;
    const me=state?.me||{...WORLD.spawn};
    const targetX=ready?me.x:700,targetY=ready?me.y:760;
    camera.x+=(targetX-camera.x)*Math.min(1,dt*9);camera.y+=(targetY-camera.y)*Math.min(1,dt*9);
    ctx.clearRect(0,0,width,height);ctx.fillStyle='#122d32';ctx.fillRect(0,0,width,height);
    ctx.save();ctx.translate(width/2,height/2);ctx.scale(getScale(),getScale());ctx.translate(-camera.x,-camera.y);
    ctx.fillStyle='#24463f';ctx.fillRect(0,0,WORLD.width,WORLD.height);
    for(let i=0;i<1100;i++){const x=(i*167)%2400,y=(i*283)%1600;ctx.fillStyle=i%3===0?'#799f5622':'#a1bb7e0e';ctx.fillRect(x,y,2+(i%3),2);}
    // Worn path from the camp to the ancient grove.
    const path=[];for(let x=230;x<2220;x+=30)path.push([x,780+Math.sin(x/260)*60]);
    ctx.lineJoin='round';ctx.lineCap='round';line(path,'#425343',88);line(path,'#59604866',52);
    for(const o of OBSTACLES){
      ctx.fillStyle='#183e49';ctx.beginPath();ctx.roundRect(o.x,o.y,o.w,o.h,45);ctx.fill();ctx.strokeStyle='#61998c55';ctx.lineWidth=5;ctx.stroke();
      for(let k=0;k<4;k++)line([[o.x+35,o.y+40+k*32],[o.x+o.w-35,o.y+40+k*32]],'#85b9ad22',2);
    }
    // Clearing, tent, campfire and keeper.
    ellipse(420,765,205,162,'#53614766');ellipse(420,765,190,148,'#73754b25');
    ctx.fillStyle='#233f3a';ctx.fillRect(250,650,120,70);ctx.fillStyle='#a2a77a';ctx.beginPath();ctx.moveTo(310,575);ctx.lineTo(382,660);ctx.lineTo(238,660);ctx.closePath();ctx.fill();
    ctx.fillStyle='#333f38';ctx.beginPath();ctx.moveTo(310,610);ctx.lineTo(337,690);ctx.lineTo(282,690);ctx.closePath();ctx.fill();line([[310,575],[310,610]],'#dfd4a5',2);
    ellipse(515,755,42,23,'#e1a25118');ellipse(515,755,20,10,'#223837');line([[501,758],[530,749]],'#9a7a55',6);
    ellipse(515,743,8+Math.sin(t/130)*2,16,'#e8a965');ellipse(515,743,4,9,'#fae6a3');
    avatar({...NPC,classId:'ranger',name:'艾拉'},false,t);label('◆',NPC.x,NPC.y-61,'#efd58f',20);label('星 辉 营 地',420,900,'#c0c79a',16);
    // Ancient ruins and boss arena.
    ellipse(2110,670,170,135,'#25373e');ctx.strokeStyle='#6b827344';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(2110,670,145,110,0,0,7);ctx.stroke();
    for(let i=0;i<8;i++){const a=i*Math.PI/4,x=2110+Math.cos(a)*165,y=670+Math.sin(a)*130;ctx.fillStyle='#69776b';ctx.fillRect(x-12,y-44,24,50);ctx.fillStyle='#93a18b';ctx.fillRect(x-14,y-48,28,7);}
    label('古 树 遗 迹 · Lv.3',2110,865,'#b6c2ac',15);
    for(const n of state?.nodes||NODES){
      const available=!n.readyAt||n.readyAt<=(state?.time||Date.now());ellipse(n.x,n.y+11,19,8,'#071f3680');
      if(available){ellipse(n.x,n.y,32,25,'#87d8d217');ctx.fillStyle='#9edbd4';ctx.beginPath();ctx.moveTo(n.x,n.y-25+Math.sin(t/600)*3);ctx.lineTo(n.x+10,n.y-5);ctx.lineTo(n.x,n.y+9);ctx.lineTo(n.x-9,n.y-5);ctx.closePath();ctx.fill();line([[n.x,n.y-21],[n.x,n.y+5]],'#d3f8dc',1);}
      else {ctx.fillStyle='#6a8476';ctx.fillRect(n.x-5,n.y+3,10,7);}
    }
    const entities=trees.map(tree=>({y:tree.y,draw:()=>drawTree(tree)}));
    function drawTree(o){tree(o.x,o.y,o.s,o.t);}
    for(const m of state?.monsters||[]) if(m.hp>0)entities.push({y:m.y,draw:()=>{
      const boss=m.id==='boss',r=boss?34:17;ellipse(m.x,m.y+16,r+5,12,'#0b252c88');
      if(selected===m.id){ctx.strokeStyle='#f1d28b';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(m.x,m.y+13,r+12,17,0,0,7);ctx.stroke();}
      ellipse(m.x,m.y-3+Math.sin(t/340)*3,r,r*(boss?1.4:.85),boss?'#706f50':m.id<'m4'?'#81a277':'#8998af');
      if(boss){line([[m.x-20,m.y-27],[m.x-46,m.y-60],[m.x-40,m.y-80]],'#7a8966',8);line([[m.x+20,m.y-27],[m.x+42,m.y-66],[m.x+58,m.y-75]],'#7a8966',8);}
      ellipse(m.x-6,m.y-7,2.5,3,'#eaf3a7');ellipse(m.x+7,m.y-7,2.5,3,'#eaf3a7');
      label(m.name,m.x,m.y-(boss?75:37),boss?'#eed6a0':'#c6d8c1',11);
      ctx.fillStyle='#152d32';ctx.fillRect(m.x-23,m.y-(boss?67:29),46,4);ctx.fillStyle=boss?'#d4b472':'#91bf96';ctx.fillRect(m.x-23,m.y-(boss?67:29),46*m.hp/m.maxHp,4);
    }});
    for(const p of state?.players||[])entities.push({y:p.y,draw:()=>avatar(p,p.id===state?.playerId,t)});
    entities.sort((a,b)=>a.y-b.y).forEach(e=>e.draw());
    effects=effects.filter(f=>t-f.at<420);
    for(const f of effects){const progress=(t-f.at)/420;ctx.globalAlpha=1-progress;line([[f.fromX,f.fromY-12],[f.x,f.y-12]],'#e0e9af',f.skill?4:2);ctx.strokeStyle=f.skill?'#d4b8ef':'#e6eec2';ctx.lineWidth=3;ctx.beginPath();ctx.arc(f.x,f.y-8,(f.skill?115:28)*progress+8,0,7);ctx.stroke();ctx.globalAlpha=1;}
    if(movingTo){ctx.strokeStyle='#d6dcb788';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(movingTo.x,movingTo.y,12,6,0,0,7);ctx.stroke();}
    for(let i=0;i<40;i++){const x=(i*397+Math.sin(t/2300+i)*18)%2400,y=(i*227+t/200)%1600;ellipse(x,y,1.8,1.8,`rgba(208,229,156,${.25+Math.sin(t/700+i)*.2})`);}
    ctx.restore();
    const vignette=ctx.createRadialGradient(width/2,height/2,100,width/2,height/2,Math.max(width,height)*.65);vignette.addColorStop(0,'#071c2200');vignette.addColorStop(1,'#071c2288');ctx.fillStyle=vignette;ctx.fillRect(0,0,width,height);
    mc.fillStyle='#183633';mc.fillRect(0,0,170,112);mc.fillStyle='#395648';for(const o of OBSTACLES)mc.fillRect(o.x/2400*170,o.y/1600*112,o.w/2400*170,o.h/1600*112);
    mc.strokeStyle='#9eaa7055';mc.beginPath();mc.moveTo(22,55);mc.lineTo(149,48);mc.stroke();
    mc.fillStyle='#d7c98c';mc.fillRect(27,50,5,5);mc.fillStyle='#d7a589';mc.fillRect(147,45,5,5);
    for(const p of state?.players||[]){mc.fillStyle=p.id===state?.playerId?'#e6f5b3':'#8bc5d4';mc.beginPath();mc.arc(p.x/2400*170,p.y/1600*112,3,0,7);mc.fill();}
    if(ready){$('#world-area').textContent=me.x>1830?'古树遗迹':me.x<650?'星辉营地':'微光森林';$('#world-coordinates').textContent=`${Math.round(me.x)} , ${Math.round(me.y)} · ${netFailed?'离线重连中':'共享世界'}`;
      const remain=Math.max(0,Math.ceil(((cooldowns.skill||0)-(state.time+(t-lastFrame)))/1000));$('#world-skill-label').textContent=remain?`冷却 ${remain}s`:'星辉爆发';
      if(t-lastNotice>12000)$('#world-message').textContent='WASD 移动 · 空格攻击 · Q 范围技能 · E 采集 · R 药水';
    }
    frameId=requestAnimationFrame(draw);
  }
  function leave(){if(!clientId)return;fetch('/api/world/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientId,type:'leave'}),keepalive:true}).catch(()=>{});clientId=null;}
  on(window,'pagehide',leave);
  initialize();frameId=requestAnimationFrame(draw);
  return ()=>{disposed=true;clearInterval(timer);cancelAnimationFrame(frameId);observer.disconnect();listeners.abort();leave();};
}

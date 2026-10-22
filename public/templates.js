export const gamePolicy =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'";
export function gameDocument(game) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${gamePolicy}"><style>html,body{margin:0;min-height:100%;box-sizing:border-box}*{box-sizing:border-box}${game.css}</style></head><body>${game.html}<script>${game.js.replace(/<\/script/gi, "<\\/script")}<\/script></body></html>`;
}
const css = `body{background:#17142d;color:#fff;font-family:system-ui,sans-serif;text-align:center;padding:24px}h1{font-size:28px;margin:10px}p{color:#bdb7db;font-size:14px}button{border:0;border-radius:12px;background:#c4f16d;color:#19230c;padding:12px 24px;font-weight:700;cursor:pointer;font-size:15px}#score{font-size:28px;color:#c4f16d;margin:14px}canvas{display:block;margin:18px auto;max-width:100%;border-radius:14px;background:#221d3b;touch-action:none}.controls{display:flex;gap:8px;justify-content:center;margin:12px}.controls button{padding:12px 18px}#board{display:grid;gap:10px;max-width:340px;margin:24px auto}.tile{height:70px;font-size:28px;background:#383050;color:white}.tile.done{background:#8b6ce8}.hint{min-height:22px}`;
const snake = {
  html: `<h1>像素贪吃蛇</h1><p>方向键 / WASD 或下方按钮控制，吃到星星就能长大</p><div id="score">得分 0</div><canvas id="canvas" width="360" height="360"></canvas><button id="start">开始游戏</button><div class="controls"><button data-dir="0,-1">↑</button><button data-dir="-1,0">←</button><button data-dir="0,1">↓</button><button data-dir="1,0">→</button></div><p id="hint" class="hint">准备好迎接挑战了吗？</p>`,
  css,
  js: `const c=document.querySelector('canvas'),ctx=c.getContext('2d');let snake,dir,next,food,score,timer;function spawn(){do{food=[Math.floor(Math.random()*18),Math.floor(Math.random()*18)]}while(snake.some(p=>p[0]===food[0]&&p[1]===food[1]))}function draw(){ctx.clearRect(0,0,360,360);ctx.strokeStyle='#302847';for(let i=0;i<18;i++){ctx.beginPath();ctx.moveTo(i*20,0);ctx.lineTo(i*20,360);ctx.stroke();ctx.beginPath();ctx.moveTo(0,i*20);ctx.lineTo(360,i*20);ctx.stroke()}ctx.fillStyle='#ffba70';ctx.beginPath();ctx.arc(food[0]*20+10,food[1]*20+10,7,0,Math.PI*2);ctx.fill();snake.forEach((p,i)=>{ctx.fillStyle=i?'#8bbf50':'#c4f16d';ctx.fillRect(p[0]*20+2,p[1]*20+2,16,16)})}function reset(){clearInterval(timer);snake=[[8,9],[7,9],[6,9]];dir=[1,0];next=dir;score=0;spawn();draw();document.querySelector('#score').textContent='得分 0'}function turn(d){if(d[0]!==-dir[0]||d[1]!==-dir[1])next=d}document.onkeydown=e=>{const d={ArrowUp:[0,-1],w:[0,-1],ArrowDown:[0,1],s:[0,1],ArrowLeft:[-1,0],a:[-1,0],ArrowRight:[1,0],d:[1,0]}[e.key];if(d){e.preventDefault();turn(d)}};document.querySelectorAll('[data-dir]').forEach(b=>b.onclick=()=>turn(b.dataset.dir.split(',').map(Number)));document.querySelector('#start').onclick=()=>{reset();document.querySelector('#hint').textContent='出发！';timer=setInterval(()=>{dir=next;const h=[snake[0][0]+dir[0],snake[0][1]+dir[1]],eat=h[0]===food[0]&&h[1]===food[1],body=eat?snake:snake.slice(0,-1);if(h.some(v=>v<0||v>17)||body.some(p=>p[0]===h[0]&&p[1]===h[1])){clearInterval(timer);document.querySelector('#hint').textContent='游戏结束，点击开始再试一次';return}snake.unshift(h);if(eat){score+=10;document.querySelector('#score').textContent='得分 '+score;if(snake.length===324){clearInterval(timer);document.querySelector('#hint').textContent='恭喜通关！';return}spawn()}else snake.pop();draw()},140)};reset();`,
};
const memory = {
  html: `<h1>记忆翻翻乐</h1><p>翻开卡片，找到所有相同的图案</p><div id="score">步数 0</div><div id="board"></div><button id="start">重新开始</button><p id="hint" class="hint"></p>`,
  css: css + "#board{grid-template-columns:repeat(4,1fr)}",
  js: `let first=null,locked=false,steps=0,matches=0,round=0;function start(){round++;first=null;locked=false;steps=0;matches=0;document.querySelector('#score').textContent='步数 0';document.querySelector('#hint').textContent='找出 6 对图案';const values=['🍋','🍇','🍒','🥝','🍊','🍓'];const cards=[...values,...values];for(let i=cards.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[cards[i],cards[j]]=[cards[j],cards[i]]}const board=document.querySelector('#board');board.innerHTML='';cards.forEach(value=>{const b=document.createElement('button');b.className='tile';b.textContent='?';b.onclick=()=>{if(locked||b.disabled||first===b)return;b.textContent=value;if(!first){first=b;return}steps++;document.querySelector('#score').textContent='步数 '+steps;if(first.textContent===value){first.disabled=b.disabled=true;first.classList.add('done');b.classList.add('done');first=null;matches++;if(matches===6)document.querySelector('#hint').textContent='太棒了！你用 '+steps+' 步完成挑战'}else{locked=true;const previous=first,version=round;setTimeout(()=>{if(version!==round)return;previous.textContent=b.textContent='?';first=null;locked=false},650)}};board.append(b)})}document.querySelector('#start').onclick=start;start();`,
};
const stars = {
  html: `<h1>接住小星星</h1><p>左右移动鼠标、触摸拖动或使用方向键，在 30 秒内收集星星</p><div id="score">得分 0 · 剩余 30 秒</div><canvas width="420" height="360"></canvas><button id="start">开始游戏</button><p id="hint" class="hint">每一颗星星，都值得被接住</p>`,
  css,
  js: `const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d');let x=210,items=[],score=0,end=0,active=false,last=0,spawn=0,keys={};function move(e){const r=canvas.getBoundingClientRect();x=Math.max(25,Math.min(395,(e.clientX-r.left)*420/r.width))}canvas.onpointerdown=e=>{canvas.setPointerCapture(e.pointerId);move(e)};canvas.onpointermove=move;document.onkeydown=e=>{if(e.key.startsWith('Arrow'))e.preventDefault();keys[e.key]=true};document.onkeyup=e=>keys[e.key]=false;document.querySelector('#start').onclick=()=>{items=[];score=0;end=performance.now()+30000;active=true;document.querySelector('#hint').textContent='收集开始！'};function frame(t){const dt=Math.min((t-last)/1000,.05);last=t;ctx.clearRect(0,0,420,360);ctx.fillStyle='#70658b';for(let i=0;i<35;i++){ctx.beginPath();ctx.arc((i*67)%420,(i*41)%320,1.5,0,7);ctx.fill()}if(active){if(keys.ArrowLeft)x-=250*dt;if(keys.ArrowRight)x+=250*dt;x=Math.max(25,Math.min(395,x));spawn+=dt;if(spawn>.45){items.push({x:20+Math.random()*380,y:-15});spawn=0}items.forEach(s=>s.y+=130*dt);items=items.filter(s=>{if(s.y>305&&s.y<338&&Math.abs(s.x-x)<35){score+=10;return false}return s.y<380});const remain=Math.max(0,Math.ceil((end-t)/1000));document.querySelector('#score').textContent='得分 '+score+' · 剩余 '+remain+' 秒';if(!remain){active=false;document.querySelector('#hint').textContent='完成！你获得了 '+score+' 分，再来一局吧'}}ctx.font='26px serif';items.forEach(s=>ctx.fillText('⭐',s.x-13,s.y));ctx.fillStyle='#c4f16d';ctx.beginPath();ctx.roundRect(x-30,325,60,15,7);ctx.fill();requestAnimationFrame(frame)}requestAnimationFrame(frame);`,
};
export const templates = [
  {
    id: "snake",
    title: "像素贪吃蛇",
    description: "熟悉的像素，新的最高分。让小蛇开启一场无尽冒险。",
    category: "街机",
    cover: "snake",
    ...snake,
  },
  {
    id: "memory",
    title: "记忆翻翻乐",
    description: "把好记性变成超能力，翻开一份色彩缤纷的小惊喜。",
    category: "益智",
    cover: "memory",
    ...memory,
  },
  {
    id: "stars",
    title: "接住小星星",
    description: "把散落在宇宙里的星光，装进你的口袋。",
    category: "休闲",
    cover: "stars",
    ...stars,
  },
];

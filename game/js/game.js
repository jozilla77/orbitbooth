/* ============================================================
   Orbit Booth · Sky Hop  — kawaii flappy game
   Vanilla Canvas + a little DOM for menus/leaderboard.
   ============================================================ */
(() => {
'use strict';

// ---------- Canvas + high-DPI setup ----------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1, S = 1; // S = gameplay scale (H/800)

// Keep the canvas backing store within WebKit's GPU-memory budget. iOS Safari
// (and iOS Chrome, same engine) will kill and reload the tab mid-game when a
// full-screen high-DPI canvas + per-frame gradients/shadows exhaust it — which
// looks like a random "crash" after ~30s of play. Cap DPR at 2 and clamp the
// total device-pixel count as a hard safety net for large/landscape screens.
const MAX_BACKING_PIXELS = 2600000; // ~2.6 MP
function resize() {
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  if (W * H * DPR * DPR > MAX_BACKING_PIXELS) {
    DPR = Math.max(1, Math.sqrt(MAX_BACKING_PIXELS / (W * H)));
  }
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  S = H / 800;
  layoutWorld();
}
window.addEventListener('resize', resize);

// ---------- Assets ----------
const sprite = new Image();
sprite.src = 'assets/orbit_sprite.png';
const FRAME = 128, FRAMES = 3; // idle, flap, glide
let spriteReady = false;
sprite.onload = () => { spriteReady = true; };

// ---------- Utility ----------
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
function hash(n){ const x = Math.sin(n * 127.1 + 3.71) * 43758.5453; return x - Math.floor(x); }
const rrect = (c, x, y, w, h, r) => {
  r = Math.min(r, w/2, h/2);
  c.beginPath();
  c.moveTo(x+r, y);
  c.arcTo(x+w, y, x+w, y+h, r);
  c.arcTo(x+w, y+h, x, y+h, r);
  c.arcTo(x, y+h, x, y, r);
  c.arcTo(x, y, x+w, y, r);
  c.closePath();
};

// ============================================================
//  THEMES (8 distinct rounds; last = endless finale)
// ============================================================
const THEMES = [
  { // ROUND 1 — Bangkok Urban Jungle
    name:'Bangkok', sub:'Urban Jungle', terrain:'land',
    sky:['#7ec6ff','#bfe6ff','#fef0c8'],
    sun:'#fff4c2', sunGlow:'rgba(255,240,180,.55)',
    far:'#a9b6d6', farHaze:'rgba(255,255,255,.35)',
    mid:'#7bc46a', midDark:'#5aa84f',
    ground:['#8fd06a','#5faf4a'], road:'#b9b3ad',
    obstacle:'temple', obsBody:['#efe7d6','#cdbfa4'], obsGold:'#f6c445',
    petal:'#ffd6ea', clouds:'#ffffff', creatures:['bird'],
    spd:200, gap:250, spawn:300,
  },
  { // ROUND 2 — Phuket Beaches
    name:'Phuket', sub:'Island Beaches', terrain:'sea',
    sky:['#57c2ff','#9fe4ff','#eafcff'],
    sun:'#fff8d0', sunGlow:'rgba(255,250,200,.6)',
    far:'#8fd6c8', farHaze:'rgba(255,255,255,.4)',
    mid:'#25c7c0', midDark:'#12a6b4',
    ground:['#ffe6a8','#f4cd76'], road:'#37c6d8',
    obstacle:'palm', obsBody:['#c98d5a','#9c6538'], obsGold:'#4bcf7a',
    petal:'#bff4ff', clouds:'#ffffff', creatures:['bird','fish'],
    spd:222, gap:234, spawn:295,
  },
  { // ROUND 3 — Chiang Mai Mountains
    name:'Chiang Mai', sub:'Misty Mountains', terrain:'land',
    sky:['#dff3e6','#eafaf0','#fff6e6'],
    sun:'#fff1d6', sunGlow:'rgba(255,240,210,.5)',
    far:'#a7c6c0', farHaze:'rgba(255,255,255,.55)',
    mid:'#6fb98a', midDark:'#4f9a6e',
    ground:['#8ed49a','#5aa86e'], road:'#7fb98a',
    obstacle:'pagoda', obsBody:['#e6e2d6','#bfb8a6'], obsGold:'#f2c33f',
    petal:'#ffd0e6', clouds:'#f4f4ff', creatures:['bird'],
    spd:242, gap:222, spawn:290,
  },
  { // ROUND 4 — Koh Samui (dolphins, fish, birds)
    name:'Koh Samui', sub:'Dolphin Bay', terrain:'sea',
    sky:['#3fb8ff','#8fe0ff','#e9fbff'],
    sun:'#ffface', sunGlow:'rgba(255,250,190,.6)',
    far:'#7fd0c4', farHaze:'rgba(255,255,255,.4)',
    mid:'#1fc9cf', midDark:'#0fa3bd',
    ground:['#ffedb0','#f3ce74'], road:'#2fc3dd',
    obstacle:'coral', obsBody:['#ff9a76','#e56b52'], obsGold:'#ff7fb0',
    petal:'#c8f6ff', clouds:'#ffffff', creatures:['dolphin','fish','bird'],
    spd:256, gap:214, spawn:288,
  },
  { // ROUND 5 — Buriram (ancient temples & palace, elephants)
    name:'Buriram', sub:'Ancient Kingdom', terrain:'land',
    sky:['#ffd9a0','#ffe9c2','#fff3d8'],
    sun:'#ffe6b0', sunGlow:'rgba(255,220,160,.55)',
    far:'#c79a86', farHaze:'rgba(255,240,220,.5)',
    mid:'#9bb56a', midDark:'#7a9850',
    ground:['#cdae7a','#a9884f'], road:'#b39a6a',
    obstacle:'prang', obsBody:['#c98f66','#9c6a45'], obsGold:'#f0b840',
    petal:'#ffdca6', clouds:'#fff3e6', creatures:['elephant','bird'],
    spd:268, gap:210, spawn:286,
  },
  { // ROUND 6 — Krabi (limestone karst in the sea, monkeys)
    name:'Krabi', sub:'Limestone Sea', terrain:'sea',
    sky:['#63c9ff','#a6e6ff','#eafbf2'],
    sun:'#fff6cc', sunGlow:'rgba(255,250,200,.55)',
    far:'#8a9a86', farHaze:'rgba(255,255,255,.45)',
    mid:'#1ec5b8', midDark:'#0f9fa8',
    ground:['#f2dda0','#d8b86e'], road:'#2bc0c9',
    obstacle:'karst', obsBody:['#c9cdbd','#9aa08c'], obsGold:'#79c257',
    petal:'#cdf2ff', clouds:'#ffffff', creatures:['monkey','bird','fish'],
    spd:280, gap:206, spawn:284,
  },
  { // ROUND 7 — Chiang Rai (mountains, flower fields, wildlife)
    name:'Chiang Rai', sub:'Flower Highlands', terrain:'land',
    sky:['#cfeaff','#eaf7ff','#fff0f6'],
    sun:'#fff0e0', sunGlow:'rgba(255,235,220,.5)',
    far:'#9db9c9', farHaze:'rgba(255,255,255,.55)',
    mid:'#69b878', midDark:'#4c9a5e',
    ground:['#83cf7e','#57a457'], road:'#6fb082',
    obstacle:'whitetemple', obsBody:['#f4f6ff','#d5dcf0'], obsGold:'#dfe6ff',
    petal:'#ffd7ec', clouds:'#f6f7ff', creatures:['deer','bird'], flowers:true,
    spd:292, gap:200, spawn:282,
  },
  { // ROUND 8 — Futuristic Bangkok (flying cars, robots, trains) — endless, 2x speed
    name:'Neo Bangkok', sub:'Year 3000 · 2× SPEED', terrain:'city',
    sky:['#241a4e','#5b2d82','#ff7fb0'],
    sun:'#ffd0f0', sunGlow:'rgba(255,150,230,.45)',
    far:'#3a2f66', farHaze:'rgba(60,40,110,.45)',
    mid:'#2a2352', midDark:'#191238',
    ground:['#2c2a55','#171436'], road:'#00e5ff',
    obstacle:'tech', obsBody:['#4a4a7a','#26264a'], obsGold:'#00e5ff',
    petal:'#7fe8ff', clouds:'#6a5aa8', creatures:['flycar','robot','flytrain'],
    spd:400, gap:224, spawn:430, neon:true,
  },
];

// ============================================================
//  GAME STATE
// ============================================================
const ST = { LOADING:'loading', MENU:'menu', READY:'ready', PLAY:'play', OVER:'over' };
let state = ST.LOADING;

const game = {
  score:0, best:0, round:0, // round index 0..THEMES.length-1
  speed:0, gapH:0, spawnGap:0,
  distToNext:0,
  scrollFar:0, scrollMid:0, scrollGround:0, cloudX:0,
  t:0,
};
// score thresholds to advance into each next round (one per gap between the 8 stages)
const ROUND_UP = THEMES.slice(1).map((_, i) => (i + 1) * 10); // [10,20,30,40,50,60,70]
const LAST_ROUND = THEMES.length - 1;

const pipes = [];
const petals = [];
const puffs = [];
const decor = [];       // themed wildlife / vehicles
let decorTimer = 0;

// player
const P = { x:0, y:0, vy:0, size:0, r:0, frame:0, flapT:0, dead:false, tilt:0 };

// world layout (depends on size)
let GROUND_Y = 0, GROUND_H = 0;
function layoutWorld() {
  GROUND_H = 96 * S;
  GROUND_Y = H - GROUND_H;
  P.size = 70 * S;
  P.r = P.size * 0.30;
  P.x = W * 0.30;
}

// ---------- tunables per round (read from the theme) ----------
function applyRound(idx) {
  game.round = idx;
  const th = THEMES[idx];
  game.speed    = th.spd  * S;
  game.gapH     = th.gap  * S;
  game.spawnGap = th.spawn * S;
  decor.length = 0; decorTimer = 0; // fresh wildlife per stage
}

// ============================================================
//  FLOW
// ============================================================
function startGame() {
  hideAll();
  pipes.length = 0; petals.length = 0; puffs.length = 0;
  game.score = 0; game.t = 0;
  game.scrollFar = game.scrollMid = game.scrollGround = game.cloudX = 0;
  newPlayToken();            // mint a fresh, server-timed anti-cheat token for this run
  applyRound(0);
  game.distToNext = W * 0.6;
  P.y = H * 0.42; P.vy = 0; P.dead = false; P.tilt = 0; P.frame = 0; P.flapT = 0;
  setHUD();
  hud.classList.remove('hidden');
  state = ST.READY;
  startMusic();
  showBanner(0);
  clearTimeout(hintTimer);
  hintTimer = setTimeout(()=>{ if (state===ST.READY) $('#readyHint').classList.remove('hidden'); }, 1300);
}

function beginPlay() {
  if (state !== ST.READY) return;
  state = ST.PLAY;
  $('#readyHint').classList.add('hidden');
  flap();
}

function flap() {
  if (P.dead) return;
  P.vy = -560 * S;
  P.flapT = 0.18;
  for (let i=0;i<4;i++) puffs.push({ x:P.x-P.size*0.35, y:P.y+P.size*0.1, vx:rand(-30,-90)*S, vy:rand(-20,20)*S, r:rand(4,9)*S, life:0.5 });
  sfx('flap');
}

function die() {
  if (P.dead) return;
  P.dead = true;
  sfx('hit');
  shake = 14;
  setTimeout(gameOver, 620);
}

function gameOver() {
  state = ST.OVER;
  stopMusic();
  hud.classList.add('hidden');
  $('#readyHint').classList.add('hidden');
  const newBest = game.score > game.best;
  if (newBest) { game.best = game.score; localStorage.setItem('orbit_best', game.best); }
  $('#finalScore').textContent = game.score;
  $('#finalBest').textContent = game.best;
  $('#newBest').classList.toggle('hidden', !newBest);
  $('#nameInput').value = localStorage.getItem('orbit_name') || '';
  $('#saveStatus').textContent = '';
  $('#saveStatus').className = 'save-status';
  $('#saveScoreBtn').disabled = false;
  show('#gameover');
}

function advanceRoundIfNeeded() {
  if (game.round < LAST_ROUND && game.score >= ROUND_UP[game.round]) {
    applyRound(game.round + 1);
    sfx('level');
    showBanner(game.round);
    // celebratory petals burst
    for (let i=0;i<26;i++) petals.push(makePetal(true));
  }
}

// ============================================================
//  SPAWN + UPDATE
// ============================================================
function spawnPipe() {
  const margin = 90 * S;
  const minY = margin + game.gapH/2;
  const maxY = GROUND_Y - margin - game.gapH/2;
  const gapY = rand(minY, maxY);
  pipes.push({ x: W + 60*S, gapY, gapH: game.gapH, w: 86*S, scored:false, seed: Math.random()*1000 });
}

function makePetal(burst) {
  return {
    x: burst ? P.x : rand(0, W),
    y: burst ? P.y : rand(-H*0.3, H),
    vx: rand(-30, -70)*S + (burst?rand(-60,60)*S:0),
    vy: burst ? rand(-120,60)*S : rand(20, 60)*S,
    r: rand(4, 9)*S, rot: rand(0, 6.28), vr: rand(-3,3), life: burst?1.4:99,
  };
}

let shake = 0;

// ----- themed wildlife / vehicles -----
const pick = (a) => a[(Math.random()*a.length)|0];
function spawnDecor(sp){
  const th = THEMES[game.round];
  if (!th.creatures || !th.creatures.length) return;
  const type = pick(th.creatures);
  const x = W + 90*S, seaSurf = GROUND_Y - 116*S;
  const d = { type, x, t:0, vx:-sp, size:20*S, ph:Math.random()*6.28, pr:0 };
  if (type==='bird'){ d.y=rand(H*0.06,H*0.40); d.vx=-(sp*0.6+50*S); d.size=rand(15,23)*S; }
  else if (type==='fish'){ d.y=rand(GROUND_Y-112*S, GROUND_Y-26*S); d.vx=-(sp*0.85); d.size=rand(12,19)*S; d.col=pick(['#ff8f43','#ffd23e','#3fb6ff','#ff5b9e','#3fd08a']); }
  else if (type==='dolphin'){ d.y=seaSurf; d.baseY=seaSurf; d.arcH=rand(95,155)*S; d.span=rand(240,340)*S; d.startX=x; d.vx=-(sp*0.95); d.size=rand(30,42)*S; }
  else if (type==='elephant'){ d.y=GROUND_Y+8*S; d.vx=-sp; d.size=rand(48,60)*S; d.walk=1; }
  else if (type==='monkey'){ d.y=GROUND_Y+8*S; d.vx=-sp; d.size=rand(24,30)*S; d.walk=1; }
  else if (type==='deer'){ d.y=GROUND_Y+8*S; d.vx=-sp; d.size=rand(30,38)*S; d.walk=1; }
  else if (type==='flycar'){ d.y=rand(H*0.22,H*0.50); d.vx=-(sp*1.05+70*S); d.size=rand(30,42)*S; d.col=pick(['#00e5ff','#ff5bd0','#ffe14c','#7cff6b']); }
  else if (type==='robot'){ d.y=rand(H*0.12,H*0.44); d.vx=-(sp*0.7); d.size=rand(26,34)*S; d.col=pick(['#00e5ff','#ff5bd0','#b388ff']); }
  else if (type==='flytrain'){ d.y=rand(H*0.08,H*0.30); d.vx=-(sp*0.55); d.size=rand(88,116)*S; }
  decor.push(d);
}
function updateDecor(dt, sp){
  decorTimer -= dt;
  const active = state===ST.PLAY || state===ST.READY || state===ST.MENU;
  if (decorTimer <= 0 && decor.length < 9 && active){ spawnDecor(sp); decorTimer = rand(0.8, 1.9); }
  for (let i=decor.length-1;i>=0;i--){
    const d = decor[i]; d.x += d.vx*dt; d.t += dt;
    if (d.type==='dolphin'){ d.pr=(d.startX-d.x)/d.span; d.y = d.baseY - d.arcH*Math.sin(Math.PI*clamp(d.pr,0,1)); }
    if (d.x < -d.size*2.4) decor.splice(i,1);
  }
}

function update(dt) {
  game.t += dt;

  // background scroll (always drift a little on menu for life)
  const sp = (state === ST.PLAY) ? game.speed : (state===ST.MENU ? 30*S : game.speed*0.35);
  game.scrollFar   += sp * 0.18 * dt;
  game.scrollMid   += sp * 0.42 * dt;
  game.scrollGround+= sp * 1.0  * dt;
  game.cloudX      += (12*S + sp*0.1) * dt;

  // petals
  if (petals.length < 26 && Math.random() < 0.6) petals.push(makePetal(false));
  for (let i=petals.length-1;i>=0;i--){
    const p = petals[i];
    p.x += p.vx*dt; p.y += p.vy*dt; p.vy += 60*S*dt*0.3; p.rot += p.vr*dt; p.life -= dt;
    if (p.x < -20 || p.y > H+20 || p.life <= 0) {
      if (p.life <= 0) petals.splice(i,1); else { p.x = W+10; p.y = rand(0,H*0.7); p.vy = rand(20,60)*S; }
    }
  }
  // flap puffs
  for (let i=puffs.length-1;i>=0;i--){
    const q = puffs[i]; q.x+=q.vx*dt; q.y+=q.vy*dt; q.r+=20*S*dt; q.life-=dt;
    if (q.life<=0) puffs.splice(i,1);
  }

  updateDecor(dt, sp);

  if (state === ST.READY) {
    P.y = H*0.42 + Math.sin(game.t*4) * 10 * S;
    P.frame = 0; P.tilt = 0;
    return;
  }
  if (state !== ST.PLAY) return;

  if (DEV && god) {
    P.y = lerp(P.y, H*0.42, 0.2); P.vy = 0; P.frame = 0; P.tilt = 0;
    game.distToNext -= game.speed * dt;
    if (game.distToNext <= 0) { spawnPipe(); game.distToNext = game.spawnGap; }
    for (let i=pipes.length-1;i>=0;i--){ const pi=pipes[i]; pi.x -= game.speed*dt; if (pi.x+pi.w<-40) pipes.splice(i,1); }
    return;
  }

  // physics
  P.vy += 2000 * S * dt;
  P.y  += P.vy * dt;
  P.flapT = Math.max(0, P.flapT - dt);
  P.tilt = clamp(P.vy / (900*S), -0.5, 1.1);

  // frame selection
  if (P.dead) P.frame = 2;
  else if (P.flapT > 0 || P.vy < -60*S) P.frame = 1;
  else if (P.vy > 220*S) P.frame = 2;
  else P.frame = 0;

  if (P.dead) {
    // death fall
    if (P.y < GROUND_Y - P.size*0.4) { /* keep falling */ }
    return;
  }

  // ceiling
  if (P.y < P.size*0.4) { P.y = P.size*0.4; P.vy = Math.max(P.vy, 0); }
  // ground
  if (P.y + P.r > GROUND_Y) { P.y = GROUND_Y - P.r; die(); return; }

  // spawn pipes
  game.distToNext -= game.speed * dt;
  if (game.distToNext <= 0) { spawnPipe(); game.distToNext = game.spawnGap; }

  // move + collide pipes
  for (let i=pipes.length-1;i>=0;i--){
    const pi = pipes[i];
    pi.x -= game.speed * dt;
    // score
    if (!pi.scored && pi.x + pi.w/2 < P.x) {
      pi.scored = true; game.score++; setHUD(); sfx('score');
      advanceRoundIfNeeded();
    }
    // collision (circle vs the two rects)
    const topH = pi.gapY - pi.gapH/2;
    const botY = pi.gapY + pi.gapH/2;
    if (circleRect(P.x, P.y, P.r, pi.x, 0, pi.w, topH) ||
        circleRect(P.x, P.y, P.r, pi.x, botY, pi.w, GROUND_Y - botY)) {
      die(); return;
    }
    if (pi.x + pi.w < -40) pipes.splice(i,1);
  }
}

function circleRect(cx, cy, r, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx+rw), ny = clamp(cy, ry, ry+rh);
  const dx = cx-nx, dy = cy-ny;
  return dx*dx + dy*dy < r*r;
}

// ============================================================
//  RENDER
// ============================================================
function render() {
  const th = THEMES[game.round];
  ctx.save();
  if (shake > 0) { ctx.translate(rand(-shake,shake), rand(-shake,shake)); shake *= 0.85; if (shake<0.5) shake=0; }

  drawSky(th);
  drawSun(th);
  drawFar(th);
  drawMid(th);
  drawDecor('back', th);   // fish & dolphins in the water
  drawClouds(th);
  drawPipes(th);
  drawGround(th);
  drawDecor('front', th);  // birds, vehicles & ground animals
  drawPetals(th);
  if (state === ST.READY || state === ST.PLAY || state === ST.OVER) drawPlayer();

  ctx.restore();
}

function drawSky(th){
  const g = ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0, th.sky[0]);
  g.addColorStop(0.55, th.sky[1]);
  g.addColorStop(1, th.sky[2]);
  ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
}

function drawSun(th){
  const sx = W*0.78, sy = H*0.20, R = 70*S;
  const g = ctx.createRadialGradient(sx,sy,R*0.2, sx,sy,R*3);
  g.addColorStop(0, th.sunGlow); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx,sy,R*3,0,7); ctx.fill();
  ctx.fillStyle = th.sun; ctx.beginPath(); ctx.arc(sx,sy,R,0,7); ctx.fill();
}

// ----- far parallax silhouette -----
function drawFar(th){
  const tileW = 260*S;
  const base = GROUND_Y + 6*S;
  const off = game.scrollFar % tileW;
  ctx.save();
  for (let i=-1; i*tileW - off < W + tileW; i++){
    const x = i*tileW - off;
    const h = hash(i*3.1);
    ctx.fillStyle = th.far;
    if (th.terrain === 'sea') {
      // limestone karst islands
      const iw = tileW*0.8, ih = (120+h*160)*S;
      ctx.beginPath();
      ctx.moveTo(x, base);
      ctx.quadraticCurveTo(x+iw*0.15, base-ih, x+iw*0.5, base-ih*0.9);
      ctx.quadraticCurveTo(x+iw*0.85, base-ih*1.05, x+iw, base);
      ctx.closePath(); ctx.fill();
    } else if (th.terrain === 'city') {
      // neon skyscraper towers
      const bw = tileW*(0.34+h*0.16), bh = (150+h*260)*S;
      const bx = x + tileW*0.2;
      ctx.fillStyle = th.far;
      rrect(ctx, bx, base-bh, bw, bh, 6*S); ctx.fill();
      // lit windows
      const neon = i%2 ? '#00e5ff' : '#ff5bd0';
      ctx.fillStyle = neon; ctx.globalAlpha = .8;
      for (let wy=base-bh+14*S; wy<base-14*S; wy+=18*S)
        for (let wx=bx+8*S; wx<bx+bw-8*S; wx+=16*S)
          if (hash(wx*0.3+wy*0.7)>0.45) ctx.fillRect(wx, wy, 7*S, 8*S);
      ctx.globalAlpha = 1;
      // antenna light
      ctx.fillStyle = neon; ctx.fillRect(bx+bw/2-1.5*S, base-bh-16*S, 3*S, 16*S);
      ctx.beginPath(); ctx.arc(bx+bw/2, base-bh-18*S, 4*S, 0, 7); ctx.fill();
      // a second slimmer tower
      const b2w=tileW*0.16, b2x=x+tileW*0.66, b2h=(110+hash(i*5.7)*180)*S;
      ctx.fillStyle = th.far; rrect(ctx, b2x, base-b2h, b2w, b2h, 4*S); ctx.fill();
    } else {
      // land: mountains / ridge with an occasional spire
      const peaks = 3;
      ctx.beginPath(); ctx.moveTo(x, base);
      for (let k=0;k<=peaks;k++){
        const px = x + (k/peaks)*tileW;
        const ph = base - (70 + hash(i*7+k)*190)*S;
        ctx.lineTo(px, ph);
      }
      ctx.lineTo(x+tileW, base); ctx.closePath(); ctx.fill();
      if (h > 0.55) {
        const px = x + tileW*0.5, py = base - (150+h*120)*S;
        spire(px, py, 30*S, th.obsGold, th.far);
      }
    }
  }
  // haze over far layer
  const hz = ctx.createLinearGradient(0, base-260*S, 0, base);
  hz.addColorStop(0,'rgba(255,255,255,0)'); hz.addColorStop(1, th.farHaze);
  ctx.fillStyle = hz; ctx.fillRect(0, base-260*S, W, 264*S);
  ctx.restore();
}

function spire(x, baseY, w, gold, stone){
  ctx.save();
  ctx.fillStyle = stone;
  ctx.beginPath(); ctx.moveTo(x, baseY-w*2.4); ctx.lineTo(x-w*0.5, baseY); ctx.lineTo(x+w*0.5, baseY); ctx.closePath(); ctx.fill();
  ctx.fillStyle = gold;
  ctx.beginPath(); ctx.moveTo(x, baseY-w*2.4); ctx.lineTo(x-w*0.22, baseY-w*1.1); ctx.lineTo(x+w*0.22, baseY-w*1.1); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(x, baseY-w*2.5, w*0.14, 0, 7); ctx.fill();
  ctx.restore();
}

// ----- mid parallax (rolling hills / sea / city) -----
function drawMid(th){
  const base = GROUND_Y + 4*S;
  const off = game.scrollMid % (200*S);
  if (th.terrain === 'city') {
    // dark rolling tech skyline base + glow band
    ctx.fillStyle = th.mid;
    const tileW = 150*S;
    ctx.beginPath(); ctx.moveTo(-off-tileW, base);
    for (let x=-off-tileW; x<W+tileW; x+=tileW){
      const bh=(60+hash((x)|0)*70)*S;
      ctx.lineTo(x, base-bh); ctx.lineTo(x+tileW*0.8, base-bh); ctx.lineTo(x+tileW*0.8, base);
    }
    ctx.lineTo(W+tileW, base+40*S); ctx.lineTo(-off-tileW, base+40*S); ctx.closePath(); ctx.fill();
    // neon horizon glow
    const g = ctx.createLinearGradient(0, base-90*S, 0, base);
    g.addColorStop(0,'rgba(0,229,255,0)'); g.addColorStop(1,'rgba(255,91,208,.25)');
    ctx.fillStyle = g; ctx.fillRect(0, base-90*S, W, 92*S);
    return;
  }
  if (th.terrain === 'sea') {
    // sea band
    const seaTop = base - 150*S;
    const g = ctx.createLinearGradient(0, seaTop, 0, base);
    g.addColorStop(0, th.mid); g.addColorStop(1, th.midDark);
    ctx.fillStyle = g; ctx.fillRect(0, seaTop, W, base-seaTop+2);
    // wave glints
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 3*S;
    for (let i=0;i<6;i++){
      const y = seaTop + 24*S + i*20*S;
      ctx.beginPath();
      for (let x=-off; x<W; x+=40*S){ ctx.moveTo(x, y); ctx.quadraticCurveTo(x+10*S, y-5*S, x+20*S, y); }
      ctx.stroke();
    }
  } else {
    // rounded green hills
    ctx.fillStyle = th.mid;
    const tileW = 200*S;
    ctx.beginPath(); ctx.moveTo(-off-tileW, base);
    for (let x=-off-tileW; x<W+tileW; x+=tileW){
      ctx.quadraticCurveTo(x+tileW*0.5, base-90*S, x+tileW, base);
    }
    ctx.lineTo(W+tileW, base+40*S); ctx.lineTo(-off-tileW, base+40*S); ctx.closePath(); ctx.fill();
    // trees
    for (let i=-1; i*tileW-off < W+tileW; i++){
      const x = i*tileW - off + tileW*0.5;
      if (hash(i*5.3) > 0.4) tree(x, base-40*S, (34+hash(i*2.2)*20)*S, th.mid, th.midDark);
    }
  }
}
function tree(x, baseY, r, light, dark){
  ctx.save();
  ctx.fillStyle = '#6b4a2b';
  ctx.fillRect(x-r*0.12, baseY-r*0.4, r*0.24, r*0.9);
  ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(x, baseY-r*0.8, r, 0, 7); ctx.fill();
  ctx.fillStyle = light; ctx.beginPath(); ctx.arc(x-r*0.35, baseY-r*1.0, r*0.7, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(x+r*0.4, baseY-r*0.9, r*0.6, 0, 7); ctx.fill();
  ctx.restore();
}

// ----- kawaii clouds with faces -----
const CLOUDS = Array.from({length:5}, (_,i)=>({ base:i*0.23, y:0.1+hash(i*9)*0.35, s:0.7+hash(i*3)*0.7, face:hash(i)>0.4 }));
function drawClouds(th){
  ctx.save();
  for (const c of CLOUDS){
    const span = W + 300*S;
    let x = ((c.base*span - (game.cloudX*(0.5+c.s*0.5)) ) % span + span) % span - 150*S;
    const y = H * c.y, s = c.s * S;
    cloud(x, y, s, th.clouds, c.face);
  }
  ctx.restore();
}
function cloud(x, y, s, col, face){
  ctx.save();
  ctx.fillStyle = col;
  ctx.shadowColor = 'rgba(150,170,210,.25)'; ctx.shadowBlur = 14*s; ctx.shadowOffsetY = 6*s;
  const puff=(dx,dy,r)=>{ ctx.beginPath(); ctx.arc(x+dx, y+dy, r, 0, 7); ctx.fill(); };
  puff(-46*s,6*s,26*s); puff(-14*s,-10*s,34*s); puff(24*s,-6*s,30*s); puff(52*s,8*s,24*s);
  rrect(ctx, x-58*s, y+6*s, 120*s, 26*s, 16*s); ctx.fill();
  ctx.shadowColor='transparent';
  if (face){
    ctx.fillStyle = 'rgba(255,150,180,.55)';
    ctx.beginPath(); ctx.arc(x-16*s, y+6*s, 5*s, 0,7); ctx.fill();
    ctx.beginPath(); ctx.arc(x+18*s, y+6*s, 5*s, 0,7); ctx.fill();
    ctx.strokeStyle = '#7a6a72'; ctx.lineWidth = 2.4*s; ctx.lineCap='round';
    ctx.beginPath(); ctx.arc(x-16*s, y-2*s, 5*s, 0.15, Math.PI-0.15); ctx.stroke();
    ctx.beginPath(); ctx.arc(x+18*s, y-2*s, 5*s, 0.15, Math.PI-0.15); ctx.stroke();
    ctx.beginPath(); ctx.arc(x+1*s, y+2*s, 4*s, 0.1, Math.PI-0.1); ctx.stroke();
  }
}

// ----- obstacles -----
const OBS = {
  temple:templeCol, palm:palmCol, pagoda:pagodaCol,
  coral:coralCol, prang:prangCol, karst:karstCol, whitetemple:whiteCol, tech:techCol,
};
function drawPipes(th){
  const fn = OBS[th.obstacle] || pagodaCol;
  for (const pi of pipes){
    const topH = pi.gapY - pi.gapH/2;
    const botY = pi.gapY + pi.gapH/2;
    fn(pi, 0, topH, true, th);
    fn(pi, botY, GROUND_Y-botY, false, th);
  }
}
function colBody(x, y, w, h, cols){
  const g = ctx.createLinearGradient(x,0,x+w,0);
  g.addColorStop(0, cols[1]); g.addColorStop(0.4, cols[0]); g.addColorStop(1, cols[1]);
  ctx.fillStyle = g; rrect(ctx, x, y, w, h, 10*S); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.lineWidth = 2*S; ctx.stroke();
}
function templeCol(pi, y, h, isTop, th){
  const x = pi.x, w = pi.w;
  colBody(x, y, w, h, th.obsBody);
  // brick lines
  ctx.strokeStyle='rgba(120,90,50,.16)'; ctx.lineWidth=2*S;
  for (let yy=y+16*S; yy<y+h-8*S; yy+=22*S){ ctx.beginPath(); ctx.moveTo(x,yy); ctx.lineTo(x+w,yy); ctx.stroke(); }
  // golden ornate cap at the gap end
  const capY = isTop ? y+h : y;
  const dir = isTop ? -1 : 1;
  ctx.fillStyle = th.obsGold;
  rrect(ctx, x-8*S, capY - (isTop?26*S:0), w+16*S, 26*S, 8*S); ctx.fill();
  // little chedi spire pointing into gap
  ctx.beginPath();
  ctx.moveTo(x+w/2, capY + dir*54*S);
  ctx.lineTo(x+w/2 - 14*S, capY + dir*8*S);
  ctx.lineTo(x+w/2 + 14*S, capY + dir*8*S);
  ctx.closePath(); ctx.fill();
}
function palmCol(pi, y, h, isTop, th){
  const x = pi.x, w = pi.w;
  colBody(x, y, w, h, th.obsBody);
  // trunk rings
  ctx.strokeStyle='rgba(60,35,15,.22)'; ctx.lineWidth=3*S;
  for (let yy=y+18*S; yy<y+h-8*S; yy+=26*S){ ctx.beginPath(); ctx.moveTo(x+4*S,yy); ctx.quadraticCurveTo(x+w/2,yy-5*S,x+w-4*S,yy); ctx.stroke(); }
  // palm fronds at gap end
  const capY = isTop ? y+h : y;
  const dir = isTop ? 1 : -1;
  ctx.fillStyle = th.obsGold;
  for (let a=-2;a<=2;a++){
    ctx.save(); ctx.translate(x+w/2, capY); ctx.rotate(a*0.5 + (dir<0?Math.PI:0));
    ctx.beginPath(); ctx.ellipse(0, 28*S, 12*S, 34*S, 0, 0, 7); ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle='#8a5a2f'; ctx.beginPath(); ctx.arc(x+w/2, capY, 9*S, 0, 7); ctx.fill();
}
function pagodaCol(pi, y, h, isTop, th){
  const x = pi.x, w = pi.w;
  colBody(x, y, w, h, th.obsBody);
  ctx.strokeStyle='rgba(90,80,60,.16)'; ctx.lineWidth=2*S;
  for (let yy=y+18*S; yy<y+h-8*S; yy+=24*S){ ctx.beginPath(); ctx.moveTo(x,yy); ctx.lineTo(x+w,yy); ctx.stroke(); }
  // tiered golden roof stack at gap end
  const capY = isTop ? y+h : y;
  const dir = isTop ? -1 : 1;
  ctx.fillStyle = th.obsGold;
  for (let t=0;t<3;t++){
    const tw = (w+22*S) - t*16*S;
    const ty = capY + dir*(t*16*S);
    rrect(ctx, x+w/2 - tw/2, isTop?ty-14*S:ty, tw, 14*S, 6*S); ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(x+w/2, capY + dir*66*S);
  ctx.lineTo(x+w/2-9*S, capY + dir*44*S);
  ctx.lineTo(x+w/2+9*S, capY + dir*44*S);
  ctx.closePath(); ctx.fill();
}

function coralCol(pi, y, h, isTop, th){
  const x=pi.x, w=pi.w;
  colBody(x,y,w,h,th.obsBody);
  ctx.fillStyle='rgba(255,255,255,.28)';
  for (let yy=y+16*S; yy<y+h-10*S; yy+=20*S){ ctx.beginPath(); ctx.arc(x+w*0.32, yy, 4*S,0,7); ctx.arc(x+w*0.7, yy+9*S, 3*S,0,7); ctx.fill(); }
  const capY=isTop?y+h:y, dir=isTop?1:-1;
  ctx.fillStyle=th.obsGold;
  for (let a=-2;a<=2;a++){
    ctx.save(); ctx.translate(x+w/2, capY); ctx.rotate(a*0.4);
    rrect(ctx,-4*S, dir>0?0:-26*S, 8*S, 26*S, 4*S); ctx.fill();
    ctx.beginPath(); ctx.arc(0, dir>0?26*S:-26*S, 7*S,0,7); ctx.fill();
    ctx.restore();
  }
}
function prangCol(pi, y, h, isTop, th){
  const x=pi.x, w=pi.w; colBody(x,y,w,h,th.obsBody);
  ctx.strokeStyle='rgba(80,45,25,.2)'; ctx.lineWidth=2*S;
  for (let yy=y+18*S; yy<y+h-8*S; yy+=20*S){ctx.beginPath();ctx.moveTo(x,yy);ctx.lineTo(x+w,yy);ctx.stroke();}
  const capY=isTop?y+h:y, dir=isTop?-1:1;
  ctx.fillStyle=th.obsGold;
  for (let t=0;t<4;t++){ const tw=(w+16*S)-t*12*S; const ty=capY+dir*(t*13*S); rrect(ctx, x+w/2-tw/2, isTop?ty-13*S:ty, tw, 13*S, 4*S); ctx.fill(); }
  ctx.beginPath(); ctx.moveTo(x+w/2,capY+dir*76*S); ctx.lineTo(x+w/2-8*S,capY+dir*50*S); ctx.lineTo(x+w/2+8*S,capY+dir*50*S); ctx.closePath(); ctx.fill();
}
function karstCol(pi, y, h, isTop, th){
  const x=pi.x, w=pi.w; colBody(x,y,w,h,th.obsBody);
  ctx.fillStyle='rgba(0,0,0,.07)';
  for (let yy=y+20*S; yy<y+h-12*S; yy+=30*S){ ctx.beginPath(); ctx.moveTo(x,yy); ctx.lineTo(x+11*S,yy+6*S); ctx.lineTo(x,yy+12*S); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle='rgba(255,255,255,.16)';
  for (let yy=y+34*S; yy<y+h-12*S; yy+=34*S){ ctx.beginPath(); ctx.arc(x+w-8*S,yy,3*S,0,7); ctx.fill(); }
  const capY=isTop?y+h:y;
  ctx.fillStyle=th.obsGold; // green tufts
  for (let a=-2;a<=2;a++){ ctx.beginPath(); ctx.ellipse(x+w/2+a*10*S, capY, 8*S, 13*S, a*0.2, 0,7); ctx.fill(); }
}
function whiteCol(pi, y, h, isTop, th){
  const x=pi.x, w=pi.w; colBody(x,y,w,h,th.obsBody);
  ctx.strokeStyle='rgba(150,170,210,.45)'; ctx.lineWidth=2*S;
  for (let yy=y+16*S; yy<y+h-8*S; yy+=20*S){ctx.beginPath();ctx.moveTo(x,yy);ctx.lineTo(x+w,yy);ctx.stroke();}
  const capY=isTop?y+h:y, dir=isTop?-1:1;
  ctx.fillStyle='#cfd8f0';
  rrect(ctx, x-6*S, isTop?capY-18*S:capY, w+12*S, 18*S, 6*S); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x+w/2,capY+dir*60*S); ctx.lineTo(x+w/2-10*S,capY+dir*4*S); ctx.lineTo(x+w/2+10*S,capY+dir*4*S); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#eef2ff'; ctx.beginPath(); ctx.arc(x+w/2, capY+dir*60*S, 4*S,0,7); ctx.fill();
}
function techCol(pi, y, h, isTop, th){
  const x=pi.x, w=pi.w;
  const g=ctx.createLinearGradient(x,0,x+w,0);
  g.addColorStop(0,th.obsBody[1]); g.addColorStop(.5,th.obsBody[0]); g.addColorStop(1,th.obsBody[1]);
  ctx.fillStyle=g; rrect(ctx,x,y,w,h,8*S); ctx.fill();
  ctx.save(); ctx.shadowColor=th.obsGold; ctx.shadowBlur=12*S;
  ctx.strokeStyle=th.obsGold; ctx.lineWidth=3*S; rrect(ctx,x+1.5*S,y+1.5*S,w-3*S,h-3*S,7*S); ctx.stroke();
  ctx.restore();
  ctx.fillStyle='rgba(0,229,255,.5)';
  for (let yy=y+18*S; yy<y+h-14*S; yy+=26*S){ ctx.fillRect(x+8*S, yy, w-16*S, 5*S); }
  const capY=isTop?y+h:y;
  ctx.save(); ctx.shadowColor='#ff5bd0'; ctx.shadowBlur=14*S; ctx.fillStyle='#ff5bd0';
  rrect(ctx, x-6*S, isTop?capY-14*S:capY, w+12*S, 14*S, 6*S); ctx.fill(); ctx.restore();
}

// ----- ground -----
function drawGround(th){
  const g = ctx.createLinearGradient(0, GROUND_Y, 0, H);
  g.addColorStop(0, th.ground[0]); g.addColorStop(1, th.ground[1]);
  ctx.fillStyle = g; ctx.fillRect(0, GROUND_Y, W, GROUND_H);
  // top edge scallops
  ctx.fillStyle = th.ground[0];
  const off = game.scrollGround % (46*S);
  for (let x=-off-46*S; x<W+46*S; x+=46*S){ ctx.beginPath(); ctx.arc(x+23*S, GROUND_Y, 24*S, Math.PI, 0); ctx.fill(); }
  // flower field (Chiang Rai)
  if (th.flowers){
    const fo = game.scrollGround % (40*S), cols=['#ff6fa5','#ffd23e','#c94bff','#ff8f43','#ffffff'];
    for (let i=-1, x=-fo-40*S; x<W+40*S; x+=40*S, i++){
      const fx=x+20*S, fy=GROUND_Y+6*S+hash(i*4.4)*10*S, c=cols[(hash(i*2.1)*cols.length)|0];
      ctx.fillStyle=c;
      for (let p=0;p<5;p++){ const a=p/5*6.28; ctx.beginPath(); ctx.arc(fx+Math.cos(a)*5*S, fy+Math.sin(a)*5*S, 3.4*S,0,7); ctx.fill(); }
      ctx.fillStyle='#ffe14c'; ctx.beginPath(); ctx.arc(fx,fy,3*S,0,7); ctx.fill();
    }
  }
  // road / water stripe
  if (th.neon){ ctx.save(); ctx.shadowColor=th.road; ctx.shadowBlur=16*S; }
  ctx.fillStyle = th.road;
  ctx.fillRect(0, GROUND_Y+40*S, W, 30*S);
  if (th.neon) ctx.restore();
  ctx.fillStyle = th.neon ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.85)';
  const so = game.scrollGround % (70*S);
  for (let x=-so; x<W; x+=70*S){ ctx.fillRect(x, GROUND_Y+53*S, 34*S, 5*S); }
}

function drawPetals(th){
  ctx.save();
  for (const p of petals){
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    ctx.fillStyle = th.petal; ctx.globalAlpha = clamp(p.life,0,1);
    ctx.beginPath(); ctx.ellipse(0,0,p.r,p.r*0.55,0,0,7); ctx.fill();
    ctx.restore();
  }
  for (const q of puffs){
    ctx.globalAlpha = clamp(q.life*1.6,0,0.7); ctx.fillStyle='#ffffff';
    ctx.beginPath(); ctx.arc(q.x,q.y,q.r,0,7); ctx.fill();
  }
  ctx.restore();
}

// ----- themed creatures / vehicles -----
function drawDecor(pass, th){
  for (const d of decor){
    const back = (d.type==='fish' || d.type==='dolphin');
    if (pass==='back' ? !back : back) continue;
    ctx.save();
    ({ bird:cBird, fish:cFish, dolphin:cDolphin, elephant:cElephant, monkey:cMonkey,
       deer:cDeer, flycar:cFlycar, robot:cRobot, flytrain:cFlytrain }[d.type] || (()=>{}))(d);
    ctx.restore();
  }
}
function cBird(d){
  const s=d.size, wing=Math.sin(d.t*12)*0.9;
  ctx.translate(d.x,d.y);
  ctx.fillStyle='#5a6b8c';
  ctx.save(); ctx.rotate(-wing); ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(-s*0.9,-s*0.3); ctx.lineTo(-s*0.1,s*0.15); ctx.closePath(); ctx.fill(); ctx.restore();
  ctx.save(); ctx.rotate(wing); ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(s*0.9,-s*0.3); ctx.lineTo(s*0.1,s*0.15); ctx.closePath(); ctx.fill(); ctx.restore();
  ctx.fillStyle='#8296b8'; ctx.beginPath(); ctx.ellipse(0,0,s*0.28,s*0.22,0,0,7); ctx.fill();
  ctx.beginPath(); ctx.arc(-s*0.28,-s*0.06,s*0.16,0,7); ctx.fill();
  ctx.fillStyle='#ffb03a'; ctx.beginPath(); ctx.moveTo(-s*0.42,-s*0.06); ctx.lineTo(-s*0.6,0); ctx.lineTo(-s*0.42,s*0.06); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#2b2b3a'; ctx.beginPath(); ctx.arc(-s*0.3,-s*0.09,s*0.03,0,7); ctx.fill();
}
function cFish(d){
  const s=d.size, yy=d.y+Math.sin(d.t*3+d.ph)*4*S;
  ctx.translate(d.x,yy);
  ctx.fillStyle=d.col||'#ff8f43';
  ctx.beginPath(); ctx.ellipse(0,0,s*0.5,s*0.32,0,0,7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(s*0.42,0); ctx.lineTo(s*0.72,-s*0.28); ctx.lineTo(s*0.72,s*0.28); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(-s*0.28,-s*0.05,s*0.1,0,7); ctx.fill();
  ctx.fillStyle='#2b2b3a'; ctx.beginPath(); ctx.arc(-s*0.30,-s*0.05,s*0.05,0,7); ctx.fill();
}
function cDolphin(d){
  const s=d.size, tilt=-1.0*Math.cos(Math.PI*clamp(d.pr,0,1));
  ctx.translate(d.x,d.y); ctx.rotate(tilt*0.5);
  ctx.fillStyle='#8fb4c8';
  ctx.beginPath();
  ctx.moveTo(-s*0.6,0);
  ctx.quadraticCurveTo(-s*0.1,-s*0.5, s*0.5,-s*0.18);
  ctx.quadraticCurveTo(s*0.75,-s*0.05, s*0.6,s*0.05);
  ctx.quadraticCurveTo(s*0.1,-s*0.02, -s*0.6,s*0.12);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle='#d6ebf2'; ctx.beginPath(); ctx.ellipse(-s*0.1,s*0.05,s*0.4,s*0.14,0,0,7); ctx.fill();
  ctx.fillStyle='#8fb4c8';
  ctx.beginPath(); ctx.moveTo(s*0.05,-s*0.32); ctx.lineTo(s*0.2,-s*0.55); ctx.lineTo(s*0.28,-s*0.26); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(s*0.5,-s*0.1); ctx.lineTo(s*0.78,-s*0.34); ctx.lineTo(s*0.66,-s*0.02); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#2b2b3a'; ctx.beginPath(); ctx.arc(-s*0.4,-s*0.08,s*0.05,0,7); ctx.fill();
  if (d.pr<0.12 || d.pr>0.88){ ctx.fillStyle='rgba(255,255,255,.6)'; for(let i=0;i<4;i++){ctx.beginPath();ctx.arc(rand(-s*0.4,s*0.4),s*0.2+rand(0,6*S),rand(2,4)*S,0,7);ctx.fill();} }
}
function cElephant(d){
  const s=d.size, bob=Math.abs(Math.sin(d.t*6))*3*S;
  ctx.translate(d.x, d.y-bob);
  ctx.fillStyle='#9aa3b2';
  for (const lx of [-s*0.3,-s*0.08,s*0.12,s*0.32]) ctx.fillRect(lx, -s*0.28, s*0.12, s*0.28);
  ctx.beginPath(); ctx.ellipse(0,-s*0.42,s*0.44,s*0.3,0,0,7); ctx.fill();
  ctx.beginPath(); ctx.arc(-s*0.42,-s*0.42,s*0.24,0,7); ctx.fill();
  ctx.fillStyle='#868ea0'; ctx.beginPath(); ctx.ellipse(-s*0.38,-s*0.44,s*0.16,s*0.2,0,0,7); ctx.fill();
  ctx.strokeStyle='#9aa3b2'; ctx.lineWidth=s*0.13; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(-s*0.6,-s*0.42); ctx.quadraticCurveTo(-s*0.8,-s*0.3,-s*0.74,-s*0.06); ctx.stroke();
  ctx.strokeStyle='#fff'; ctx.lineWidth=s*0.05; ctx.beginPath(); ctx.moveTo(-s*0.56,-s*0.28); ctx.lineTo(-s*0.64,-s*0.14); ctx.stroke();
  ctx.fillStyle='#2b2b3a'; ctx.beginPath(); ctx.arc(-s*0.48,-s*0.46,s*0.035,0,7); ctx.fill();
}
function cMonkey(d){
  const s=d.size, bob=Math.abs(Math.sin(d.t*7))*3*S;
  ctx.translate(d.x, d.y-bob);
  ctx.strokeStyle='#7a5230'; ctx.lineWidth=s*0.1; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(s*0.28,-s*0.3); ctx.quadraticCurveTo(s*0.6,-s*0.4,s*0.5,-s*0.04); ctx.stroke();
  ctx.fillStyle='#7a5230';
  for (const lx of [-s*0.18,s*0.12]) ctx.fillRect(lx,-s*0.3,s*0.12,s*0.3);
  ctx.beginPath(); ctx.ellipse(0,-s*0.42,s*0.3,s*0.28,0,0,7); ctx.fill();
  ctx.beginPath(); ctx.arc(-s*0.18,-s*0.66,s*0.22,0,7); ctx.fill();
  ctx.beginPath(); ctx.arc(-s*0.36,-s*0.7,s*0.08,0,7); ctx.arc(0,-s*0.7,s*0.08,0,7); ctx.fill();
  ctx.fillStyle='#c99b6a'; ctx.beginPath(); ctx.ellipse(-s*0.2,-s*0.62,s*0.13,s*0.11,0,0,7); ctx.fill();
  ctx.fillStyle='#2b2b3a'; ctx.beginPath(); ctx.arc(-s*0.26,-s*0.66,s*0.03,0,7); ctx.arc(-s*0.14,-s*0.66,s*0.03,0,7); ctx.fill();
}
function cDeer(d){
  const s=d.size, bob=Math.abs(Math.sin(d.t*6))*3*S;
  ctx.translate(d.x,d.y-bob);
  ctx.fillStyle='#c68a4e';
  for (const lx of [-s*0.28,-s*0.06,s*0.14,s*0.3]) ctx.fillRect(lx,-s*0.3,s*0.07,s*0.3);
  ctx.beginPath(); ctx.ellipse(0,-s*0.44,s*0.4,s*0.24,0,0,7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-s*0.34,-s*0.5); ctx.lineTo(-s*0.5,-s*0.86); ctx.lineTo(-s*0.36,-s*0.86); ctx.lineTo(-s*0.24,-s*0.5); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-s*0.5,-s*0.9,s*0.13,s*0.1,0.3,0,7); ctx.fill();
  ctx.strokeStyle='#8a5a2f'; ctx.lineWidth=s*0.04; ctx.lineCap='round';
  ctx.beginPath();
  ctx.moveTo(-s*0.5,-s*0.98); ctx.lineTo(-s*0.56,-s*1.15);
  ctx.moveTo(-s*0.54,-s*1.06); ctx.lineTo(-s*0.66,-s*1.12);
  ctx.moveTo(-s*0.44,-s*0.98); ctx.lineTo(-s*0.4,-s*1.14);
  ctx.stroke();
  ctx.fillStyle='#2b2b3a'; ctx.beginPath(); ctx.arc(-s*0.54,-s*0.9,s*0.03,0,7); ctx.fill();
  ctx.fillStyle='#e0b483'; ctx.beginPath(); ctx.arc(s*0.4,-s*0.5,s*0.06,0,7); ctx.fill();
}
function cFlycar(d){
  const s=d.size, hov=Math.sin(d.t*4+d.ph)*3*S;
  ctx.translate(d.x,d.y+hov);
  ctx.save(); ctx.shadowColor=d.col; ctx.shadowBlur=16*S;
  ctx.fillStyle='#2b2f45'; rrect(ctx,-s*0.6,-s*0.18,s*1.2,s*0.36,s*0.18); ctx.fill();
  ctx.restore();
  ctx.fillStyle=d.col; rrect(ctx,-s*0.28,-s*0.34,s*0.56,s*0.24,s*0.1); ctx.fill();
  ctx.fillStyle='rgba(255,255,255,.65)'; rrect(ctx,-s*0.2,-s*0.3,s*0.4,s*0.14,s*0.06); ctx.fill();
  ctx.fillStyle=d.col; ctx.globalAlpha=.6; ctx.beginPath(); ctx.ellipse(s*0.66,0,s*0.14,s*0.08,0,0,7); ctx.fill(); ctx.globalAlpha=1;
}
function cRobot(d){
  const s=d.size, hov=Math.sin(d.t*3+d.ph)*4*S;
  ctx.translate(d.x,d.y+hov);
  ctx.fillStyle='#c7ccdb';
  rrect(ctx,-s*0.32,-s*0.34,s*0.64,s*0.6,s*0.16); ctx.fill();
  ctx.strokeStyle='#8a90a8'; ctx.lineWidth=s*0.06; ctx.beginPath(); ctx.moveTo(0,-s*0.34); ctx.lineTo(0,-s*0.52); ctx.stroke();
  ctx.save(); ctx.shadowColor=d.col; ctx.shadowBlur=10*S; ctx.fillStyle=d.col;
  ctx.beginPath(); ctx.arc(0,-s*0.56,s*0.07,0,7); ctx.fill();
  ctx.beginPath(); ctx.arc(-s*0.12,-s*0.06,s*0.08,0,7); ctx.arc(s*0.12,-s*0.06,s*0.08,0,7); ctx.fill(); ctx.restore();
  ctx.strokeStyle='#8a90a8'; ctx.lineWidth=s*0.04; ctx.beginPath(); ctx.moveTo(-s*0.1,s*0.12); ctx.lineTo(s*0.1,s*0.12); ctx.stroke();
  ctx.fillStyle=d.col; ctx.globalAlpha=.5; ctx.beginPath(); ctx.ellipse(0,s*0.32,s*0.2,s*0.06,0,0,7); ctx.fill(); ctx.globalAlpha=1;
}
function cFlytrain(d){
  const s=d.size, hov=Math.sin(d.t*2+d.ph)*3*S, L=s, Hh=s*0.16;
  ctx.translate(d.x,d.y+hov);
  ctx.save(); ctx.shadowColor='#00e5ff'; ctx.shadowBlur=14*S;
  ctx.fillStyle='#dfe6ff';
  ctx.beginPath();
  ctx.moveTo(-L*0.5, 0);
  ctx.quadraticCurveTo(-L*0.5-Hh*0.6, -Hh, -L*0.36,-Hh);
  ctx.lineTo(L*0.5,-Hh); ctx.quadraticCurveTo(L*0.5+Hh*0.4,0,L*0.5,Hh);
  ctx.lineTo(-L*0.36,Hh); ctx.quadraticCurveTo(-L*0.5-Hh*0.6,Hh,-L*0.5,0);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.fillStyle='#00e5ff'; ctx.fillRect(-L*0.36,-Hh*0.16,L*0.86,Hh*0.18);
  ctx.fillStyle='rgba(0,120,160,.7)';
  for (let wx=-L*0.34; wx<L*0.44; wx+=L*0.12){ rrect(ctx,wx,-Hh*0.62,L*0.08,Hh*0.5,3*S); ctx.fill(); }
  ctx.fillStyle='#ffe14c'; ctx.beginPath(); ctx.arc(-L*0.46,0,Hh*0.22,0,7); ctx.fill();
}

// ----- player -----
function drawPlayer(){
  const dieRot = P.dead ? clamp(game.t*0, -1, 1) : 0;
  ctx.save();
  // shadow on ground
  const shY = GROUND_Y - 6*S;
  const shScale = clamp(1 - (shY - P.y)/(H*0.6), 0.3, 1);
  ctx.fillStyle = 'rgba(60,40,60,.18)';
  ctx.beginPath(); ctx.ellipse(P.x, shY, P.size*0.32*shScale, P.size*0.12*shScale, 0, 0, 7); ctx.fill();

  ctx.translate(P.x, P.y);
  ctx.rotate(P.tilt * 0.5 + dieRot);
  // soft glow
  const gl = ctx.createRadialGradient(0,0,P.size*0.1,0,0,P.size*0.75);
  gl.addColorStop(0,'rgba(255,210,235,.55)'); gl.addColorStop(1,'rgba(255,210,235,0)');
  ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0,0,P.size*0.75,0,7); ctx.fill();

  if (spriteReady){
    ctx.imageSmoothingEnabled = false;
    const d = P.size;
    ctx.drawImage(sprite, P.frame*FRAME, 0, FRAME, FRAME, -d/2, -d/2, d, d);
    ctx.imageSmoothingEnabled = true;
  } else {
    ctx.fillStyle = '#ff9ec4'; ctx.beginPath(); ctx.arc(0,0,P.size*0.4,0,7); ctx.fill();
  }
  ctx.restore();
}

// ============================================================
//  MAIN LOOP
// ============================================================
let last = performance.now();
function loop(now){
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.05) dt = 0.05; // clamp big frame gaps
  if (state !== ST.LOADING) { update(dt); render(); }
  requestAnimationFrame(loop);
}

// ============================================================
//  SOUND (WebAudio, synthesized — no files)
// ============================================================
let actx = null, muted = localStorage.getItem('orbit_mute') === '1';
function audioInit(){ if (!actx) { try { actx = new (window.AudioContext||window.webkitAudioContext)(); } catch(e){} } if (actx && actx.state==='suspended') actx.resume(); }
function tone(freq, dur, type='sine', vol=0.2, slide=0){
  if (muted || !actx) return;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.value = freq;
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40,freq+slide), actx.currentTime+dur);
  g.gain.setValueAtTime(vol, actx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime+dur);
  o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime+dur);
}
function sfx(kind){
  if (muted || !actx) return;
  if (kind==='flap') tone(520, 0.12, 'sine', 0.18, 180);
  else if (kind==='score'){ tone(880,0.09,'triangle',0.16); setTimeout(()=>tone(1320,0.12,'triangle',0.16),70); }
  else if (kind==='hit'){ tone(180,0.28,'sawtooth',0.22,-120); }
  else if (kind==='level'){ [660,880,1100,1320].forEach((f,i)=>setTimeout(()=>tone(f,0.16,'triangle',0.18),i*90)); }
}

// ----- background music: loops during a round only, respects the mute button -----
const music = new Audio('assets/Puddle_Jumpers.mp3');
music.loop = true;
music.volume = 0.45;
music.preload = 'auto';
function startMusic(){
  if (muted) return;
  try { music.currentTime = 0; const p = music.play(); if (p && p.catch) p.catch(()=>{}); } catch(e){}
}
function stopMusic(){
  try { music.pause(); music.currentTime = 0; } catch(e){}
}

// ============================================================
//  UI / DOM wiring
// ============================================================
const $ = (s)=>document.querySelector(s);
const hud = $('#hud');
const overlays = ['#menu','#how','#banner','#gameover','#board','#loading'];
function hideAll(){ overlays.forEach(s=>$(s).classList.add('hidden')); }
function show(sel){ hideAll(); $(sel).classList.remove('hidden'); }
function setHUD(){
  $('#scoreValue').textContent = game.score;
  $('#roundValue').textContent = game.round+1;
  const start = game.round===0?0:ROUND_UP[game.round-1];
  const end = game.round<LAST_ROUND?ROUND_UP[game.round]:start+10;
  const pct = clamp((game.score-start)/(end-start),0,1)*100;
  $('#roundBar').style.width = pct+'%';
}

let bannerTimer = null, hintTimer = null;
function showBanner(idx){
  const th = THEMES[idx];
  $('#bannerKicker').textContent = idx===LAST_ROUND ? 'FINAL STAGE' : ('ROUND '+(idx+1));
  $('#bannerTitle').textContent = th.name;
  $('#bannerSub').textContent = th.sub;
  const b = $('#banner'); b.classList.remove('hidden');
  const card = b.querySelector('.banner-card');
  card.style.animation='none'; void card.offsetWidth; card.style.animation='';
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(()=>{ b.classList.add('hidden'); }, idx===0?1400:1200);
}

// ----- Leaderboard (online-first, shared across every deployment) -----
const GAME_ID = 'orbit_jump';
// One canonical backend so scores sync everywhere the game is hosted.
// A host can override by setting window.ORBIT_API_BASE before this script loads.
const API_BASE = (window.ORBIT_API_BASE || 'https://jozilla.loxleyorbit.com/orbitjump').replace(/\/+$/,'');

// Anti-injection play token. Minted by the server when a run starts (startGame);
// the server checks its signature + age when the score is submitted, so a raw
// POST with a made-up number is rejected. See deploy/orbitjump/main.go.
let playToken = null;
async function newPlayToken(){
  playToken = null;
  try {
    const r = await fetch(API_BASE+'/api/session', {cache:'no-store'});
    if (r.ok){ const j = await r.json(); playToken = j.token || null; }
  } catch(e){ /* offline: submit will fall back to the local cache */ }
}

function localBoard(){ try { return JSON.parse(localStorage.getItem('orbit_board')||'[]'); } catch(e){ return []; } }
function cacheLocal(entry){ // offline safety net only — the server is the source of truth
  const b = localBoard(); b.push(entry);
  b.sort((a,z)=>z.score-a.score);
  localStorage.setItem('orbit_board', JSON.stringify(b.slice(0,50)));
}
async function submitScore(name, score){
  try {
    const r = await fetch(API_BASE+'/api/score', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ playerName:name, score, gameName:GAME_ID, token: playToken })
    });
    if (r.ok){ cacheLocal({ name, score, ts:Date.now(), mine:true }); return 'server'; }
    return 'error';
  } catch(e){
    cacheLocal({ name, score, ts:Date.now(), mine:true });
    return 'offline';
  }
}
async function loadBoard(){
  const list = $('#boardList');
  list.innerHTML = '<li class="board-empty">Loading…</li>';
  let rows = null, offline = false;
  try {
    const r = await fetch(API_BASE+'/api/leaderboard?gameName='+GAME_ID, {cache:'no-store'});
    if (r.ok){ const j = await r.json(); if (Array.isArray(j.leaderboard)) rows = j.leaderboard.map(s=>({name:s.playerName, score:s.score})); }
  } catch(e){}
  if (!rows){ offline = true; rows = localBoard().map(e=>({name:e.name, score:e.score, mine:true})); }
  rows.sort((a,z)=>z.score-a.score);
  rows = rows.slice(0,10);
  const myName = localStorage.getItem('orbit_name');
  if (!rows.length){ list.innerHTML = '<li class="board-empty">No scores yet — be the first! 🌸</li>'; return; }
  list.innerHTML =
    (offline ? '<li class="board-note">⚠️ Offline — showing scores saved on this device</li>' : '') +
    rows.map((r,i)=>{
      const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1);
      const me = (r.name===myName) ? ' me':'';
      const top = (!offline && i===0)?' top1':'';
      return `<li class="${top}${me}"><span class="rank">${medal}</span><span class="who">${escapeHtml(r.name)}</span><span class="pts">${r.score}</span></li>`;
    }).join('');
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// ----- buttons -----
$('#playBtn').addEventListener('click', ()=>{ audioInit(); startGame(); });
$('#retryBtn').addEventListener('click', ()=>{ audioInit(); startGame(); });
$('#howBtn').addEventListener('click', ()=> show('#how'));
$('#howBack').addEventListener('click', ()=> show('#menu'));
$('#boardBtn').addEventListener('click', ()=>{ show('#board'); loadBoard(); });
$('#goBoardBtn').addEventListener('click', ()=>{ show('#board'); loadBoard(); });
$('#boardBack').addEventListener('click', backFromBoard);
$('#menuBtn').addEventListener('click', gotoMenu);
let boardReturn = 'menu';
function backFromBoard(){ boardReturn==='over' ? show('#gameover') : gotoMenu(); }
function gotoMenu(){ stopMusic(); state = ST.MENU; $('#menuBest').textContent = game.best; show('#menu'); }

$('#muteBtn').addEventListener('click', ()=>{
  muted = !muted; localStorage.setItem('orbit_mute', muted?'1':'0');
  $('#muteBtn').textContent = muted ? '🔇' : '🔊';
  if (muted) { stopMusic(); }
  else { audioInit(); if (state===ST.READY || state===ST.PLAY) startMusic(); }
});

$('#saveScoreBtn').addEventListener('click', async ()=>{
  const name = ($('#nameInput').value || '').trim().slice(0,14) || 'Player';
  localStorage.setItem('orbit_name', name);
  $('#saveScoreBtn').disabled = true;
  $('#saveStatus').textContent = 'Saving…'; $('#saveStatus').className='save-status';
  const res = await submitScore(name, game.score);
  if (res==='server'){
    $('#saveStatus').textContent = '✓ Saved to the global leaderboard!';
    $('#saveStatus').className = 'save-status ok';
    $('#nameEntry').style.opacity = '.6';
  } else {
    $('#saveStatus').textContent = res==='offline'
      ? '⚠️ Offline — saved here, tap Save to retry' : '⚠️ Couldn’t save — tap Save to retry';
    $('#saveStatus').className = 'save-status warn';
    $('#saveScoreBtn').disabled = false;
  }
});
$('#nameInput')?.addEventListener('keydown', e=>{ if (e.key==='Enter') $('#saveScoreBtn').click(); });

// track where board was opened from
$('#goBoardBtn').addEventListener('click', ()=> boardReturn='over');
$('#boardBtn').addEventListener('click', ()=> boardReturn='menu');

// ----- global input: flap -----
function onFlapInput(e){
  if (state === ST.READY) { audioInit(); beginPlay(); }
  else if (state === ST.PLAY) { flap(); }
}
canvas.addEventListener('pointerdown', (e)=>{ e.preventDefault(); audioInit(); onFlapInput(e); });
window.addEventListener('keydown', (e)=>{
  // Don't hijack keys while the player is typing (e.g. the leaderboard name
  // field) — otherwise "w"/Space/Up get eaten here and never reach the input.
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  if (e.code==='Space' || e.code==='ArrowUp' || e.code==='KeyW'){
    e.preventDefault(); audioInit();
    if (state===ST.MENU){ startGame(); return; }
    onFlapInput(e);
  }
  // dev-only: keys 1/2/3 jump to a round to preview themes; g = hover/god
  if (DEV && state===ST.PLAY && ['Digit1','Digit2','Digit3'].includes(e.code)){
    const i = +e.code.slice(-1)-1; applyRound(i);
    game.score = i===0?0:ROUND_UP[i-1]; setHUD(); showBanner(i);
  }
  if (DEV && e.code==='KeyG'){ god = !god; }
});
const DEV = /[?&]dev\b/.test(location.search);
let god = false;
if (DEV) {
  window.__orbit = {
    preview(i){
      hideAll(); hud.classList.remove('hidden');
      pipes.length=0; petals.length=0; puffs.length=0;
      applyRound(i); god = true; state = ST.PLAY;
      game.score = i===0?0:ROUND_UP[i-1]; setHUD();
      P.y = H*0.42; P.vy=0; P.dead=false; P.frame=1; P.tilt=0;
      // place two visible pipe pairs
      const mk=(x)=>{ const gy=rand(GROUND_Y*0.35,GROUND_Y*0.62); pipes.push({x, gapY:gy, gapH:game.gapH, w:86*S, scored:true, seed:Math.random()*1000}); };
      mk(W*0.62); mk(W*1.05);
      game.distToNext = game.spawnGap;
    },
    creature(type, xf){
      decorTimer = 99;
      const before = decor.length;
      spawnDecor(0); // ensure fn works
      decor.length = before;
      const d = { type, x:W*(xf??0.5), t:0.4, vx:0, size:20*S, ph:1, pr:0.5 };
      if (type==='bird'){ d.y=H*0.25; d.size=22*S; }
      else if (type==='fish'){ d.y=GROUND_Y-70*S; d.size=18*S; d.col='#ff8f43'; }
      else if (type==='dolphin'){ d.y=GROUND_Y-190*S; d.baseY=GROUND_Y-116*S; d.arcH=150*S; d.span=300*S; d.startX=W; d.size=40*S; }
      else if (['elephant','monkey','deer'].includes(type)){ d.y=GROUND_Y+8*S; d.size=(type==='elephant'?56:type==='deer'?36:28)*S; d.walk=1; }
      else if (type==='flycar'){ d.y=H*0.35; d.size=40*S; d.col='#00e5ff'; }
      else if (type==='robot'){ d.y=H*0.3; d.size=32*S; d.col='#ff5bd0'; }
      else if (type==='flytrain'){ d.y=H*0.2; d.size=110*S; }
      decor.push(d);
    }
  };
}

// ============================================================
//  BOOT
// ============================================================
function boot(){
  resize();
  game.best = parseInt(localStorage.getItem('orbit_best')||'0',10) || 0;
  $('#menuBest').textContent = game.best;
  $('#muteBtn').textContent = muted ? '🔇' : '🔊';
  // fake-load until sprite ready (or timeout), then menu
  const done = ()=>{ state = ST.MENU; show('#menu'); };
  let waited = 0;
  const iv = setInterval(()=>{ waited+=60; if (spriteReady || waited>2500){ clearInterval(iv); done(); } }, 60);
  requestAnimationFrame(loop);
}
window.addEventListener('load', boot);
if (document.readyState==='complete') boot();

})();

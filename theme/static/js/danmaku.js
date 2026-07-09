/**
 * Celestial Peak — Touhou-styled danmaku stage + PeerJS online co-op
 * Original homage. Z shot · Shift focus · X bomb · lockstep netplay
 */
(function () {
  "use strict";

  var canvas = document.getElementById("danmaku-canvas");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  var wrap = document.getElementById("danmaku-demo");

  var W = 384, H = 448;
  canvas.width = W;
  canvas.height = H;

  var STATE = { MENU: 0, PLAY: 1, PAUSE: 2, CLEAR: 3, DEAD: 4, LOBBY: 5 };
  var state = STATE.MENU;
  var mode = "solo"; // solo | online
  var netRole = null; // host | guest
  var localSeat = 0; // 0 or 1
  var peerNames = ["Player1", "Player2"];

  var FIXED_MS = 1000 / 60;
  var INPUT_DELAY = 2;
  var lastTs = 0, simAcc = 0;

  // Seeded RNG for lockstep
  var rngState = 1;
  function seedRng(s) {
    rngState = (s >>> 0) || 1;
  }
  function rand() {
    // mulberry32
    rngState |= 0;
    rngState = (rngState + 0x6d2b79f5) | 0;
    var t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  var keys = Object.create(null);
  var frame = 0;
  var score = 0, hiScore = 0, graze = 0, pointItem = 0;
  var lives = 3, bombs = 2, power = 4.0;
  var spellName = "", spellTimer = 0;
  var difficulty = 1;

  // Two player ships
  function makePlayer(x, y, color, color2) {
    return {
      x: x, y: y, r: 2.4,
      speed: 4.0, focusSpeed: 1.8,
      shotCd: 0, invuln: 0,
      color: color, color2: color2,
      alive: true, bombs: 2
    };
  }
  var players = [
    makePlayer(W * 0.38, H - 64, "#e8eef8", "#e05050"),
    makePlayer(W * 0.62, H - 64, "#ffe6c8", "#4a8ec8")
  ];

  var bullets = [], pBullets = [], enemies = [], particles = [];
  var boss = null;

  // Net
  var peer = null, conn = null;
  var netStatus = "idle";
  var remoteInputs = Object.create(null); // frame -> {0: bits, 1: bits}
  var localInputQueue = Object.create(null);
  var waitingForPeer = false;
  var matchmaking = false;
  var hiStored = 0;
  try { hiStored = parseInt(localStorage.getItem("th-hiscore") || "0", 10) || 0; } catch (e) {}
  hiScore = hiStored;

  // DOM
  var el = {
    score: document.getElementById("th-score"),
    hiscore: document.getElementById("th-hiscore"),
    lives: document.getElementById("th-lives"),
    bombs: document.getElementById("th-bombs"),
    power: document.getElementById("th-power"),
    graze: document.getElementById("th-graze"),
    point: document.getElementById("th-point"),
    overlay: document.getElementById("th-overlay"),
    overlayTitle: document.getElementById("th-overlay-title"),
    overlaySub: document.getElementById("th-overlay-sub"),
    overlayJp: document.getElementById("th-overlay-jp"),
    spell: document.getElementById("th-spell"),
    spellName: document.getElementById("th-spell-name"),
    netStatus: document.getElementById("th-net-status"),
    netPeers: document.getElementById("th-net-peers"),
    netGo: document.getElementById("th-net-go"),
    netCancel: document.getElementById("th-net-cancel"),
    name: document.getElementById("th-name"),
    room: document.getElementById("th-room"),
    roomField: document.getElementById("th-room-field")
  };

  function pad9(n) {
    n = Math.max(0, Math.floor(n));
    return String(n).padStart(9, "0");
  }
  function setStatus(msg) {
    if (el.netStatus) el.netStatus.textContent = msg;
  }
  function setPeers(msg) {
    if (el.netPeers) el.netPeers.textContent = msg || "";
  }
  function showOverlay(title, sub, jp) {
    if (!el.overlay) return;
    el.overlay.hidden = false;
    if (el.overlayTitle) el.overlayTitle.textContent = title;
    if (el.overlaySub) el.overlaySub.textContent = sub || "";
    if (el.overlayJp) el.overlayJp.textContent = jp || "弾幕";
  }
  function hideOverlay() {
    if (el.overlay) el.overlay.hidden = true;
  }
  function showSpell(name) {
    spellName = name;
    spellTimer = 150;
    if (el.spell) {
      el.spell.hidden = false;
      if (el.spellName) el.spellName.textContent = name;
    }
  }
  function updateHUD() {
    if (el.score) el.score.textContent = pad9(score);
    if (el.hiscore) el.hiscore.textContent = pad9(Math.max(hiScore, score));
    if (el.lives) el.lives.textContent = "★".repeat(Math.max(0, lives)) || "—";
    if (el.bombs) el.bombs.textContent = "◆".repeat(Math.max(0, bombs)) || "—";
    if (el.power) el.power.textContent = power.toFixed(2);
    if (el.graze) el.graze.textContent = String(graze);
    if (el.point) el.point.textContent = String(pointItem);
    if (spellTimer <= 0 && el.spell && !el.spell.hidden) el.spell.hidden = true;
  }

  function bitsFromKeys() {
    var b = 0;
    if (keys["ArrowLeft"] || keys["a"] || keys["A"]) b |= 1;
    if (keys["ArrowRight"] || keys["d"] || keys["D"]) b |= 2;
    if (keys["ArrowUp"] || keys["w"] || keys["W"]) b |= 4;
    if (keys["ArrowDown"] || keys["s"] || keys["S"]) b |= 8;
    if (keys["Shift"]) b |= 16;
    if (keys["z"] || keys["Z"] || keys[" "]) b |= 32;
    if (keys["x"] || keys["X"]) b |= 64;
    return b;
  }

  function resetRun(seed) {
    seedRng(seed || (Date.now() & 0xffffffff));
    frame = 0;
    score = 0; graze = 0; pointItem = 0;
    lives = 3; bombs = 2; power = 4.0;
    spellName = ""; spellTimer = 0; difficulty = 1;
    bullets.length = 0; pBullets.length = 0; enemies.length = 0; particles.length = 0;
    boss = null;
    players[0] = makePlayer(mode === "online" ? W * 0.35 : W / 2, H - 64, "#e8eef8", "#e05050");
    players[1] = makePlayer(W * 0.65, H - 64, "#ffe6c8", "#4a8ec8");
    players[0].invuln = 120;
    players[1].invuln = 120;
    if (mode !== "online") players[1].alive = false;
    remoteInputs = Object.create(null);
    localInputQueue = Object.create(null);
    simAcc = 0; lastTs = 0;
    spawnWave();
    updateHUD();
  }

  function spawnWave() {
    for (var i = 0; i < 5; i++) {
      enemies.push({
        x: 40 + i * 76 + (rand() * 10 - 5),
        y: -24 - i * 14,
        hp: 14, t: 0, pattern: i % 3, r: 10
      });
    }
  }

  function spawnBoss() {
    boss = {
      x: W / 2, y: 88, hp: 480, maxHp: 480,
      phase: 0, t: 0, r: 16, name: "Hinanawi Tenshi"
    };
    showSpell('Keystone "Heavenly Fall"');
  }

  function addBullet(x, y, vx, vy, r, color) {
    bullets.push({ x: x, y: y, vx: vx, vy: vy, r: r || 4, color: color || "#ff6b8a", grazed: false });
  }
  function aimed(x, y, tx, ty, spd) {
    var dx = tx - x, dy = ty - y, len = Math.hypot(dx, dy) || 1;
    return { vx: (dx / len) * spd, vy: (dy / len) * spd };
  }
  function nearestPlayer(x, y) {
    var best = players[0], bd = 1e9;
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      if (!p.alive) continue;
      var d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = p; }
    }
    return best || players[0];
  }
  function ring(x, y, n, speed, rot, color, r) {
    for (var i = 0; i < n; i++) {
      var a = rot + (i / n) * Math.PI * 2;
      addBullet(x, y, Math.cos(a) * speed, Math.sin(a) * speed, r || 3.5, color);
    }
  }
  function spiral(x, y, t, arms, speed, color) {
    for (var i = 0; i < arms; i++) {
      var a = t * 0.18 + (i / arms) * Math.PI * 2;
      addBullet(x, y, Math.cos(a) * speed, Math.sin(a) * speed, 3.2, color);
    }
  }
  function burstAimed(x, y, n, spread, speed, color, target) {
    var base = Math.atan2(target.y - y, target.x - x);
    for (var i = 0; i < n; i++) {
      var a = base + (i - (n - 1) / 2) * spread;
      addBullet(x, y, Math.cos(a) * speed, Math.sin(a) * speed, 3.4, color);
    }
  }
  function particle(x, y, color) {
    for (var i = 0; i < 8; i++) {
      var a = rand() * Math.PI * 2, s = 1 + rand() * 3;
      particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 18 + rand() * 14, color: color });
    }
  }

  function firePlayer(p, focus) {
    if (p.shotCd > 0) return;
    p.shotCd = focus ? 3 : 4;
    var dmg = 1.1 + power * 0.15;
    pBullets.push({ x: p.x - 4, y: p.y - 10, vy: -14, vx: 0, r: 3, dmg: dmg, owner: p });
    pBullets.push({ x: p.x + 4, y: p.y - 10, vy: -14, vx: 0, r: 3, dmg: dmg, owner: p });
    if (!focus) {
      pBullets.push({ x: p.x - 14, y: p.y - 4, vy: -11, vx: -0.7, r: 2.5, dmg: dmg * 0.65, owner: p });
      pBullets.push({ x: p.x + 14, y: p.y - 4, vy: -11, vx: 0.7, r: 2.5, dmg: dmg * 0.65, owner: p });
    } else {
      pBullets.push({ x: p.x, y: p.y - 14, vy: -16.5, vx: 0, r: 2.2, dmg: dmg * 1.35, owner: p });
    }
  }

  function bombFrom(p) {
    if (bombs <= 0) return;
    bombs--;
    p.invuln = Math.max(p.invuln, 100);
    bullets.length = 0;
    particle(p.x, p.y, "#ffe6a0");
    particle(p.x, p.y, "#ffb089");
    enemies.forEach(function (e) { e.hp -= 45; });
    if (boss) boss.hp -= 60;
    score += 500;
    showSpell('Bomb "Peach Blossom Seal"');
    updateHUD();
  }

  function killPlayer(p) {
    if (p.invuln > 0 || !p.alive) return;
    lives--;
    particle(p.x, p.y, "#8ec8f0");
    p.invuln = 150;
    p.x = p === players[0] ? (mode === "online" ? W * 0.35 : W / 2) : W * 0.65;
    p.y = H - 64;
    bullets.length = 0;
    if (lives <= 0) {
      lives = 0;
      p.alive = false;
      // game over if all local-relevant players dead
      var any = players.some(function (pl) { return pl.alive; });
      if (!any || mode === "solo") {
        state = STATE.DEAD;
        showOverlay("GAME OVER", "Score " + score + "  ·  Press Z", "敗北");
        if (score > hiScore) {
          hiScore = score;
          try { localStorage.setItem("th-hiscore", String(hiScore)); } catch (e) {}
        }
      }
    }
    updateHUD();
  }

  function applyInput(p, bits) {
    if (!p.alive) return;
    var focus = !!(bits & 16);
    var spd = focus ? p.focusSpeed : p.speed;
    var mx = 0, my = 0;
    if (bits & 1) mx -= 1;
    if (bits & 2) mx += 1;
    if (bits & 4) my -= 1;
    if (bits & 8) my += 1;
    if (mx || my) {
      var len = Math.hypot(mx, my);
      p.x += (mx / len) * spd;
      p.y += (my / len) * spd;
    }
    p.x = Math.max(12, Math.min(W - 12, p.x));
    p.y = Math.max(12, Math.min(H - 12, p.y));
    if (p.shotCd > 0) p.shotCd--;
    if (p.invuln > 0) p.invuln--;
    if (bits & 32) firePlayer(p, focus);
    if (bits & 64) bombFrom(p);
  }

  function simStep(input0, input1) {
    if (state !== STATE.PLAY) return;
    frame++;
    if (spellTimer > 0) spellTimer--;

    applyInput(players[0], input0);
    if (mode === "online") applyInput(players[1], input1);

    // player bullets
    for (var i = pBullets.length - 1; i >= 0; i--) {
      var pb = pBullets[i];
      pb.x += pb.vx || 0;
      pb.y += pb.vy;
      if (pb.y < -20 || pb.x < -20 || pb.x > W + 20) { pBullets.splice(i, 1); continue; }
      var hit = false;
      for (var j = enemies.length - 1; j >= 0; j--) {
        var e = enemies[j];
        if (Math.hypot(pb.x - e.x, pb.y - e.y) < e.r + pb.r) {
          e.hp -= pb.dmg;
          pBullets.splice(i, 1);
          score += 20;
          hit = true;
          if (e.hp <= 0) {
            particle(e.x, e.y, "#a8d4f0");
            enemies.splice(j, 1);
            score += 250;
            pointItem += 1;
            if (power < 4) power = Math.min(4, power + 0.05);
          }
          break;
        }
      }
      if (hit) continue;
      if (boss && Math.hypot(pb.x - boss.x, pb.y - boss.y) < boss.r + pb.r) {
        boss.hp -= pb.dmg;
        pBullets.splice(i, 1);
        score += 30;
      }
    }

    enemies.forEach(function (e) {
      e.t++;
      e.y += 0.72;
      var tgt = nearestPlayer(e.x, e.y);
      if (e.pattern === 0 && e.t % 45 === 0) {
        var v = aimed(e.x, e.y, tgt.x, tgt.y, 2.25);
        addBullet(e.x, e.y, v.vx, v.vy, 4, "#ff7a9a");
      } else if (e.pattern === 1 && e.t % 55 === 0) {
        ring(e.x, e.y, 10, 1.85, e.t * 0.1, "#7ec8ff", 3.2);
      } else if (e.pattern === 2 && e.t % 40 === 0) {
        burstAimed(e.x, e.y, 3, 0.18, 2.45, "#c9a0ff", tgt);
      }
    });
    enemies = enemies.filter(function (e) { return e.y < H + 40 && e.hp > 0; });

    if (!boss && frame === 900) spawnBoss();
    if (!boss && enemies.length === 0 && frame > 120 && frame < 900 && frame % 280 === 0) {
      spawnWave();
      difficulty += 0.12;
    }

    if (boss) {
      boss.t++;
      boss.x = W / 2 + Math.sin(boss.t * 0.02) * 72;
      boss.y = 88 + Math.sin(boss.t * 0.015) * 12;
      var tgtB = nearestPlayer(boss.x, boss.y);
      var hpR = boss.hp / boss.maxHp;
      if (hpR < 0.66 && boss.phase === 0) {
        boss.phase = 1; bullets.length = 0;
        showSpell('Earth Sign "Sword of Hisou"');
      }
      if (hpR < 0.33 && boss.phase === 1) {
        boss.phase = 2; bullets.length = 0;
        showSpell('Spirit "Scarlet Weather Prayer"');
      }
      if (boss.phase === 0) {
        if (boss.t % 18 === 0) spiral(boss.x, boss.y, boss.t, 3, 2.05, "#ffb089");
        if (boss.t % 70 === 0) ring(boss.x, boss.y, 16, 1.65, boss.t, "#ffe6a0", 3.5);
      } else if (boss.phase === 1) {
        if (boss.t % 12 === 0) spiral(boss.x, boss.y, boss.t * 1.3, 4, 2.35, "#ff7a55");
        if (boss.t % 50 === 0) burstAimed(boss.x, boss.y, 7, 0.12, 2.85, "#ffd0b5", tgtB);
        if (boss.t % 90 === 0) ring(boss.x, boss.y, 24, 1.45, 0, "#f0c14b", 3);
      } else {
        if (boss.t % 8 === 0) spiral(boss.x, boss.y + 10, boss.t * 1.6, 5, 2.55, "#ff6b8a");
        if (boss.t % 35 === 0) {
          ring(boss.x, boss.y, 20, 2.05, boss.t * 0.2, "#8ec8f0", 3.2);
          ring(boss.x, boss.y, 20, 1.45, -boss.t * 0.2, "#ffb089", 3.2);
        }
        if (boss.t % 100 === 0) {
          for (var k = 0; k < 8; k++) addBullet(30 + k * 45, -10, 0, 2.25 + rand(), 5, "#d4a574");
        }
      }
      if (boss.hp <= 0) {
        particle(boss.x, boss.y, "#ffe6a0");
        particle(boss.x, boss.y, "#ffb089");
        score += 25000;
        boss = null;
        bullets.length = 0;
        state = STATE.CLEAR;
        showOverlay("STAGE CLEAR", "Score " + score + "  ·  Press Z", "クリア");
        if (score > hiScore) {
          hiScore = score;
          try { localStorage.setItem("th-hiscore", String(hiScore)); } catch (e) {}
        }
      }
    }

    // enemy bullets vs players
    for (var b = bullets.length - 1; b >= 0; b--) {
      var bl = bullets[b];
      if (!bl) continue;
      bl.x += bl.vx; bl.y += bl.vy;
      if (bl.x < -30 || bl.x > W + 30 || bl.y < -30 || bl.y > H + 30) {
        bullets.splice(b, 1);
        continue;
      }
      for (var pi = 0; pi < players.length; pi++) {
        var pl = players[pi];
        if (!pl.alive) continue;
        var dist = Math.hypot(bl.x - pl.x, bl.y - pl.y);
        if (!bl.grazed && dist < bl.r + 18 && dist > bl.r + pl.r) {
          bl.grazed = true;
          graze++;
          score += 10;
        }
        if (pl.invuln <= 0 && dist < bl.r + pl.r) {
          killPlayer(pl);
          bullets.splice(b, 1);
          break;
        }
      }
    }
    if (bullets.length > 1000) bullets.splice(0, bullets.length - 1000);

    for (var p = particles.length - 1; p >= 0; p--) {
      var pt = particles[p];
      pt.x += pt.vx; pt.y += pt.vy; pt.life--;
      if (pt.life <= 0) particles.splice(p, 1);
    }
    updateHUD();
  }

  /* ——— Rendering (Touhou-ish playfield) ——— */
  function drawBg() {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#1a1028");
    g.addColorStop(0.45, "#12203a");
    g.addColorStop(1, "#0c1828");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // subtle scanlines / grid
    ctx.strokeStyle = "rgba(255,200,200,0.04)";
    ctx.lineWidth = 1;
    var off = (frame * 0.4) % 28;
    for (var y = off; y < H; y += 28) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    // border glow inside playfield
    ctx.strokeStyle = "rgba(255, 120, 120, 0.25)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);
  }

  function drawBullet(bl) {
    ctx.beginPath();
    ctx.fillStyle = bl.color;
    ctx.globalAlpha = 0.92;
    ctx.arc(bl.x, bl.y, bl.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = "#fff";
    ctx.globalAlpha = 1;
    ctx.arc(bl.x, bl.y, bl.r * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawShip(p, idx) {
    if (!p.alive) return;
    if (p.invuln > 0 && Math.floor(p.invuln / 3) % 2 === 0) return;
    var focus = false; // visual only from last local if needed
    ctx.save();
    ctx.translate(p.x, p.y);
    // options
    var ox = 14;
    ctx.fillStyle = p.color2;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(-ox, 8, 3.5, 0, Math.PI * 2);
    ctx.arc(ox, 8, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    // body
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(9, 11);
    ctx.lineTo(-9, 11);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = p.color2;
    ctx.fillRect(-7, -1, 14, 3);
    ctx.fillStyle = "#f5d0b0";
    ctx.beginPath();
    ctx.arc(0, -13, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = idx === 0 ? "#2a2030" : "#3a2a18";
    ctx.beginPath();
    ctx.arc(0, -15, 5.5, Math.PI, 0);
    ctx.fill();
    // hitbox always small white/red when focused — approximate: show thin ring
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, p.r + 1.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawEnemy(e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.fillStyle = "#9ad0ff";
    ctx.beginPath();
    ctx.arc(0, 0, e.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.beginPath();
    ctx.arc(-2, -2, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(200,230,255,0.45)";
    ctx.beginPath();
    ctx.ellipse(-12, 0, 8, 4, -0.4, 0, Math.PI * 2);
    ctx.ellipse(12, 0, 8, 4, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawBoss() {
    if (!boss) return;
    ctx.save();
    ctx.translate(boss.x, boss.y);
    var grd = ctx.createRadialGradient(0, 0, 4, 0, 0, 42);
    grd.addColorStop(0, "rgba(255,176,137,0.5)");
    grd.addColorStop(1, "transparent");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(0, 0, 42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff6f0";
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(14, 16);
    ctx.lineTo(-14, 16);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#2a6a9a";
    ctx.fillRect(-10, 0, 20, 5);
    ctx.fillStyle = "#f5d0b0";
    ctx.beginPath();
    ctx.arc(0, -20, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e8c070";
    ctx.beginPath();
    ctx.arc(0, -28, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c4a574";
    ctx.fillRect(-4, 18, 8, 10);
    ctx.restore();

    // HP under top
    var bw = 220, bx = (W - bw) / 2, by = 10;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(bx - 2, by - 2, bw + 4, 9);
    ctx.fillStyle = "#401820";
    ctx.fillRect(bx, by, bw, 5);
    var pct = Math.max(0, boss.hp / boss.maxHp);
    var hg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    hg.addColorStop(0, "#ff4050");
    hg.addColorStop(1, "#ffd060");
    ctx.fillStyle = hg;
    ctx.fillRect(bx, by, bw * pct, 5);
    ctx.fillStyle = "#ffd0b0";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(boss.name, W / 2, by + 16);
  }

  function draw() {
    drawBg();
    particles.forEach(function (pt) {
      ctx.globalAlpha = Math.max(0, pt.life / 28);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x, pt.y, 2, 2);
      ctx.globalAlpha = 1;
    });
    enemies.forEach(drawEnemy);
    drawBoss();
    pBullets.forEach(function (pb) {
      ctx.fillStyle = "#c8ecff";
      ctx.beginPath();
      ctx.arc(pb.x, pb.y, pb.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(pb.x, pb.y, pb.r * 0.4, 0, Math.PI * 2);
      ctx.fill();
    });
    bullets.forEach(drawBullet);
    drawShip(players[0], 0);
    if (mode === "online") drawShip(players[1], 1);

    // name tags online
    if (mode === "online" && state === STATE.PLAY) {
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      for (var i = 0; i < 2; i++) {
        if (!players[i].alive) continue;
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(players[i].x - 24, players[i].y + 14, 48, 12);
        ctx.fillStyle = i === 0 ? "#ffb0b0" : "#b0d8ff";
        ctx.fillText(peerNames[i] || ("P" + (i + 1)), players[i].x, players[i].y + 23);
      }
    }
  }

  /* ——— Lockstep ——— */
  function ensureInput(f, seat, bits) {
    if (!remoteInputs[f]) remoteInputs[f] = {};
    remoteInputs[f][seat] = bits;
  }

  function trySim() {
    if (state !== STATE.PLAY) return;
    if (mode === "solo") {
      var bits = bitsFromKeys();
      simStep(bits, 0);
      // one-shot bomb (don't hold-fire bombs every frame)
      if (keys["x"] || keys["X"]) keys["x"] = keys["X"] = false;
      return;
    }
    // online lockstep: sample local input for frame+delay once
    var target = frame + INPUT_DELAY;
    if (localInputQueue[target] === undefined) {
      var lb = bitsFromKeys();
      localInputQueue[target] = lb;
      ensureInput(target, localSeat, lb);
      send({ t: "inp", f: target, b: lb, s: localSeat });
      if (keys["x"] || keys["X"]) keys["x"] = keys["X"] = false;
    }
    // advance as many frames as we have both peers' inputs
    var advanced = 0;
    while (advanced < 3) {
      var need = remoteInputs[frame];
      if (!need || need[0] === undefined || need[1] === undefined) break;
      simStep(need[0], need[1]);
      delete remoteInputs[frame - 2];
      delete localInputQueue[frame - 2];
      advanced++;
    }
  }

  function loop(ts) {
    if (typeof ts !== "number") ts = performance.now();
    if (!lastTs) lastTs = ts;
    var dt = ts - lastTs;
    lastTs = ts;
    if (dt > 100) dt = 100;
    try {
      if (state === STATE.PLAY) {
        simAcc += dt;
        var steps = 0;
        while (simAcc >= FIXED_MS && steps < 5) {
          trySim();
          simAcc -= FIXED_MS;
          steps++;
          // if online and waiting on remote input, don't burn steps
          if (mode === "online") {
            var need = remoteInputs[frame];
            if (!need || need[0] === undefined || need[1] === undefined) {
              // still increment time budget carefully — trySim already no-op sim
              // but frame doesn't advance without both inputs, so break to avoid spin
              if (localInputQueue[frame + INPUT_DELAY] !== undefined) break;
            }
          }
        }
        if (steps === 5) simAcc = 0;
      } else {
        simAcc = 0;
      }
      draw();
    } catch (err) {
      if (console && console.error) console.error("[danmaku]", err);
    }
    requestAnimationFrame(loop);
  }

  /* ——— Networking (PeerJS) ——— */
  function peerReady() {
    return typeof Peer !== "undefined";
  }

  function destroyPeer() {
    matchmaking = false;
    waitingForPeer = false;
    try { if (conn) conn.close(); } catch (e) {}
    try { if (peer) peer.destroy(); } catch (e) {}
    conn = null;
    peer = null;
    netRole = null;
    if (el.netCancel) el.netCancel.hidden = true;
  }

  function send(obj) {
    if (conn && conn.open) {
      try { conn.send(obj); } catch (e) {}
    }
  }

  function onData(data) {
    if (!data || !data.t) return;
    if (data.t === "hello") {
      peerNames[data.seat | 0] = data.name || peerNames[data.seat | 0];
      setPeers(peerNames[0] + "  ×  " + peerNames[1]);
      if (netRole === "host" && state === STATE.LOBBY) {
        var seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
        send({ t: "start", seed: seed, names: peerNames });
        beginOnline(seed);
      }
    } else if (data.t === "start") {
      peerNames = data.names || peerNames;
      setPeers(peerNames[0] + "  ×  " + peerNames[1]);
      beginOnline(data.seed);
    } else if (data.t === "inp") {
      ensureInput(data.f, data.s, data.b);
    } else if (data.t === "chat") {
      // ignore
    }
  }

  function wireConn(c, role) {
    conn = c;
    netRole = role;
    c.on("data", onData);
    c.on("close", function () {
      setStatus("Peer disconnected.");
      setPeers("");
      if (state === STATE.PLAY) {
        state = STATE.MENU;
        showOverlay("DISCONNECT", "Opponent left the stage", "切断");
      }
      destroyPeer();
    });
    c.on("error", function () {
      setStatus("Connection error.");
    });
    c.on("open", function () {
      waitingForPeer = false;
      matchmaking = false;
      if (el.netCancel) el.netCancel.hidden = true;
      setStatus("Linked! Starting co-op…");
      localSeat = role === "host" ? 0 : 1;
      peerNames[localSeat] = (el.name && el.name.value.trim()) || (role === "host" ? "Host" : "Guest");
      send({ t: "hello", seat: localSeat, name: peerNames[localSeat] });
      mode = "online";
      state = STATE.LOBBY;
      showOverlay("CO-OP READY", "Waiting for handshake…", "接続");
    });
  }

  function beginOnline(seed) {
    mode = "online";
    state = STATE.PLAY;
    hideOverlay();
    resetRun(seed);
    // prefill delayed empty inputs
    for (var f = 0; f < INPUT_DELAY; f++) {
      ensureInput(f, 0, 0);
      ensureInput(f, 1, 0);
      localInputQueue[f] = 0;
    }
    setStatus("Online co-op — good luck!");
    canvas.focus();
  }

  function makeRoomCode() {
    var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var s = "";
    for (var i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  function hostRoom(code) {
    if (!peerReady()) {
      setStatus("PeerJS failed to load. Check network / adblock.");
      return;
    }
    destroyPeer();
    var id = "cpdan-" + code.toLowerCase();
    setStatus("Hosting room " + code + "… share this code.");
    if (el.room) el.room.value = code;
    if (el.netCancel) el.netCancel.hidden = false;
    waitingForPeer = true;
    peer = new Peer(id, { debug: 0 });
    peer.on("open", function () {
      setStatus("Room " + code + " open — waiting for a friend…");
    });
    peer.on("connection", function (c) {
      wireConn(c, "host");
    });
    peer.on("error", function (err) {
      setStatus("Host error: " + (err.type || err));
      destroyPeer();
    });
  }

  function joinRoom(code) {
    if (!peerReady()) {
      setStatus("PeerJS failed to load. Check network / adblock.");
      return;
    }
    destroyPeer();
    code = (code || "").trim().toUpperCase();
    if (code.length < 4) {
      setStatus("Enter a valid room code.");
      return;
    }
    setStatus("Joining " + code + "…");
    if (el.netCancel) el.netCancel.hidden = false;
    peer = new Peer({ debug: 0 });
    peer.on("open", function () {
      var c = peer.connect("cpdan-" + code.toLowerCase(), { reliable: true });
      wireConn(c, "guest");
    });
    peer.on("error", function (err) {
      setStatus("Join error: " + (err.type || err) + " — is the host online?");
      destroyPeer();
    });
  }

  // Quick match: race host/join across timed slots
  function quickMatch() {
    if (!peerReady()) {
      setStatus("PeerJS failed to load. Check network / adblock.");
      return;
    }
    destroyPeer();
    matchmaking = true;
    if (el.netCancel) el.netCancel.hidden = false;
    setStatus("Quick match — searching…");
    var bucket = Math.floor(Date.now() / 20000);
    var slot = 0;
    var maxSlot = 24;

    function trySlot() {
      if (!matchmaking) return;
      if (slot >= maxSlot) {
        // next time bucket
        bucket = Math.floor(Date.now() / 20000);
        slot = 0;
      }
      var id = "cpqm" + bucket + "s" + slot;
      setStatus("Quick match — probing lobby " + (slot + 1) + "/" + maxSlot + "…");
      var p = new Peer(id, { debug: 0 });
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        // hosting and waiting a bit for someone
      }, 100);

      p.on("open", function () {
        // We got the ID — we are host of this slot
        settled = true;
        peer = p;
        netRole = "host";
        localSeat = 0;
        setStatus("Quick match — waiting in lobby " + (slot + 1) + "…");
        p.on("connection", function (c) {
          if (!matchmaking && conn) return;
          matchmaking = false;
          wireConn(c, "host");
        });
        // if no one joins in 6s, abandon and try next slot as guest
        setTimeout(function () {
          if (conn || !matchmaking) return;
          if (peer === p) {
            try { p.destroy(); } catch (e) {}
            peer = null;
            slot++;
            trySlot();
          }
        }, 6000);
      });

      p.on("error", function (err) {
        if (settled) return;
        // ID taken — try join as guest
        try { p.destroy(); } catch (e) {}
        var p2 = new Peer({ debug: 0 });
        p2.on("open", function () {
          var c = p2.connect(id, { reliable: true });
          var joined = false;
          c.on("open", function () {
            joined = true;
            matchmaking = false;
            peer = p2;
            wireConn(c, "guest");
          });
          c.on("error", function () {
            try { p2.destroy(); } catch (e) {}
            slot++;
            trySlot();
          });
          setTimeout(function () {
            if (!joined && matchmaking) {
              try { c.close(); p2.destroy(); } catch (e) {}
              slot++;
              trySlot();
            }
          }, 2500);
        });
        p2.on("error", function () {
          slot++;
          trySlot();
        });
      });
    }
    trySlot();
  }

  function startSolo() {
    destroyPeer();
    mode = "solo";
    state = STATE.PLAY;
    hideOverlay();
    resetRun((Date.now() & 0xffffffff) ^ 0x9e3779b9);
    setStatus("Solo run — clear the celestial stage.");
    canvas.focus();
  }

  /* ——— UI wiring ——— */
  var selectedMode = "solo";
  document.querySelectorAll("[data-mode]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll("[data-mode]").forEach(function (b) { b.classList.remove("is-active"); });
      btn.classList.add("is-active");
      selectedMode = btn.getAttribute("data-mode");
      if (selectedMode === "solo") {
        setStatus("Solo mode — focus the playfield and press Z.");
        if (el.roomField) el.roomField.style.opacity = "0.4";
      } else if (selectedMode === "host") {
        setStatus("Host: click Connect to create a room code.");
        if (el.roomField) el.roomField.style.opacity = "1";
      } else if (selectedMode === "join") {
        setStatus("Join: enter a room code, then Connect.");
        if (el.roomField) el.roomField.style.opacity = "1";
      } else {
        setStatus("Quick match: Connect to find a random co-op partner.");
        if (el.roomField) el.roomField.style.opacity = "0.4";
      }
    });
  });

  if (el.netGo) {
    el.netGo.addEventListener("click", function () {
      if (selectedMode === "solo") {
        startSolo();
      } else if (selectedMode === "host") {
        hostRoom(makeRoomCode());
      } else if (selectedMode === "join") {
        joinRoom(el.room && el.room.value);
      } else if (selectedMode === "quick") {
        quickMatch();
      }
    });
  }
  if (el.netCancel) {
    el.netCancel.addEventListener("click", function () {
      destroyPeer();
      setStatus("Cancelled.");
      state = STATE.MENU;
      showOverlay("PLAYER SELECT", "Choose a mode, then Connect / press Z", "霊撃");
    });
  }

  window.addEventListener("keydown", function (e) {
    keys[e.key] = true;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].indexOf(e.key) >= 0) {
      if (state === STATE.PLAY) e.preventDefault();
    }
    if (e.key === "Escape" && mode === "solo" && state === STATE.PLAY) {
      state = STATE.PAUSE;
      showOverlay("PAUSE", "Esc to resume", "停止");
    } else if (e.key === "Escape" && mode === "solo" && state === STATE.PAUSE) {
      state = STATE.PLAY;
      hideOverlay();
    }
    if ((e.key === "z" || e.key === "Z" || e.key === " ") &&
        (state === STATE.MENU || state === STATE.DEAD || state === STATE.CLEAR)) {
      if (selectedMode === "solo" || mode === "solo") {
        e.preventDefault();
        startSolo();
      }
    }
  });
  window.addEventListener("keyup", function (e) { keys[e.key] = false; });

  canvas.addEventListener("click", function () {
    canvas.focus();
    if (state === STATE.MENU || state === STATE.DEAD || state === STATE.CLEAR) {
      if (selectedMode === "solo") startSolo();
    }
  });

  // touch: move local seat
  var touchId = null;
  canvas.addEventListener("touchstart", function (e) {
    e.preventDefault();
    if (state === STATE.MENU || state === STATE.DEAD || state === STATE.CLEAR) {
      if (selectedMode === "solo") startSolo();
    }
    var t = e.changedTouches[0];
    touchId = t.identifier;
    keys[" "] = true;
    keys["Shift"] = true;
  }, { passive: false });
  canvas.addEventListener("touchmove", function (e) {
    e.preventDefault();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (t.identifier === touchId) {
        var rect = canvas.getBoundingClientRect();
        var sx = (t.clientX - rect.left) * (W / rect.width);
        var sy = (t.clientY - rect.top) * (H / rect.height);
        // inject as synthetic for solo by moving player directly when solo
        if (mode === "solo" && state === STATE.PLAY) {
          players[0].x = Math.max(12, Math.min(W - 12, sx));
          players[0].y = Math.max(12, Math.min(H - 12, sy));
        }
      }
    }
  }, { passive: false });
  canvas.addEventListener("touchend", function () {
    touchId = null;
    keys[" "] = false;
  });

  // Load PeerJS dynamically
  function loadPeerJs(cb) {
    if (typeof Peer !== "undefined") { cb(); return; }
    var s = document.createElement("script");
    s.src = "https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js";
    s.async = true;
    s.onload = function () { cb(); };
    s.onerror = function () {
      setStatus("Could not load PeerJS — online modes unavailable (solo still works).");
    };
    document.head.appendChild(s);
  }

  showOverlay("PLAYER SELECT", "Solo: press Z  ·  Online: pick Host / Join / Quick match", "霊撃");
  updateHUD();
  loadPeerJs(function () {
    setStatus("Solo ready. Online modes available when PeerJS is loaded.");
  });
  requestAnimationFrame(loop);
})();

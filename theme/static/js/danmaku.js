/**
 * Celestial Peak — mini danmaku demo
 * Touhou-inspired controls & bullet aesthetics (original code; not a port).
 * Z/Space fire · Shift focus · Arrows/WASD move · X bomb · P/Esc pause
 */
(function () {
  "use strict";

  var canvas = document.getElementById("danmaku-canvas");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  var wrap = document.getElementById("danmaku-demo");

  var W = 384;
  var H = 448;
  canvas.width = W;
  canvas.height = H;

  var STATE = { MENU: 0, PLAY: 1, PAUSE: 2, CLEAR: 3, DEAD: 4 };
  var state = STATE.MENU;

  var keys = Object.create(null);
  var score = 0;
  var graze = 0;
  var lives = 3;
  var bombs = 2;
  var invuln = 0;
  var time = 0;
  var spellName = "";
  var spellTimer = 0;
  var difficulty = 1;

  var player = {
    x: W / 2,
    y: H - 64,
    r: 2.4,
    speed: 4.2,
    focusSpeed: 1.85,
    shotCd: 0,
    options: 0
  };

  var bullets = [];
  var pBullets = [];
  var enemies = [];
  var particles = [];
  var boss = null;

  function resetRun() {
    score = 0;
    graze = 0;
    lives = 3;
    bombs = 2;
    invuln = 120;
    time = 0;
    difficulty = 1;
    bullets.length = 0;
    pBullets.length = 0;
    enemies.length = 0;
    particles.length = 0;
    player.x = W / 2;
    player.y = H - 64;
    player.shotCd = 0;
    boss = null;
    spellName = "";
    spellTimer = 0;
    spawnWave(0);
  }

  function spawnWave(t) {
    // fairies from top
    for (var i = 0; i < 5; i++) {
      enemies.push({
        type: "fairy",
        x: 48 + i * 72,
        y: -20 - i * 12,
        hp: 12,
        maxHp: 12,
        t: 0,
        pattern: i % 3,
        r: 10,
        dead: false
      });
    }
  }

  function spawnBoss() {
    boss = {
      x: W / 2,
      y: 90,
      hp: 420,
      maxHp: 420,
      phase: 0,
      t: 0,
      r: 16,
      dead: false,
      name: "Hinanawi Tenshi"
    };
    spellCard("Keystone \"Heavenly Fall\"");
  }

  function spellCard(name) {
    spellName = name;
    spellTimer = 150;
  }

  function addBullet(x, y, vx, vy, r, color, glow) {
    bullets.push({
      x: x, y: y, vx: vx, vy: vy,
      r: r || 4,
      color: color || "#ff6b8a",
      glow: glow || "#fff",
      grazed: false
    });
  }

  function aimed(fromX, fromY, toX, toY, speed) {
    var dx = toX - fromX;
    var dy = toY - fromY;
    var len = Math.hypot(dx, dy) || 1;
    return { vx: (dx / len) * speed, vy: (dy / len) * speed };
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

  function burstAimed(x, y, n, spread, speed, color) {
    var base = Math.atan2(player.y - y, player.x - x);
    for (var i = 0; i < n; i++) {
      var a = base + (i - (n - 1) / 2) * spread;
      addBullet(x, y, Math.cos(a) * speed, Math.sin(a) * speed, 3.4, color);
    }
  }

  function particle(x, y, color) {
    for (var i = 0; i < 8; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = 1 + Math.random() * 3;
      particles.push({
        x: x, y: y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 20 + Math.random() * 15,
        color: color
      });
    }
  }

  function firePlayer() {
    if (player.shotCd > 0) return;
    player.shotCd = keys["Shift"] ? 3 : 4;
    var focus = keys["Shift"];
    pBullets.push({ x: player.x - 4, y: player.y - 10, vy: -14, r: 3, dmg: 1.2 });
    pBullets.push({ x: player.x + 4, y: player.y - 10, vy: -14, r: 3, dmg: 1.2 });
    if (!focus) {
      pBullets.push({ x: player.x - 14, y: player.y - 4, vy: -11, vx: -0.6, r: 2.5, dmg: 0.7 });
      pBullets.push({ x: player.x + 14, y: player.y - 4, vy: -11, vx: 0.6, r: 2.5, dmg: 0.7 });
    } else {
      pBullets.push({ x: player.x, y: player.y - 14, vy: -16, r: 2.2, dmg: 1.6 });
    }
  }

  function bomb() {
    if (bombs <= 0 || invuln > 90) return;
    bombs--;
    invuln = 100;
    bullets.length = 0;
    particle(player.x, player.y, "#ffe6a0");
    particle(player.x, player.y, "#ffb089");
    // damage all on screen
    enemies.forEach(function (e) { e.hp -= 40; });
    if (boss) boss.hp -= 55;
    score += 500;
    spellCard("Bomb \"Peach Blossom Seal\"");
  }

  function killPlayer() {
    if (invuln > 0) return;
    lives--;
    particle(player.x, player.y, "#8ec8f0");
    bullets.length = 0;
    invuln = 150;
    player.x = W / 2;
    player.y = H - 64;
    if (lives < 0) {
      state = STATE.DEAD;
    }
  }

  function update() {
    if (state !== STATE.PLAY) return;
    time++;
    if (invuln > 0) invuln--;
    if (spellTimer > 0) spellTimer--;
    if (player.shotCd > 0) player.shotCd--;

    // movement
    var spd = keys["Shift"] ? player.focusSpeed : player.speed;
    var mx = 0, my = 0;
    if (keys["ArrowLeft"] || keys["a"] || keys["A"]) mx -= 1;
    if (keys["ArrowRight"] || keys["d"] || keys["D"]) mx += 1;
    if (keys["ArrowUp"] || keys["w"] || keys["W"]) my -= 1;
    if (keys["ArrowDown"] || keys["s"] || keys["S"]) my += 1;
    if (mx || my) {
      var len = Math.hypot(mx, my);
      player.x += (mx / len) * spd;
      player.y += (my / len) * spd;
    }
    player.x = Math.max(12, Math.min(W - 12, player.x));
    player.y = Math.max(12, Math.min(H - 12, player.y));

    if (keys["z"] || keys["Z"] || keys[" "]) firePlayer();

    // player bullets
    for (var i = pBullets.length - 1; i >= 0; i--) {
      var pb = pBullets[i];
      pb.x += pb.vx || 0;
      pb.y += pb.vy;
      if (pb.y < -20) { pBullets.splice(i, 1); continue; }
      // hit enemies
      for (var j = enemies.length - 1; j >= 0; j--) {
        var e = enemies[j];
        if (Math.hypot(pb.x - e.x, pb.y - e.y) < e.r + pb.r) {
          e.hp -= pb.dmg;
          pBullets.splice(i, 1);
          score += 10;
          if (e.hp <= 0) {
            particle(e.x, e.y, "#a8d4f0");
            enemies.splice(j, 1);
            score += 200;
          }
          break;
        }
      }
      if (!pBullets[i]) continue;
      if (boss && Math.hypot(pb.x - boss.x, pb.y - boss.y) < boss.r + pb.r) {
        boss.hp -= pb.dmg;
        pBullets.splice(i, 1);
        score += 20;
      }
    }

    // enemy AI
    enemies.forEach(function (e) {
      e.t++;
      e.y += 0.7;
      if (e.pattern === 0 && e.t % 45 === 0) {
        var v = aimed(e.x, e.y, player.x, player.y, 2.2);
        addBullet(e.x, e.y, v.vx, v.vy, 4, "#ff7a9a");
      } else if (e.pattern === 1 && e.t % 55 === 0) {
        ring(e.x, e.y, 10, 1.8, e.t * 0.1, "#7ec8ff", 3.2);
      } else if (e.pattern === 2 && e.t % 40 === 0) {
        burstAimed(e.x, e.y, 3, 0.18, 2.4, "#c9a0ff");
      }
    });
    enemies = enemies.filter(function (e) { return e.y < H + 40 && e.hp > 0; });

    // boss
    if (!boss && time === 900) {
      spawnBoss();
    }
    if (!boss && enemies.length === 0 && time > 120 && time < 900 && time % 280 === 0) {
      spawnWave(time);
      difficulty += 0.15;
    }

    if (boss) {
      boss.t++;
      boss.x = W / 2 + Math.sin(boss.t * 0.02) * 70;
      boss.y = 90 + Math.sin(boss.t * 0.015) * 12;

      // phase transitions
      var hpRatio = boss.hp / boss.maxHp;
      if (hpRatio < 0.66 && boss.phase === 0) {
        boss.phase = 1;
        bullets.length = 0;
        spellCard("Earth Sign \"Sword of Hisou\"");
      }
      if (hpRatio < 0.33 && boss.phase === 1) {
        boss.phase = 2;
        bullets.length = 0;
        spellCard("Spirit \"Scarlet Weather Prayer\"");
      }

      if (boss.phase === 0) {
        if (boss.t % 18 === 0) spiral(boss.x, boss.y, boss.t, 3, 2.0, "#ffb089");
        if (boss.t % 70 === 0) ring(boss.x, boss.y, 16, 1.6, boss.t, "#ffe6a0", 3.5);
      } else if (boss.phase === 1) {
        if (boss.t % 12 === 0) spiral(boss.x, boss.y, boss.t * 1.3, 4, 2.3, "#ff7a55");
        if (boss.t % 50 === 0) burstAimed(boss.x, boss.y, 7, 0.12, 2.8, "#ffd0b5");
        if (boss.t % 90 === 0) ring(boss.x, boss.y, 24, 1.4, 0, "#f0c14b", 3);
      } else {
        if (boss.t % 8 === 0) spiral(boss.x, boss.y + 10, boss.t * 1.6, 5, 2.5, "#ff6b8a");
        if (boss.t % 35 === 0) {
          ring(boss.x, boss.y, 20, 2.0, boss.t * 0.2, "#8ec8f0", 3.2);
          ring(boss.x, boss.y, 20, 1.4, -boss.t * 0.2, "#ffb089", 3.2);
        }
        if (boss.t % 100 === 0) {
          // keystone rain
          for (var k = 0; k < 8; k++) {
            addBullet(30 + k * 45, -10, 0, 2.2 + Math.random(), 5, "#d4a574", "#fff8e8");
          }
        }
      }

      if (boss.hp <= 0) {
        particle(boss.x, boss.y, "#ffe6a0");
        particle(boss.x, boss.y, "#ffb089");
        score += 20000;
        boss = null;
        bullets.length = 0;
        state = STATE.CLEAR;
      }
    }

    // bullets
    for (var b = bullets.length - 1; b >= 0; b--) {
      var bl = bullets[b];
      bl.x += bl.vx;
      bl.y += bl.vy;
      if (bl.x < -30 || bl.x > W + 30 || bl.y < -30 || bl.y > H + 30) {
        bullets.splice(b, 1);
        continue;
      }
      var dist = Math.hypot(bl.x - player.x, bl.y - player.y);
      // graze
      if (!bl.grazed && dist < bl.r + 18 && dist > bl.r + player.r) {
        bl.grazed = true;
        graze++;
        score += 10;
      }
      // hit
      if (invuln <= 0 && dist < bl.r + player.r) {
        killPlayer();
        bullets.splice(b, 1);
      }
    }

    // particles
    for (var p = particles.length - 1; p >= 0; p--) {
      var pt = particles[p];
      pt.x += pt.vx;
      pt.y += pt.vy;
      pt.life--;
      if (pt.life <= 0) particles.splice(p, 1);
    }

    // soft cap bullets for performance
    if (bullets.length > 900) bullets.splice(0, bullets.length - 900);
  }

  function drawBg() {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0a1a30");
    g.addColorStop(0.5, "#122844");
    g.addColorStop(1, "#1a3048");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // playfield grid / atmosphere
    ctx.strokeStyle = "rgba(142,200,240,0.05)";
    ctx.lineWidth = 1;
    for (var y = (time * 0.5) % 32; y < H; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // side vignette
    var vg = ctx.createLinearGradient(0, 0, W, 0);
    vg.addColorStop(0, "rgba(0,0,0,0.35)");
    vg.addColorStop(0.15, "transparent");
    vg.addColorStop(0.85, "transparent");
    vg.addColorStop(1, "rgba(0,0,0,0.35)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  function drawBullet(bl) {
    // classic danmaku: bright core + colored shell
    ctx.beginPath();
    ctx.fillStyle = bl.color;
    ctx.globalAlpha = 0.9;
    ctx.arc(bl.x, bl.y, bl.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = bl.glow || "#fff";
    ctx.globalAlpha = 1;
    ctx.arc(bl.x, bl.y, bl.r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPlayer() {
    var focus = keys["Shift"];
    var blink = invuln > 0 && Math.floor(invuln / 3) % 2 === 0;
    if (blink) return;

    // options
    var ox = Math.sin(time * 0.12) * (focus ? 10 : 18);
    ctx.fillStyle = "rgba(255,208,181,0.85)";
    ctx.beginPath();
    ctx.arc(player.x - ox, player.y + 6, 4, 0, Math.PI * 2);
    ctx.arc(player.x + ox, player.y + 6, 4, 0, Math.PI * 2);
    ctx.fill();

    // body — simple shrine-maiden-adjacent silhouette (abstract)
    ctx.save();
    ctx.translate(player.x, player.y);
    // dress
    ctx.fillStyle = "#e8eef8";
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(8, 10);
    ctx.lineTo(-8, 10);
    ctx.closePath();
    ctx.fill();
    // accent
    ctx.fillStyle = "#e05050";
    ctx.fillRect(-6, -2, 12, 3);
    // head
    ctx.fillStyle = "#f5d0b0";
    ctx.beginPath();
    ctx.arc(0, -12, 5, 0, Math.PI * 2);
    ctx.fill();
    // hair
    ctx.fillStyle = "#2a2030";
    ctx.beginPath();
    ctx.arc(0, -14, 5.5, Math.PI, 0);
    ctx.fill();

    // hitbox (focus)
    if (focus) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, player.r + 1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#ff4d6a";
      ctx.beginPath();
      ctx.arc(0, 0, player.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawEnemy(e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.fillStyle = "#7ec8ff";
    ctx.beginPath();
    ctx.arc(0, 0, e.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath();
    ctx.arc(-2, -2, 3, 0, Math.PI * 2);
    ctx.fill();
    // wings
    ctx.fillStyle = "rgba(200,230,255,0.5)";
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
    // aura
    var grd = ctx.createRadialGradient(0, 0, 4, 0, 0, 40);
    grd.addColorStop(0, "rgba(255,176,137,0.45)");
    grd.addColorStop(1, "transparent");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(0, 0, 40, 0, Math.PI * 2);
    ctx.fill();

    // body peach celestial abstract
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
    // keystone hint
    ctx.fillStyle = "#c4a574";
    ctx.fillRect(-4, 18, 8, 10);
    ctx.restore();

    // HP bar
    var bw = 200;
    var bx = (W - bw) / 2;
    var by = 14;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(bx - 2, by - 2, bw + 4, 10);
    ctx.fillStyle = "#3a2030";
    ctx.fillRect(bx, by, bw, 6);
    var pct = Math.max(0, boss.hp / boss.maxHp);
    var hg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    hg.addColorStop(0, "#ff7a55");
    hg.addColorStop(1, "#f0c14b");
    ctx.fillStyle = hg;
    ctx.fillRect(bx, by, bw * pct, 6);
    ctx.fillStyle = "#ffe6a0";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(boss.name, W / 2, by + 18);
  }

  function drawHUD() {
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "12px \"Zen Kaku Gothic New\", sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("SCORE  " + String(score).padStart(8, "0"), 10, H - 36);
    ctx.fillText("GRAZE  " + graze, 10, H - 20);
    ctx.textAlign = "right";
    ctx.fillText("LIVES  " + "★".repeat(Math.max(0, lives)), W - 10, H - 36);
    ctx.fillText("BOMB   " + "◆".repeat(Math.max(0, bombs)), W - 10, H - 20);

    if (spellTimer > 0 && spellName) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, spellTimer / 40);
      ctx.fillStyle = "rgba(10,20,40,0.75)";
      ctx.fillRect(20, H / 2 - 28, W - 40, 40);
      ctx.strokeStyle = "rgba(255,176,137,0.8)";
      ctx.strokeRect(20, H / 2 - 28, W - 40, 40);
      ctx.fillStyle = "#ffd0b5";
      ctx.font = "13px \"Cormorant Garamond\", serif";
      ctx.textAlign = "center";
      ctx.fillText(spellName, W / 2, H / 2 - 2);
      ctx.restore();
    }
  }

  function drawOverlay(title, sub) {
    ctx.fillStyle = "rgba(6,13,24,0.72)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#ffd0b5";
    ctx.font = "28px \"Cormorant Garamond\", serif";
    ctx.textAlign = "center";
    ctx.fillText(title, W / 2, H / 2 - 20);
    ctx.fillStyle = "#9aafc4";
    ctx.font = "13px sans-serif";
    ctx.fillText(sub, W / 2, H / 2 + 12);
  }

  function draw() {
    drawBg();

    particles.forEach(function (pt) {
      ctx.globalAlpha = pt.life / 30;
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x, pt.y, 2, 2);
      ctx.globalAlpha = 1;
    });

    enemies.forEach(drawEnemy);
    drawBoss();

    pBullets.forEach(function (pb) {
      ctx.fillStyle = "#b8e0ff";
      ctx.beginPath();
      ctx.arc(pb.x, pb.y, pb.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(pb.x, pb.y, pb.r * 0.4, 0, Math.PI * 2);
      ctx.fill();
    });

    bullets.forEach(drawBullet);

    if (state === STATE.PLAY || state === STATE.PAUSE) drawPlayer();
    drawHUD();

    if (state === STATE.MENU) {
      drawOverlay("東方風 · Danmaku Demo", "Press Z to start  ·  Shift focus  ·  X bomb");
    } else if (state === STATE.PAUSE) {
      drawOverlay("Paused", "Press P or Esc to resume");
    } else if (state === STATE.CLEAR) {
      drawOverlay("Stage Clear!", "Score " + score + "  ·  Press Z to retry");
    } else if (state === STATE.DEAD) {
      drawOverlay("Game Over", "Score " + score + "  ·  Press Z to retry");
    }
  }

  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  window.addEventListener("keydown", function (e) {
    keys[e.key] = true;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].indexOf(e.key) >= 0) {
      if (wrap && wrap.contains(document.activeElement) || document.activeElement === canvas || document.activeElement === document.body) {
        // prevent page scroll when playing
        if (state === STATE.PLAY) e.preventDefault();
      }
    }
    if (e.key === "z" || e.key === "Z" || e.key === " ") {
      if (state === STATE.MENU || state === STATE.DEAD || state === STATE.CLEAR) {
        e.preventDefault();
        resetRun();
        state = STATE.PLAY;
      }
    }
    if (e.key === "x" || e.key === "X") {
      if (state === STATE.PLAY) { e.preventDefault(); bomb(); }
    }
    if (e.key === "p" || e.key === "P" || e.key === "Escape") {
      if (state === STATE.PLAY) state = STATE.PAUSE;
      else if (state === STATE.PAUSE) state = STATE.PLAY;
    }
  });
  window.addEventListener("keyup", function (e) { keys[e.key] = false; });

  // click/tap to start
  canvas.addEventListener("click", function () {
    canvas.focus();
    if (state === STATE.MENU || state === STATE.DEAD || state === STATE.CLEAR) {
      resetRun();
      state = STATE.PLAY;
    }
  });
  canvas.setAttribute("tabindex", "0");

  // touch controls
  var touchId = null;
  canvas.addEventListener("touchstart", function (e) {
    e.preventDefault();
    if (state === STATE.MENU || state === STATE.DEAD || state === STATE.CLEAR) {
      resetRun();
      state = STATE.PLAY;
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
        player.x = Math.max(12, Math.min(W - 12, sx));
        player.y = Math.max(12, Math.min(H - 12, sy));
      }
    }
  }, { passive: false });
  canvas.addEventListener("touchend", function () {
    touchId = null;
    keys[" "] = false;
  });

  // UI buttons
  var btnStart = document.getElementById("danmaku-start");
  var btnBomb = document.getElementById("danmaku-bomb");
  if (btnStart) btnStart.addEventListener("click", function () {
    canvas.focus();
    resetRun();
    state = STATE.PLAY;
  });
  if (btnBomb) btnBomb.addEventListener("click", function () {
    if (state === STATE.PLAY) bomb();
  });

  loop();
})();

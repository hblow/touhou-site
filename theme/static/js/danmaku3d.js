/**
 * Celestial Peak — 3D corridor danmaku (Three.js)
 * Homage to old "Touhou in 3D" experiments. Two stages + infinite lives.
 */
(function () {
  "use strict";

  var shell = document.getElementById("danmaku-demo-3d");
  var canvas = document.getElementById("danmaku-canvas-3d");
  if (!shell || !canvas) return;

  var el = {
    overlay: document.getElementById("th3d-overlay"),
    overlayTitle: document.getElementById("th3d-overlay-title"),
    overlaySub: document.getElementById("th3d-overlay-sub"),
    overlayJp: document.getElementById("th3d-overlay-jp"),
    spell: document.getElementById("th3d-spell"),
    spellName: document.getElementById("th3d-spell-name"),
    score: document.getElementById("th3d-score"),
    lives: document.getElementById("th3d-lives"),
    bombs: document.getElementById("th3d-bombs"),
    graze: document.getElementById("th3d-graze"),
    status: document.getElementById("th3d-status"),
    stageTitle: document.getElementById("th3d-stage-title"),
    infinite: document.getElementById("th3d-infinite"),
    start: document.getElementById("th3d-start")
  };

  var STAGES = {
    1: {
      name: "Stage 1 · Cloud Sea Approach",
      fog: 0xa8d4f0,
      clear: 0x6a9fd4,
      ambient: 0xffe0c8,
      dir: 0xffc8a0,
      railColor: 0xffffff,
      enemyColor: 0x88ccff,
      bulletA: 0xff3366,
      bulletB: 0x44eeff,
      bossColor: 0xffd0a0,
      duration: 55,
      bossAt: 32
    },
    2: {
      name: "Stage 2 · Scarlet Weather Abyss",
      fog: 0x401018,
      clear: 0x1a080c,
      ambient: 0xff6060,
      dir: 0xffaa66,
      railColor: 0xff6688,
      enemyColor: 0xff6688,
      bulletA: 0xff2040,
      bulletB: 0xffee66,
      bossColor: 0xff8866,
      duration: 70,
      bossAt: 38
    }
  };

  var stageId = 1;
  var keys = Object.create(null);
  var state = "menu"; // menu | play | pause | clear | dead
  var renderer, scene, camera, clock;
  var playerMesh, playerGlow;
  var railGroup, skyMesh;
  var enemies = [];
  var bullets = [];
  var pBullets = [];
  var particles = [];
  var boss = null;
  var score = 0, lives = 3, bombs = 2, graze = 0;
  var invuln = 0, shotCd = 0, spellT = 0, time = 0;
  var infinite = false;
  var bounds = { x: 6.5, y: 4.2 };
  var player = { x: 0, y: 0, z: 0 };
  var camShake = 0;
  var ready = false;
  var animId = 0;
  var threeFailed = false;
  var bossSpawned = false;
  var bombWaves = [];
  var stageClearTimer = 0;

  function setStatus(m) { if (el.status) el.status.textContent = m; }
  function showOverlay(t, s, jp) {
    if (!el.overlay) return;
    el.overlay.hidden = false;
    if (el.overlayTitle) el.overlayTitle.textContent = t;
    if (el.overlaySub) el.overlaySub.textContent = s || "";
    if (el.overlayJp) el.overlayJp.textContent = jp || "立体";
  }
  function hideOverlay() { if (el.overlay) el.overlay.hidden = true; }
  function showSpell(name) {
    spellT = 2.2;
    if (el.spell) {
      el.spell.hidden = false;
      if (el.spellName) el.spellName.textContent = name;
    }
  }
  function hud() {
    if (el.score) el.score.textContent = String(score);
    if (el.lives) el.lives.textContent = infinite ? "∞" : ("★".repeat(Math.max(0, lives)) || "—");
    if (el.bombs) el.bombs.textContent = "◆".repeat(Math.max(0, bombs)) || "—";
    if (el.graze) el.graze.textContent = String(graze);
  }

  function ensureThree(cb) {
    if (typeof THREE !== "undefined") { cb(); return; }
    if (threeFailed) return;
    var s = document.createElement("script");
    s.src = "https://unpkg.com/three@0.160.0/build/three.min.js";
    s.async = true;
    s.onload = function () { cb(); };
    s.onerror = function () {
      threeFailed = true;
      setStatus("Could not load Three.js — 3D mode unavailable (check adblock / network).");
      showOverlay("3D UNAVAILABLE", "Three.js failed to load from CDN", "失敗");
    };
    document.head.appendChild(s);
  }

  function disposeObject(obj) {
    if (!obj) return;
    obj.traverse(function (c) {
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        if (Array.isArray(c.material)) c.material.forEach(function (m) { m.dispose(); });
        else c.material.dispose();
      }
    });
  }

  function clearWorld() {
    enemies.forEach(function (e) { scene.remove(e.mesh); disposeObject(e.mesh); });
    bullets.forEach(function (b) { scene.remove(b.mesh); disposeObject(b.mesh); });
    pBullets.forEach(function (b) { scene.remove(b.mesh); disposeObject(b.mesh); });
    particles.forEach(function (p) { scene.remove(p.mesh); disposeObject(p.mesh); });
    if (boss) { scene.remove(boss.mesh); disposeObject(boss.mesh); boss = null; }
    bombWaves.forEach(function (w) { scene.remove(w.mesh); disposeObject(w.mesh); });
    bombWaves = [];
    enemies = []; bullets = []; pBullets = []; particles = [];
  }

  function buildStageVisuals(cfg) {
    // fog / background
    scene.fog = new THREE.FogExp2(cfg.fog, 0.045);
    scene.background = new THREE.Color(cfg.clear);
    // lights
    while (scene.children.length) scene.remove(scene.children[0]);
    scene.add(new THREE.AmbientLight(cfg.ambient, 0.55));
    var d = new THREE.DirectionalLight(cfg.dir, 0.9);
    d.position.set(4, 10, 2);
    scene.add(d);
    var p = new THREE.PointLight(0xffffff, 0.5, 40);
    p.position.set(0, 2, -5);
    scene.add(p);

    // corridor rails / rings receding into distance
    railGroup = new THREE.Group();
    var ringGeo = new THREE.TorusGeometry(9, 0.06, 8, 48);
    var ringMat = new THREE.MeshBasicMaterial({ color: cfg.railColor, transparent: true, opacity: 0.22 });
    for (var i = 0; i < 28; i++) {
      var ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.z = -i * 6;
      ring.rotation.x = Math.PI / 2;
      railGroup.add(ring);
    }
    // side beams
    var beamGeo = new THREE.BoxGeometry(0.08, 0.08, 160);
    var beamMat = new THREE.MeshBasicMaterial({ color: cfg.railColor, transparent: true, opacity: 0.15 });
    [[-8, 4], [8, 4], [-8, -4], [8, -4]].forEach(function (xy) {
      var beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.set(xy[0], xy[1], -70);
      railGroup.add(beam);
    });
    scene.add(railGroup);

    // soft sky sphere
    skyMesh = new THREE.Mesh(
      new THREE.SphereGeometry(80, 24, 16),
      new THREE.MeshBasicMaterial({ color: cfg.clear, side: THREE.BackSide })
    );
    scene.add(skyMesh);

    // player
    var body = new THREE.Group();
    var cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.35, 1.1, 6),
      new THREE.MeshStandardMaterial({ color: 0xffe8f0, emissive: 0x442233, metalness: 0.2, roughness: 0.45 })
    );
    cone.rotation.x = Math.PI / 2;
    body.add(cone);
    var core = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xff6688 })
    );
    core.position.z = 0.15;
    body.add(core);
    playerGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xff8899, transparent: true, opacity: 0.18 })
    );
    body.add(playerGlow);
    playerMesh = body;
    scene.add(playerMesh);
  }

  function initRenderer() {
    if (renderer) return;
    var w = canvas.clientWidth || 640;
    var h = canvas.clientHeight || 400;
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 200);
    clock = new THREE.Clock();
    ready = true;
  }

  function resize() {
    if (!renderer || !camera) return;
    var w = canvas.clientWidth || 640;
    var h = Math.max(280, canvas.clientHeight || 400);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function spawnEnemy(z, pattern) {
    var cfg = STAGES[stageId];
    var mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.55, 0),
      new THREE.MeshStandardMaterial({
        color: cfg.enemyColor,
        emissive: cfg.enemyColor,
        emissiveIntensity: 0.35,
        metalness: 0.3,
        roughness: 0.4
      })
    );
    var x = (Math.random() * 2 - 1) * bounds.x * 0.85;
    var y = (Math.random() * 2 - 1) * bounds.y * 0.75;
    mesh.position.set(x, y, z);
    scene.add(mesh);
    enemies.push({ mesh: mesh, hp: 8 + stageId * 3, t: 0, pattern: pattern || 0, r: 0.55 });
  }

  function spawnBoss() {
    var cfg = STAGES[stageId];
    var g = new THREE.Group();
    var body = new THREE.Mesh(
      new THREE.DodecahedronGeometry(1.2, 0),
      new THREE.MeshStandardMaterial({
        color: cfg.bossColor,
        emissive: 0x552200,
        emissiveIntensity: 0.4,
        metalness: 0.35,
        roughness: 0.35
      })
    );
    g.add(body);
    var halo = new THREE.Mesh(
      new THREE.TorusGeometry(1.8, 0.08, 8, 40),
      new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.7 })
    );
    halo.rotation.x = Math.PI / 2;
    g.add(halo);
    g.position.set(0, 0.5, -28);
    scene.add(g);
    boss = {
      mesh: g, hp: stageId === 1 ? 220 : 320, maxHp: stageId === 1 ? 220 : 320,
      t: 0, phase: 0, r: 1.4
    };
    showSpell(stageId === 1 ? 'Keystone "Celestial Approach"' : 'Scarlet "Abyss Weather"');
    setStatus(stageId === 1 ? "Mid-boss over the cloud sea!" : "Final spell in the scarlet abyss!");
  }

  function addBullet(x, y, z, vx, vy, vz, color, r) {
    r = (r || 0.28) * 1.35;
    var g = new THREE.Group();
    // outer glow shell
    var glow = new THREE.Mesh(
      new THREE.SphereGeometry(r * 1.75, 12, 12),
      new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.35, depth: THREE.FrontSide })
    );
    // solid mid shell
    var shell = new THREE.Mesh(
      new THREE.SphereGeometry(r, 12, 12),
      new THREE.MeshBasicMaterial({ color: color })
    );
    // white core for danmaku readability
    var core = new THREE.Mesh(
      new THREE.SphereGeometry(r * 0.45, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    g.add(glow); g.add(shell); g.add(core);
    g.position.set(x, y, z);
    scene.add(g);
    bullets.push({ mesh: g, vx: vx, vy: vy, vz: vz, r: r, grazed: false, color: color });
  }

  function firePlayer(focus) {
    if (shotCd > 0) return;
    shotCd = focus ? 0.06 : 0.09;
    var cols = [0xa0e8ff, 0xffffff];
    for (var i = 0; i < (focus ? 1 : 2); i++) {
      var mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 10, 10),
        new THREE.MeshBasicMaterial({ color: cols[i % 2] })
      );
      mesh.position.set(player.x + (focus ? 0 : (i ? 0.25 : -0.25)), player.y, player.z - 0.8);
      scene.add(mesh);
      pBullets.push({ mesh: mesh, vz: -28, dmg: focus ? 2.2 : 1.4 });
    }
  }

  function bomb() {
    if (bombs <= 0) return;
    bombs--;
    invuln = 1.8;
    camShake = 0.55;
    // Expanding 3D shockwave sphere
    var mat = new THREE.MeshBasicMaterial({
      color: 0xffe080,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    var mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 18), mat);
    mesh.position.set(player.x, player.y, player.z);
    scene.add(mesh);
    // bright ring
    var ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.6, 0.08, 8, 40),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })
    );
    ring.rotation.x = Math.PI / 2;
    mesh.add(ring);
    bombWaves.push({
      mesh: mesh, r: 0.5, maxR: 14, life: 1.1, maxLife: 1.1,
      hit: {}, bossHits: 0
    });
    score += 800;
    showSpell('Bomb "Dimensional Seal"');
    hud();
  }

  function updateBombWaves(dt) {
    for (var i = bombWaves.length - 1; i >= 0; i--) {
      var w = bombWaves[i];
      w.life -= dt;
      var t = 1 - Math.max(0, w.life) / w.maxLife;
      w.r = w.maxR * (0.12 + 0.88 * t);
      w.mesh.scale.setScalar(Math.max(0.01, w.r / 0.5));
      if (w.mesh.material) w.mesh.material.opacity = 0.5 * (1 - t);
      // erase bullets inside wave
      for (var bi = bullets.length - 1; bi >= 0; bi--) {
        var bl = bullets[bi];
        if (bl.mesh.position.distanceTo(w.mesh.position) < w.r) {
          scene.remove(bl.mesh); disposeObject(bl.mesh);
          bullets.splice(bi, 1);
          score += 8;
        }
      }
      // damage enemies when first engulfed
      enemies.forEach(function (e, idx) {
        if (w.hit[idx]) return;
        if (e.mesh.position.distanceTo(w.mesh.position) < w.r + e.r) {
          w.hit[idx] = true;
          e.hp -= 40;
          score += 50;
        }
      });
      if (boss && w.bossHits < 4 && boss.mesh.position.distanceTo(w.mesh.position) < w.r + boss.r) {
        w.bossHits++;
        boss.hp -= 28;
        score += 100;
      }
      if (w.life <= 0) {
        scene.remove(w.mesh); disposeObject(w.mesh);
        bombWaves.splice(i, 1);
      }
    }
  }

  function hitPlayer() {
    if (invuln > 0) return;
    camShake = 0.35;
    invuln = 1.4;
    // flash
    if (!infinite) {
      lives--;
      if (lives < 0) {
        lives = 0;
        state = "dead";
        showOverlay("GAME OVER", "Press Z or Start to retry · enable Infinite lives for a casual run", "敗北");
        setStatus("Shot down. Infinite lives is in the 3D panel if you want a freer flight.");
      }
    }
    // knock bullets clear a bit
    for (var i = bullets.length - 1; i >= 0; i--) {
      if (bullets[i].mesh.position.z > -12) {
        scene.remove(bullets[i].mesh);
        disposeObject(bullets[i].mesh);
        bullets.splice(i, 1);
      }
    }
    hud();
  }

  function resetStage() {
    clearWorld();
    var cfg = STAGES[stageId];
    // rebuild lights/rails (scene was cleared of children in clearWorld only entities - need rebuild if first time)
    // full rebuild for cleanliness
    while (scene.children.length) scene.remove(scene.children[0]);
    buildStageVisuals(cfg);
    player.x = 0; player.y = 0; player.z = 0;
    score = 0; graze = 0; bombs = 2;
    lives = infinite ? 99 : 3;
    invuln = 1.5; shotCd = 0; spellT = 0; time = 0; boss = null; bossSpawned = false; stageClearTimer = 0;
    if (el.stageTitle) el.stageTitle.textContent = cfg.name;
    hud();
  }

  function startStage() {
    ensureThree(function () {
      initRenderer();
      resize();
      infinite = !!(el.infinite && el.infinite.checked);
      resetStage();
      state = "play";
      hideOverlay();
      setStatus(STAGES[stageId].name + (infinite ? " · ∞ lives" : ""));
      try { canvas.focus(); } catch (e) {}
      if (!animId) loop();
    });
  }

  function update(dt) {
    if (state !== "play") return;
    time += dt;
    if (invuln > 0) invuln -= dt;
    if (shotCd > 0) shotCd -= dt;
    if (spellT > 0) {
      spellT -= dt;
      if (spellT <= 0 && el.spell) el.spell.hidden = true;
    }

    var cfg = STAGES[stageId];
    var focus = !!(keys["Shift"]);
    var spd = focus ? 5.5 : 10.5;
    var mx = 0, my = 0;
    if (keys["ArrowLeft"] || keys["a"] || keys["A"]) mx -= 1;
    if (keys["ArrowRight"] || keys["d"] || keys["D"]) mx += 1;
    if (keys["ArrowUp"] || keys["w"] || keys["W"]) my += 1;
    if (keys["ArrowDown"] || keys["s"] || keys["S"]) my -= 1;
    if (mx || my) {
      var len = Math.hypot(mx, my);
      player.x += (mx / len) * spd * dt;
      player.y += (my / len) * spd * dt;
    }
    player.x = Math.max(-bounds.x, Math.min(bounds.x, player.x));
    player.y = Math.max(-bounds.y, Math.min(bounds.y, player.y));

    if (keys["z"] || keys["Z"] || keys[" "]) firePlayer(focus);
    if (keys["x"] || keys["X"]) { bomb(); keys["x"] = keys["X"] = false; }

    // animate rails scrolling
    if (railGroup) {
      railGroup.children.forEach(function (c, i) {
        if (c.geometry && c.geometry.type === "TorusGeometry") {
          c.position.z += 12 * dt;
          if (c.position.z > 6) c.position.z -= 6 * 28;
        }
      });
    }

    // spawn schedule
    var bossTime = cfg.bossAt;
    if (!boss && time < bossTime) {
      if (Math.random() < (stageId === 1 ? 0.9 : 1.3) * dt) {
        spawnEnemy(-35 - Math.random() * 10, Math.floor(Math.random() * 3));
      }
    }
    if (!bossSpawned && time >= bossTime) { bossSpawned = true; spawnBoss(); }

    // enemies
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      e.t += dt;
      e.mesh.position.z += (stageId === 1 ? 7.5 : 9.0) * dt;
      e.mesh.rotation.x += dt * 1.5;
      e.mesh.rotation.y += dt * 2.0;
      // patterns toward player plane
      var ez = e.mesh.position.z;
      if (ez > -30 && ez < 8) {
        if (e.pattern === 0 && e.t > 0.5) {
          e.t = 0;
          var dx = player.x - e.mesh.position.x;
          var dy = player.y - e.mesh.position.y;
          var dz = player.z - e.mesh.position.z;
          var d = Math.hypot(dx, dy, dz) || 1;
          addBullet(e.mesh.position.x, e.mesh.position.y, e.mesh.position.z,
            (dx / d) * 6, (dy / d) * 6, (dz / d) * 6 + 4, cfg.bulletA, 0.2);
        } else if (e.pattern === 1 && e.t > 0.7) {
          e.t = 0;
          for (var k = 0; k < 8; k++) {
            var a = (k / 8) * Math.PI * 2 + time;
            addBullet(e.mesh.position.x, e.mesh.position.y, e.mesh.position.z,
              Math.cos(a) * 4, Math.sin(a) * 4, 7, cfg.bulletB, 0.18);
          }
        } else if (e.pattern === 2 && e.t > 0.55) {
          e.t = 0;
          for (var k2 = -1; k2 <= 1; k2++) {
            addBullet(e.mesh.position.x, e.mesh.position.y, e.mesh.position.z,
              k2 * 1.5, 0, 9, cfg.bulletA, 0.2);
          }
        }
      }
      if (e.mesh.position.z > 6 || e.hp <= 0) {
        if (e.hp <= 0) score += 200;
        scene.remove(e.mesh); disposeObject(e.mesh);
        enemies.splice(i, 1);
      }
    }

    // boss AI
    if (boss) {
      boss.t += dt;
      boss.mesh.position.x = Math.sin(boss.t * 0.9) * 3.2;
      boss.mesh.position.y = 0.4 + Math.cos(boss.t * 0.7) * 1.2;
      boss.mesh.position.z = -26 + Math.sin(boss.t * 0.4) * 2;
      boss.mesh.rotation.y += dt * 0.8;
      var hpR = boss.hp / boss.maxHp;
      if (hpR < 0.5 && boss.phase === 0) {
        boss.phase = 1;
        showSpell(stageId === 1 ? 'Sword "Hisou Fracture"' : 'Abyss "Crimson Lattice"');
      }
      var rate = boss.phase === 0 ? 0.28 : 0.16;
      if (boss.t % rate < dt) {
        var arms = boss.phase === 0 ? 10 : 16;
        for (var b = 0; b < arms; b++) {
          var ang = (b / arms) * Math.PI * 2 + boss.t * (boss.phase === 0 ? 1.2 : 2.0);
          addBullet(boss.mesh.position.x, boss.mesh.position.y, boss.mesh.position.z,
            Math.cos(ang) * (3.5 + boss.phase), Math.sin(ang) * (3.5 + boss.phase), 6.5 + boss.phase * 2,
            b % 2 ? cfg.bulletA : cfg.bulletB, 0.2);
        }
      }
      if (boss.phase === 1 && boss.t % 0.45 < dt) {
        var dx2 = player.x - boss.mesh.position.x;
        var dy2 = player.y - boss.mesh.position.y;
        var dz2 = 0 - boss.mesh.position.z;
        var d2 = Math.hypot(dx2, dy2, dz2) || 1;
        addBullet(boss.mesh.position.x, boss.mesh.position.y, boss.mesh.position.z,
          (dx2 / d2) * 9, (dy2 / d2) * 9, (dz2 / d2) * 9, 0xffffff, 0.24);
      }
      if (boss.hp <= 0) {
        score += stageId === 1 ? 15000 : 30000;
        scene.remove(boss.mesh); disposeObject(boss.mesh);
        boss = null;
        // clear remaining enemy bullets for the fanfare
        for (var ci = bullets.length - 1; ci >= 0; ci--) {
          scene.remove(bullets[ci].mesh); disposeObject(bullets[ci].mesh);
        }
        bullets = [];
        if (stageId === 1) {
          state = "clear";
          showOverlay("STAGE 1 CLEAR", "Score " + score + " · Entering Scarlet Abyss…", "クリア");
          setStatus("Stage 1 clear — auto-starting Stage 2…");
          hud();
          stageClearTimer = 2.4;
          return;
        }
        state = "clear";
        showOverlay("STAGE 2 CLEAR", "Score " + score + " · Heaven and abyss conquered", "クリア");
        setStatus("Stage 2 clear! Score " + score);
        hud();
        return;
      }
    }

    // player shots
    for (var pi = pBullets.length - 1; pi >= 0; pi--) {
      var pb = pBullets[pi];
      pb.mesh.position.z += pb.vz * dt;
      var hit = false;
      for (var ei = enemies.length - 1; ei >= 0; ei--) {
        var en = enemies[ei];
        if (pb.mesh.position.distanceTo(en.mesh.position) < en.r + 0.25) {
          en.hp -= pb.dmg;
          hit = true;
          score += 30;
          break;
        }
      }
      if (!hit && boss && pb.mesh.position.distanceTo(boss.mesh.position) < boss.r + 0.3) {
        boss.hp -= pb.dmg;
        hit = true;
        score += 40;
      }
      if (hit || pb.mesh.position.z < -60) {
        scene.remove(pb.mesh); disposeObject(pb.mesh);
        pBullets.splice(pi, 1);
      }
    }

    // enemy bullets
    for (var bi = bullets.length - 1; bi >= 0; bi--) {
      var bl = bullets[bi];
      bl.mesh.position.x += bl.vx * dt;
      bl.mesh.position.y += bl.vy * dt;
      bl.mesh.position.z += bl.vz * dt;
      var pos = bl.mesh.position;
      // graze near player plane (z near 0)
      var dist = Math.hypot(pos.x - player.x, pos.y - player.y, pos.z - player.z);
      if (!bl.grazed && dist < 1.3 && dist > 0.38) {
        bl.grazed = true;
        graze++;
        score += 15;
      }
      if (invuln <= 0 && dist < 0.38 + bl.r) {
        hitPlayer();
        scene.remove(bl.mesh); disposeObject(bl.mesh);
        bullets.splice(bi, 1);
        continue;
      }
      if (pos.z > 8 || pos.z < -70 || Math.abs(pos.x) > 14 || Math.abs(pos.y) > 10) {
        scene.remove(bl.mesh); disposeObject(bl.mesh);
        bullets.splice(bi, 1);
      }
    }

    // soft cap
    if (bullets.length > 500) {
      var overflow = bullets.splice(0, bullets.length - 500);
      overflow.forEach(function (b) { scene.remove(b.mesh); disposeObject(b.mesh); });
    }

    // camera behind player looking down the corridor (-Z)
    var shakeX = (Math.random() - 0.5) * camShake;
    var shakeY = (Math.random() - 0.5) * camShake;
    camShake = Math.max(0, camShake - dt * 1.5);
    playerMesh.position.set(player.x, player.y, player.z);
    playerMesh.visible = !(invuln > 0 && Math.floor(invuln * 20) % 2 === 0);
    camera.position.set(player.x * 0.35 + shakeX, player.y * 0.35 + 1.2 + shakeY, player.z + 5.5);
    camera.lookAt(player.x * 0.15, player.y * 0.15, player.z - 18);

    // stage timeout without boss kill still ok — if past duration and no boss, clear
    if (!boss && time > cfg.duration && state === "play") {
      if (stageId === 1) {
        state = "clear";
        showOverlay("STAGE 1 CLEAR", "Score " + score + " · Entering Scarlet Abyss…", "クリア");
        stageClearTimer = 2.4;
      } else {
        state = "clear";
        showOverlay("STAGE CLEAR", "Score " + score, "クリア");
      }
    }

    // Auto-advance Stage 1 → 2
    if (state === "clear" && stageClearTimer > 0) {
      stageClearTimer -= dt;
      if (stageClearTimer <= 0 && stageId === 1) {
        stageId = 2;
        document.querySelectorAll("[data-stage]").forEach(function (b) {
          b.classList.toggle("is-active", b.getAttribute("data-stage") === "2");
        });
        if (el.stageTitle) el.stageTitle.textContent = STAGES[2].name;
        setStatus("Auto-continuing to Stage 2…");
        // preserve score across stages
        var keptScore = score;
        var keptGraze = graze;
        var keptBombs = bombs;
        var keptLives = lives;
        infinite = !!(el.infinite && el.infinite.checked);
        resetStage();
        score = keptScore;
        graze = keptGraze;
        bombs = keptBombs;
        if (!infinite) lives = keptLives;
        state = "play";
        hideOverlay();
        setStatus(STAGES[2].name + (infinite ? " · ∞ lives" : "") + " · score carried over");
        hud();
      }
    }
    hud();
  }

  function loop() {
    animId = requestAnimationFrame(loop);
    if (!ready || shell.hidden) return;
    var dt = Math.min(0.05, clock.getDelta());
    if (state === "play") update(dt);
    if (renderer && scene && camera) renderer.render(scene, camera);
  }

  // Dimension switch
  function setDim(dim) {
    var shell2d = document.getElementById("danmaku-demo");
    var shell3d = document.getElementById("danmaku-demo-3d");
    document.querySelectorAll("[data-dim]").forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-dim") === dim);
    });
    if (shell2d) shell2d.hidden = dim !== "2d";
    if (shell3d) shell3d.hidden = dim !== "3d";
    if (dim === "3d") {
      ensureThree(function () {
        initRenderer();
        resize();
        if (state === "menu") {
          showOverlay("3D CORRIDOR", "Stage " + stageId + " · Z or Start to fly", "立体");
        }
        if (!animId) loop();
      });
      setStatus("3D corridor ready — pick a stage and Start.");
    }
  }

  document.querySelectorAll("[data-dim]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      setDim(btn.getAttribute("data-dim"));
    });
  });

  document.querySelectorAll("[data-stage]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll("[data-stage]").forEach(function (b) { b.classList.remove("is-active"); });
      btn.classList.add("is-active");
      stageId = parseInt(btn.getAttribute("data-stage"), 10) || 1;
      if (el.stageTitle) el.stageTitle.textContent = STAGES[stageId].name;
      setStatus("Selected " + STAGES[stageId].name);
      if (state !== "play") {
        showOverlay("3D CORRIDOR", STAGES[stageId].name + " · press Start", "立体");
      }
    });
  });

  if (el.start) el.start.addEventListener("click", startStage);

  window.addEventListener("keydown", function (e) {
    if (shell.hidden) return;
    keys[e.key] = true;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].indexOf(e.key) >= 0) {
      if (state === "play") e.preventDefault();
    }
    if (e.key === "Escape") {
      if (state === "play") {
        state = "pause";
        showOverlay("PAUSE", "Esc to resume", "停止");
      } else if (state === "pause") {
        state = "play";
        hideOverlay();
      }
    }
    if ((e.key === "z" || e.key === "Z" || e.key === " ") &&
        (state === "menu" || state === "dead" || state === "clear")) {
      e.preventDefault();
      startStage();
    }
  });
  window.addEventListener("keyup", function (e) {
    if (shell.hidden) return;
    keys[e.key] = false;
  });
  window.addEventListener("resize", function () {
    if (!shell.hidden) resize();
  });

  // expose for optional external hooks
  window.__th3d = { start: startStage, setDim: setDim };
})();

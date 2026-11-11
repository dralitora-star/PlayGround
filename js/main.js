import * as THREE from 'three';
import { World, WORLD_RADIUS } from './world.js';
import { Hero } from './hero.js';
import { EnemyManager } from './enemy.js';
import { Effects } from './effects.js';
import { UI } from './ui.js';
import { AudioEngine } from './audio.js';

const BEST_KEY = 'skullfall.best.v1';

function boot() {
  const canvas = document.getElementById('scene');
  const ui = new UI();
  const audio = new AudioEngine();
  ui.setMuted(audio.muted);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
  } catch (error) {
    document.getElementById('webgl-error').classList.remove('hidden');
    document.getElementById('loading').classList.add('hidden');
    console.error(error);
    return;
  }
  const isMobile = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 760;
  let pixelRatio = Math.min(window.devicePixelRatio || 1, isMobile ? 1.35 : 1.7);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcfe2cb);
  scene.fog = new THREE.Fog(0xcfdfc5, 55, 175);

  const camera = new THREE.PerspectiveCamera(53, window.innerWidth / window.innerHeight, 0.1, 900);
  camera.position.set(0, 8.5, 13);

  const hemi = new THREE.HemisphereLight(0xd9ecff, 0x3e5735, 1.35);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0xb8d0b0, 0.36);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xfff1cf, 2.35);
  sun.position.set(-34, 48, -30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 140;
  sun.shadow.camera.left = -42;
  sun.shadow.camera.right = 42;
  sun.shadow.camera.top = 42;
  sun.shadow.camera.bottom = -42;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.035;
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun);
  scene.add(sun.target);

  const world = new World(scene);
  const effects = new Effects(scene, world);
  effects.setViewport(window.innerHeight);
  const hero = new Hero(scene, world, effects);
  const enemies = new EnemyManager(scene, world, effects, audio);

  const storedBest = Number.parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0;
  const game = {
    time: 0,
    mode: 'menu',
    score: 0,
    best: storedBest,
    combo: 0,
    comboTimer: 0,
    kills: 0,
    zone: 1,
    shakeAmount: 0,
    deathAt: -99,
    deathScreenShown: false,
    muted: audio.muted,
    lastNoMana: -9,
    enemyManager: enemies
  };

  hero.setGame(game);
  enemies.onKill = (enemy) => {
    game.kills += 1;
    game.combo += 1;
    game.comboTimer = 3.1;
    const mult = 1 + Math.min(game.combo, 10) * 0.1;
    const gain = Math.round(enemy.scoreValue * mult);
    game.score += gain;
    if (game.score > game.best) {
      game.best = game.score;
      localStorage.setItem(BEST_KEY, String(game.best));
    }
    ui.spawnNumber(
      new THREE.Vector3(enemy.group.position.x, enemy.group.position.y + 0.7, enemy.group.position.z),
      `+${gain}`,
      'crit'
    );
    const startLevel = hero.level;
    const ups = hero.addXp(enemy.xpReward);
    for (let i = 1; i <= ups; i++) levelUp(startLevel + i);
  };
  enemies.onHit = (enemy, dmg, crit) => {
    game.combo += 1;
    game.comboTimer = 2.8;
    ui.spawnNumber(
      new THREE.Vector3(enemy.group.position.x, enemy.group.position.y + 0.4, enemy.group.position.z),
      String(dmg),
      crit ? 'crit' : ''
    );
  };

  function levelUp(level) {
    effects.levelUp(hero.position);
    ui.toast(`LEVEL ${level} — KEKUATAN MENINGKAT`, 'gold', 2600);
    ui.spawnNumber(new THREE.Vector3(hero.position.x, hero.position.y + 2.7, hero.position.z), 'LEVEL UP', 'heal', { x: 0 });
    audio.levelUp();
    game.shake(0.16);
  }

  game.shake = (amount) => { game.shakeAmount = Math.min(0.9, game.shakeAmount + amount); };
  game.onSwing = (step) => { audio.swing(step); };
  game.onMeleeConnect = () => {
    game.comboTimer = Math.max(game.comboTimer, 2.6);
  };
  game.onNoMana = () => {
    if (game.time - game.lastNoMana < 1.1) return;
    game.lastNoMana = game.time;
    audio.noMana();
    ui.toast('MANA TIDAK CUKUP', 'danger', 1100);
  };
  game.onWhirlStart = () => {
    audio.skill();
    effects.skill(new THREE.Vector3(hero.position.x, hero.position.y + 0.1, hero.position.z));
    game.shake(0.28);
  };
  game.onPlayerHurt = (dmg) => {
    ui.spawnNumber(new THREE.Vector3(hero.position.x, hero.position.y + 2.3, hero.position.z), `-${dmg}`, 'player', { x: 0 });
    ui.hitFlash();
    ui.shakeHud();
    audio.hurt();
    game.shake(0.34);
  };
  game.onPlayerDeath = () => {
    if (game.mode === 'dead') return;
    game.mode = 'dead';
    game.deathAt = game.time;
    game.deathScreenShown = false;
    game.best = Math.max(game.best, game.score);
    localStorage.setItem(BEST_KEY, String(game.best));
    ui.setBest(game.best);
    audio.death();
    game.shake(0.5);
    setTimeout(() => {
      if (game.mode !== 'dead') return;
      game.deathScreenShown = true;
      ui.showDeath({
        score: game.score,
        best: game.best,
        level: hero.level,
        kills: game.kills
      });
    }, 1250);
  };

  // ---------- Camera ----------
  const camTarget = new THREE.Vector3(0, 1.5, 0);
  const desiredPos = new THREE.Vector3();
  const desiredTarget = new THREE.Vector3();
  let camSnap = true;
  function updateCamera(dt) {
    const t = game.time;
    if (game.mode === 'menu') {
      desiredPos.set(Math.sin(t * 0.14) * 2.4, 8.7, 13.6);
      desiredPos.add(hero.position);
      desiredTarget.copy(hero.position).add(new THREE.Vector3(0, 1.55, 0));
    } else if (game.mode === 'dead') {
      desiredPos.set(Math.sin(t * 0.08) * 1.6, 8.6, 14.2);
      desiredPos.add(hero.position);
      desiredTarget.copy(hero.position).add(new THREE.Vector3(0, 0.85, 0));
    } else {
      const vx = hero.velocity.x;
      const vz = hero.velocity.z;
      desiredPos.set(vx * 0.14, 6.9, 10.6);
      desiredPos.add(hero.position);
      desiredTarget.copy(hero.position).add(new THREE.Vector3(0, 1.5, 0));
      desiredTarget.x += vx * 0.12;
      desiredTarget.z += vz * 0.12;
    }
    const camGround = world.height(desiredPos.x, desiredPos.z) + 1.3;
    if (desiredPos.y < camGround) desiredPos.y = camGround;
    if (camSnap) {
      camera.position.copy(desiredPos);
      camTarget.copy(desiredTarget);
      camSnap = false;
    } else {
      const k = 1 - Math.exp(-dt * (game.mode === 'dead' ? 1.8 : 5.2));
      camera.position.lerp(desiredPos, k);
      camTarget.lerp(desiredTarget, 1 - Math.exp(-dt * 7));
    }
    if (game.shakeAmount > 0.001) {
      const s = game.shakeAmount;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s * 0.7;
      camera.position.z += (Math.random() - 0.5) * s * 0.45;
      game.shakeAmount *= Math.exp(-dt * 9);
    }
    camera.lookAt(camTarget);
  }

  // ---------- Input ----------
  const keys = new Set();
  let attackHeldMouse = false;
  const attackHeld = () => attackHeldMouse || ui.attackHeld || keys.has('KeyJ') || keys.has('Space');

  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    keys.add(e.code);
    if (game.mode === 'playing') {
      if (e.code === 'KeyJ' || e.code === 'Space') {
        if (!e.repeat) hero.startAttack();
      }
      if (e.code === 'KeyQ' && !e.repeat) hero.startWhirl();
    }
    if (e.code === 'KeyM' && !e.repeat) toggleMute();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); attackHeldMouse = false; });

  canvas.addEventListener('pointerdown', (e) => {
    if (game.mode !== 'playing') return;
    if (e.pointerType === 'touch') return;
    if (e.button === 2) {
      hero.startWhirl();
      return;
    }
    if (e.button === 0) {
      attackHeldMouse = true;
      hero.startAttack();
    }
  });
  window.addEventListener('pointerup', () => { attackHeldMouse = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function readInput() {
    let x = 0, z = 0;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) z += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) z -= 1;
    x += ui.move.x;
    z += ui.move.z;
    const m = Math.hypot(x, z);
    if (m > 1) { x /= m; z /= m; }
    return { x, z };
  }

  // ---------- State transitions ----------
  function startGame() {
    if (game.mode !== 'menu') return;
    audio.init();
    audio.click();
    game.mode = 'playing';
    camSnap = true;
    ui.hideStart();
    ui.toast('KLIK UNTUK MENYERANG  ·  Q UNTUK BADAI PEDANG', '', 3600);
    ui.setBest(game.best);
    setTimeout(() => ui.toast('MAKIN JAUH DARI SPAWN, MAKIN GANAS', 'gold', 3000), 1800);
  }

  function respawn() {
    if (game.mode !== 'dead') return;
    audio.init();
    audio.respawn();
    hero.respawn();
    enemies.resetAroundSpawn();
    game.score = 0;
    game.combo = 0;
    game.comboTimer = 0;
    game.kills = 0;
    game.zone = 1;
    game.mode = 'playing';
    game.shakeAmount = 0;
    game.deathScreenShown = false;
    camSnap = true;
    for (const d of ui.damage) d.el.remove();
    ui.damage.length = 0;
    ui.hideDeath();
    ui.setBest(game.best);
    ui.toast('KEMBALI KE SPAWN — LEVEL 1', 'gold', 2800);
    setTimeout(() => ui.toast('SKOR TERBAIK TETAP TERSIMPAN', '', 2200), 1500);
  }

  function toggleMute() {
    audio.init();
    game.muted = !audio.muted;
    audio.setMuted(game.muted);
    ui.setMuted(game.muted);
    if (!game.muted) audio.click();
  }

  ui.setHandlers({
    onStart: startGame,
    onRespawn: respawn,
    onMute: toggleMute,
    onAttack: () => { if (game.mode === 'playing') hero.startAttack(); },
    onSkill: () => { if (game.mode === 'playing') hero.startWhirl(); },
    onZoneChange: (zone) => {
      if (zone > game.zone && zone > 1) {
        const names = ['PADANG TENANG', 'RERUMPUT LIAR', 'HUTAN GELAP', 'TANAH TERKUTUK', 'AMBANG MAUT'];
        ui.toast(`ZONA ${zone} — ${names[Math.min(4, Math.floor((zone - 1) / 2))]}`, 'danger', 2300);
        audio.zone();
      }
      game.zone = zone;
    }
  });

  ui.setBest(game.best);

  // ---------- Resize ----------
  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(w, h, false);
    effects.setViewport(h);
  }
  window.addEventListener('resize', resize);

  // ---------- Loop ----------
  const clock = new THREE.Clock();
  let frameCount = 0;
  let qualityAcc = 0;
  let qualityChecked = false;
  let hudRadarTimer = 0;

  function animate() {
    requestAnimationFrame(animate);
    const rawDt = Math.min(clock.getDelta(), 0.05);
    if (document.hidden) return;
    const dt = rawDt;
    game.time += dt;

    if (game.comboTimer > 0) {
      game.comboTimer -= dt;
      if (game.comboTimer <= 0) game.combo = 0;
    }

    const playing = game.mode === 'playing';
    hero.update(dt, playing ? readInput() : { x: 0, z: 0 });

    if (playing && attackHeld() && hero.canAttack()) hero.startAttack();

    enemies.update(dt, hero, camera, playing);

    effects.update(dt);
    world.update(dt, game.time, camera);
    updateCamera(dt);

    sun.position.set(hero.position.x - 34, hero.position.y + 48, hero.position.z - 30);
    sun.target.position.copy(hero.position);
    sun.target.updateMatrixWorld();

    ui.updateHUD({
      hero,
      score: game.score,
      best: game.best,
      combo: game.combo,
      comboTime: game.comboTimer
    }, dt);

    hudRadarTimer -= dt;
    if (hudRadarTimer <= 0) {
      hudRadarTimer = 0.09;
      ui.drawRadar(hero, enemies.enemies);
    }
    ui.updateDamage(camera, rawDt);

    renderer.render(scene, camera);

    frameCount++;
    qualityAcc += rawDt;
    if (!qualityChecked && game.time > 4) {
      qualityChecked = true;
      const fps = qualityAcc > 0 ? frameCount / qualityAcc : 60;
      if (fps < 34) {
        renderer.shadowMap.enabled = false;
        scene.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      }
      if (fps < 26 && pixelRatio > 1.0) {
        pixelRatio = 1.0;
        resize();
      }
    }
  }

  function begin() {
    resize();
    ui.ready();
    clock.start();
    animate();
    setTimeout(() => {
      if (game.mode === 'menu') ui.showStart();
    }, 900);
  }

  // Debug hook for automated verification.
  window.__SKULLFALL__ = {
    game,
    scene,
    sun,
    hero,
    enemies,
    world,
    effects,
    camera,
    renderer,
    startGame,
    respawn,
    levelUp,
    teleport(x, z) {
      hero.root.position.set(x, world.height(x, z), z);
      camSnap = true;
    },
    damagePlayer(amount) {
      hero.takeDamage(amount, null);
    },
    killAll() {
      for (const e of [...enemies.enemies]) e.takeDamage(99999, null, 0, {});
    }
  };

  begin();
}

try {
  boot();
} catch (error) {
  console.error(error);
  const err = document.getElementById('webgl-error');
  const loading = document.getElementById('loading');
  err?.classList.remove('hidden');
  loading?.classList.add('hidden');
  if (err) err.querySelector('p').textContent = `Terjadi kesalahan saat memuat game: ${error.message}`;
}

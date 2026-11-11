import { WORLD_RADIUS } from './world.js';

const $ = (id) => document.getElementById(id);

const ZONE_NAMES = [
  'PADANG TENANG',
  'RERUMPUT LIAR',
  'HUTAN GELAP',
  'TANAH TERKUTUK',
  'AMBANG MAUT'
];

function format(n) {
  return Math.floor(n).toLocaleString('id-ID');
}

export class UI {
  constructor() {
    this.el = {
      hud: $('hud'),
      hpFill: $('hp-fill'),
      hpText: $('hp-text'),
      mpFill: $('mp-fill'),
      mpText: $('mp-text'),
      xpFill: $('xp-fill'),
      xpText: $('xp-text'),
      xpRow: document.querySelector('.xp-row'),
      levelBadge: $('level-badge'),
      playerRank: $('player-rank'),
      score: $('score-value'),
      best: $('best-value'),
      startBest: $('start-best'),
      multiplier: $('multiplier'),
      comboToast: $('combo-toast'),
      zoneLabel: $('zone-label'),
      zoneName: $('zone-name'),
      zoneFill: $('zone-fill'),
      zoneDistance: $('zone-distance'),
      radar: $('radar'),
      start: $('start-screen'),
      startBtn: $('start-btn'),
      death: $('death-screen'),
      deathScore: $('death-score'),
      deathBest: $('death-best'),
      deathLevel: $('death-level'),
      deathKills: $('death-kills'),
      respawn: $('respawn-btn'),
      mute: $('mute-btn'),
      danger: $('danger-overlay'),
      flash: $('hit-flash'),
      damageLayer: $('damage-layer'),
      toastLayer: $('toast-layer'),
      loading: $('loading'),
      joystick: $('joystick'),
      joystickKnob: $('joystick-knob'),
      attackBtn: $('attack-btn'),
      skillBtn: $('skill-btn'),
      skillCd: $('skill-cd'),
      touch: $('touch-controls')
    };
    this.radarCtx = this.el.radar.getContext('2d');
    this.move = { x: 0, z: 0 };
    this.attackHeld = false;
    this.joystickPointer = null;
    this.damage = [];
    this.lastHud = 0;
    this.lastRadar = 0;
    this.lastScore = -1;
    this.lastZone = -1;
    this.lowHp = false;
    this.handlers = {};
    this.bind();
  }

  bind() {
    this.el.startBtn.addEventListener('click', (e) => {
      e.preventDefault();
      this.handlers.onStart?.();
    });
    this.el.respawn.addEventListener('click', (e) => {
      e.preventDefault();
      this.handlers.onRespawn?.();
    });
    this.el.mute.addEventListener('click', (e) => {
      e.preventDefault();
      this.handlers.onMute?.();
    });

    this.el.attackBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.attackHeld = true;
      this.el.attackBtn.setPointerCapture?.(e.pointerId);
      this.handlers.onAttack?.();
    });
    const endAttack = (e) => {
      e?.preventDefault?.();
      this.attackHeld = false;
    };
    this.el.attackBtn.addEventListener('pointerup', endAttack);
    this.el.attackBtn.addEventListener('pointercancel', endAttack);
    this.el.attackBtn.addEventListener('lostpointercapture', () => { this.attackHeld = false; });

    this.el.skillBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.handlers.onSkill?.();
    });

    const joy = this.el.joystick;
    const updateJoy = (e) => {
      const rect = joy.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const max = rect.width * 0.34;
      const d = Math.hypot(dx, dy);
      if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
      this.el.joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.move.x = dx / max;
      this.move.z = dy / max;
    };
    joy.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.joystickPointer = e.pointerId;
      joy.setPointerCapture?.(e.pointerId);
      updateJoy(e);
    });
    joy.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.joystickPointer) return;
      e.preventDefault();
      updateJoy(e);
    });
    const endJoy = (e) => {
      if (e && e.pointerId !== this.joystickPointer) return;
      this.joystickPointer = null;
      this.move.x = 0;
      this.move.z = 0;
      this.el.joystickKnob.style.transform = 'translate(0px, 0px)';
    };
    joy.addEventListener('pointerup', endJoy);
    joy.addEventListener('pointercancel', endJoy);
    joy.addEventListener('lostpointercapture', () => endJoy());

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Enter' && !this.el.start.classList.contains('leaving')) {
        this.handlers.onStart?.();
      }
      if (e.code === 'KeyR' && !this.el.death.classList.contains('hidden')) {
        this.handlers.onRespawn?.();
      }
    });
  }

  setHandlers(handlers) { Object.assign(this.handlers, handlers); }

  setBest(best) {
    this.el.best.textContent = format(best);
    this.el.startBest.textContent = format(best);
  }

  ready() {
    this.el.loading.classList.add('done');
    setTimeout(() => this.el.loading.classList.add('hidden'), 800);
  }

  showStart() {
    this.el.start.classList.remove('leaving');
    document.body.classList.remove('started');
  }

  hideStart() {
    this.el.start.classList.add('leaving');
    document.body.classList.add('started');
  }

  showDeath(stats) {
    this.el.deathScore.textContent = format(stats.score);
    this.el.deathBest.textContent = format(stats.best);
    this.el.deathLevel.textContent = String(stats.level);
    this.el.deathKills.textContent = String(stats.kills);
    this.el.death.classList.remove('hidden');
    document.body.classList.add('dying');
  }

  hideDeath() {
    this.el.death.classList.add('hidden');
    document.body.classList.remove('dying');
  }

  setMuted(muted) {
    document.body.classList.toggle('muted', muted);
    this.el.mute.setAttribute('aria-label', muted ? 'Suara mati' : 'Suara aktif');
  }

  getInput() {
    return this.move;
  }

  updateHUD(state, dt) {
    const { hero, score, best, combo, comboTime } = state;
    this.lastHud += dt;
    if (this.lastHud < 0.05) return;
    this.lastHud = 0;
    const hpRatio = Math.max(0, hero.hp / hero.maxHp);
    const mpRatio = Math.max(0, hero.mana / hero.maxMana);
    this.el.hpFill.style.width = `${hpRatio * 100}%`;
    this.el.mpFill.style.width = `${mpRatio * 100}%`;
    this.el.hpText.textContent = `${Math.ceil(hero.hp)} / ${Math.round(hero.maxHp)}`;
    this.el.mpText.textContent = `${Math.floor(hero.mana)} / ${Math.round(hero.maxMana)}`;
    this.el.levelBadge.textContent = String(hero.level);
    this.el.xpFill.style.width = `${hero.level >= 10 ? 100 : Math.min(100, (hero.xp / hero.xpNext) * 100)}%`;
    this.el.xpText.textContent = hero.level >= 10 ? 'MAX LEVEL' : `${Math.floor(hero.xp)} / ${hero.xpNext} XP`;
    this.el.xpRow.classList.toggle('maxed', hero.level >= 10);

    const ranks = ['PEDANG PADANG', 'PEMBURU TULANG', 'PENJAGA PADANG', 'LEGENDA PADANG'];
    this.el.playerRank.textContent = hero.level >= 10 ? ranks[3] : hero.level >= 7 ? ranks[2] : hero.level >= 4 ? ranks[1] : ranks[0];

    if (score !== this.lastScore) {
      this.lastScore = score;
      this.el.score.textContent = format(score);
      if (score > 0) {
        this.el.score.animate(
          [{ transform: 'scale(1.15)', filter: 'brightness(1.6)' }, { transform: 'scale(1)', filter: 'brightness(1)' }],
          { duration: 180, easing: 'ease-out' }
        );
      }
    }
    this.el.best.textContent = format(Math.max(best, score));

    const mult = 1 + Math.min(combo, 10) * 0.1;
    this.el.multiplier.textContent = `KOMBO x${mult.toFixed(1)}`;
    this.el.multiplier.classList.toggle('on', combo > 0 && comboTime > 0);
    this.el.comboToast.textContent = combo >= 2 ? `${combo} HIT COMBO` : '';
    this.el.comboToast.classList.toggle('on', combo >= 2 && comboTime > 0);

    const dist = Math.hypot(hero.position.x, hero.position.z);
    const zone = Math.min(10, 1 + Math.floor(dist / 11));
    this.el.zoneLabel.textContent = `ZONA ${zone}`;
    this.el.zoneName.textContent = ZONE_NAMES[Math.min(ZONE_NAMES.length - 1, Math.floor((zone - 1) / 2))];
    this.el.zoneFill.style.width = `${Math.min(100, (dist / WORLD_RADIUS) * 100)}%`;
    this.el.zoneDistance.textContent = `${Math.round(dist)} m dari spawn`;

    const danger = hpRatio < 0.32 && !hero.dead;
    this.lowHp = danger;
    this.el.danger.style.opacity = danger ? `${0.55 + Math.sin(performance.now() * 0.006) * 0.2}` : '0';

    const skillReady = hero.whirlCooldown <= 0 && hero.mana >= hero.manaCost;
    this.el.skillBtn.classList.toggle('no-mana', !skillReady);
    const cd = Math.max(0, hero.whirlCooldown) / 3.4;
    this.el.skillCd.style.setProperty('--cd', `${cd * 100}%`);
    this.el.skillCd.classList.toggle('on', cd > 0.01);
    this.el.attackBtn.classList.toggle('no-mana', hero.dead);

    if (this.lastZone !== zone) {
      if (this.lastZone !== -1) this.handlers.onZoneChange?.(zone);
      this.lastZone = zone;
    }
  }

  drawRadar(hero, enemies) {
    const ctx = this.radarCtx;
    const w = this.el.radar.width;
    const h = this.el.radar.height;
    const cx = w / 2;
    const cy = h / 2;
    const scale = (w / 2 - 10) / WORLD_RADIUS;
    ctx.clearRect(0, 0, w, h);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, w / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
    const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, w / 2);
    grad.addColorStop(0, 'rgba(27,62,42,0.82)');
    grad.addColorStop(1, 'rgba(5,16,11,0.92)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // zone rings
    ctx.strokeStyle = 'rgba(139,224,164,0.1)';
    ctx.lineWidth = 1;
    for (let r = 22; r <= 110; r += 22) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * scale, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,209,102,0.18)';
    ctx.setLineDash([4, 7]);
    ctx.beginPath();
    ctx.arc(cx, cy, WORLD_RADIUS * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // spawn crystal
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = 'rgba(120,245,208,0.9)';
    ctx.shadowColor = '#78f5d0';
    ctx.shadowBlur = 10;
    ctx.fillRect(-4, -4, 8, 8);
    ctx.restore();

    // enemies
    for (const e of enemies) {
      if (e.dead) continue;
      const ex = cx + e.pos.x * scale;
      const ey = cy + e.pos.z * scale;
      const rel = e.level - hero.level;
      let color = '#87e59a';
      if (rel >= 3) color = '#ff5b4e';
      else if (rel >= 1) color = '#ffd166';
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(ex, ey, rel >= 3 ? 3.4 : 2.6, 0, Math.PI * 2);
      ctx.fill();
      if (e.isCaster) {
        ctx.strokeStyle = 'rgba(176,123,255,0.8)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(ex, ey, 5.2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // player
    const px = cx + hero.position.x * scale;
    const py = cy + hero.position.z * scale;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.PI - hero.yawAngle);
    ctx.fillStyle = '#fff8e4';
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5.5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5.5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // sweep
    const sweep = (performance.now() * 0.0005) % (Math.PI * 2);
    const sg = ctx.createLinearGradient(cx, cy, cx + Math.cos(sweep) * w / 2, cy + Math.sin(sweep) * w / 2);
    sg.addColorStop(0, 'rgba(139,224,164,0.16)');
    sg.addColorStop(1, 'rgba(139,224,164,0)');
    ctx.strokeStyle = sg;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(sweep) * w / 2, cy + Math.sin(sweep) * w / 2);
    ctx.stroke();

    ctx.restore();
    ctx.strokeStyle = 'rgba(139,224,164,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, w / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  spawnNumber(pos, text, cls = '', offset = null) {
    if (this.damage.length > 34) {
      const old = this.damage.shift();
      old.el.remove();
    }
    const el = document.createElement('span');
    el.className = `dmg ${cls}`;
    el.textContent = text;
    this.el.damageLayer.appendChild(el);
    this.damage.push({
      el,
      pos: pos.clone(),
      life: cls === 'crit' ? 1.05 : 0.82,
      max: cls === 'crit' ? 1.05 : 0.82,
      dx: offset?.x ?? (Math.random() * 34 - 17),
      rise: 38 + Math.random() * 18
    });
  }

  updateDamage(camera, dt) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (let i = this.damage.length - 1; i >= 0; i--) {
      const d = this.damage[i];
      d.life -= dt;
      if (d.life <= 0) {
        d.el.remove();
        this.damage.splice(i, 1);
        continue;
      }
      const p = d.pos.clone();
      p.project(camera);
      if (p.z > 1 || p.z < -1) { d.el.style.opacity = '0'; continue; }
      const x = (p.x * 0.5 + 0.5) * w + d.dx;
      const y = (-p.y * 0.5 + 0.5) * h;
      const t = 1 - d.life / d.max;
      const scale = 0.75 + Math.min(1, t * 7) * 0.35;
      d.el.style.transform = `translate3d(${x}px, ${y - t * d.rise}px, 0) translate(-50%, -50%) scale(${scale})`;
      d.el.style.opacity = String(Math.min(1, d.life / d.max * 2.2));
    }
  }

  toast(text, type = '', duration = 2300) {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = text;
    this.el.toastLayer.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 500);
    }, duration);
  }

  hitFlash() {
    const el = this.el.flash;
    el.style.transition = 'none';
    el.style.opacity = '0.85';
    requestAnimationFrame(() => {
      el.style.transition = 'opacity 520ms ease-out';
      el.style.opacity = '0';
    });
  }

  shakeHud() {
    this.el.hud.animate(
      [{ transform: 'translate(0,0)' }, { transform: 'translate(4px,-3px)' }, { transform: 'translate(-3px,2px)' }, { transform: 'translate(0,0)' }],
      { duration: 160, easing: 'ease-out' }
    );
  }
}

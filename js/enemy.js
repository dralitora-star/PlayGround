import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

const TIERS = [
  { eye: 0x7fffd4, name: 'tulang pucat' },
  { eye: 0x9dffbd, name: 'tulang lumut' },
  { eye: 0xffd166, name: 'tulang emas' },
  { eye: 0xffa04d, name: 'tulang bakau' },
  { eye: 0xff5a5a, name: 'tulang neraka' }
];
function tierFor(level) {
  return TIERS[Math.min(TIERS.length - 1, Math.floor((level - 1) / 2))];
}

function paint(geometry, color, jitter = 0.06) {
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  const c = new THREE.Color(color);
  for (let i = 0; i < count; i++) {
    const j = 1 + (Math.random() * 2 - 1) * jitter;
    colors[i * 3] = c.r * j;
    colors[i * 3 + 1] = c.g * j;
    colors[i * 3 + 2] = c.b * j;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function mergeParts(parts) {
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
}

function transform(geometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  geometry.applyMatrix4(m);
  return geometry;
}

let BODY_GEO = null;
let JAW_GEO = null;
let EYE_GEO = null;
let TAIL_GEO = null;
let AURA_GEO = null;
let GLOW_TEX = null;
let PROJECTILE_GEO = null;

function glowTexture() {
  if (GLOW_TEX) return GLOW_TEX;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.65)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  GLOW_TEX = new THREE.CanvasTexture(c);
  GLOW_TEX.colorSpace = THREE.SRGBColorSpace;
  return GLOW_TEX;
}

function buildGeometry() {
  if (BODY_GEO) return;
  const parts = [];
  const cranium = new THREE.IcosahedronGeometry(0.8, 1);
  cranium.scale(0.98, 1.0, 0.94);
  parts.push(paint(cranium, 0xeae2cc, 0.05));

  // Heavy brow ridge
  const brow = new THREE.BoxGeometry(1.0, 0.17, 0.34);
  transform(brow, 0, 0.31, 0.47, 0.12, 0, 0);
  parts.push(paint(brow, 0xddd3b7, 0.04));
  const browCrest = new THREE.BoxGeometry(0.72, 0.1, 0.26);
  transform(browCrest, 0, 0.45, 0.4, 0.28, 0, 0);
  parts.push(paint(browCrest, 0xd2c8ab, 0.04));

  // Deep eye sockets
  for (const x of [-0.31, 0.31]) {
    const socket = new THREE.IcosahedronGeometry(0.28, 1);
    transform(socket, x, 0.05, 0.5, 0, 0, 0, 1.0, 1.02, 0.6);
    parts.push(paint(socket, 0x100e0d, 0.02));
  }

  // Nasal cavity
  const nose = new THREE.ConeGeometry(0.13, 0.3, 4);
  transform(nose, 0, -0.13, 0.66, Math.PI, 0, 0.785);
  parts.push(paint(nose, 0x100e0d, 0.02));

  // Cheekbones
  for (const side of [-1, 1]) {
    const cheek = new THREE.BoxGeometry(0.2, 0.46, 0.32);
    transform(cheek, side * 0.63, -0.06, 0.26, 0, side * 0.25, side * -0.18);
    parts.push(paint(cheek, 0xdcd2b6, 0.05));
    const temple = new THREE.BoxGeometry(0.16, 0.34, 0.3);
    transform(temple, side * 0.6, 0.34, 0.16, 0, side * 0.2, side * 0.1);
    parts.push(paint(temple, 0xd6cbaf, 0.05));
  }

  // Horns (two-stage curve) and back crest
  for (const side of [-1, 1]) {
    const horn = new THREE.ConeGeometry(0.18, 0.9, 5);
    transform(horn, side * 0.5, 0.78, -0.06, 0.12, 0, side * -0.72);
    parts.push(paint(horn, 0xbdb096, 0.08));
    const horn2 = new THREE.ConeGeometry(0.1, 0.42, 4);
    transform(horn2, side * 0.82, 1.0, -0.16, 0.2, 0, side * -1.15);
    parts.push(paint(horn2, 0xab9e83, 0.08));
    const jawSpike = new THREE.ConeGeometry(0.06, 0.24, 4);
    transform(jawSpike, side * 0.7, -0.15, 0.05, 0, 0, side * -1.4);
    parts.push(paint(jawSpike, 0xcabfa4, 0.05));
  }
  const crest = new THREE.ConeGeometry(0.11, 0.36, 4);
  transform(crest, 0, 0.86, -0.22, 0.45, 0, 0);
  parts.push(paint(crest, 0xc9bea2, 0.05));
  const crest2 = new THREE.ConeGeometry(0.08, 0.26, 4);
  transform(crest2, 0.16, 0.78, -0.34, 0.6, 0, -0.3);
  parts.push(paint(crest2, 0xc2b79b, 0.05));
  const crest3 = crest2.clone();
  crest3.scale(-1, 1, 1);
  parts.push(crest3);

  // Upper teeth row
  for (let i = 0; i < 5; i++) {
    const tooth = new THREE.ConeGeometry(0.05, 0.22, 4);
    transform(tooth, -0.24 + i * 0.12, -0.66, 0.5, Math.PI, 0, 0);
    parts.push(paint(tooth, 0xf5eeda, 0.03));
  }
  for (const side of [-1, 1]) {
    const fang = new THREE.ConeGeometry(0.065, 0.3, 4);
    transform(fang, side * 0.34, -0.68, 0.44, Math.PI, 0, 0);
    parts.push(paint(fang, 0xf6efdb, 0.03));
  }

  // Floating bone hands with claws
  for (const side of [-1, 1]) {
    const palm = new THREE.IcosahedronGeometry(0.18, 0);
    transform(palm, side * 0.96, -0.4, 0.14, 0, 0, 0, 1.1, 0.75, 1.25);
    parts.push(paint(palm, 0xd7cdb3, 0.07));
    for (let i = 0; i < 3; i++) {
      const claw = new THREE.ConeGeometry(0.05, 0.34, 4);
      transform(claw, side * 0.96 + (i - 1) * 0.11, -0.55, 0.4, 1.2, 0, side * -0.06);
      parts.push(paint(claw, 0xc5b99e, 0.05));
    }
  }
  BODY_GEO = mergeParts(parts);

  const jawParts = [];
  const jaw = new THREE.BoxGeometry(0.76, 0.24, 0.52);
  transform(jaw, 0, -0.14, 0.2, 0.06, 0, 0);
  jawParts.push(paint(jaw, 0xd9cfb4, 0.05));
  for (let i = 0; i < 5; i++) {
    const tooth = new THREE.ConeGeometry(0.05, 0.2, 4);
    transform(tooth, -0.24 + i * 0.12, -0.01, 0.4, 0, 0, 0);
    jawParts.push(paint(tooth, 0xf3ecd8, 0.03));
  }
  for (const side of [-1, 1]) {
    const fang = new THREE.ConeGeometry(0.06, 0.24, 4);
    transform(fang, side * 0.33, -0.02, 0.36, 0, 0, 0);
    jawParts.push(paint(fang, 0xf4ecd8, 0.03));
  }
  JAW_GEO = mergeParts(jawParts);

  EYE_GEO = new THREE.SphereGeometry(0.1, 7, 5);
  TAIL_GEO = new THREE.ConeGeometry(0.5, 0.85, 7, 1, true);
  TAIL_GEO.rotateX(Math.PI);
  AURA_GEO = new THREE.TorusGeometry(0.86, 0.038, 4, 28);
  AURA_GEO.rotateX(Math.PI / 2);
  PROJECTILE_GEO = new THREE.IcosahedronGeometry(0.32, 1);
}

function levelAt(x, z) {
  const d = Math.hypot(x, z);
  return clamp(1 + Math.floor(d / 11), 1, 10);
}

class Enemy {
  constructor(manager, level, x, z, options = {}) {
    buildGeometry();
    this.manager = manager;
    this.world = manager.world;
    this.effects = manager.effects;
    this.audio = manager.audio;
    this.level = level;
    this.tier = tierFor(level);
    this.isCaster = options.caster ?? (level >= 3 && Math.random() < 0.42);
    this.home = new THREE.Vector3(x, 0, z);
    this.pos = new THREE.Vector3(x, 0, z);
    this.dead = false;
    this.dying = false;
    this.deathT = 0;
    this.removed = false;
    this.attackCooldown = 1 + Math.random() * 0.8;
    this.castCooldown = 2 + Math.random() * 2;
    this.castWindup = 0;
    this.attackWindup = 0;
    this.aggro = false;
    this.bobPhase = Math.random() * TAU;
    this.hoverHeight = 1.25 + 0.065 * level;
    this.scale = 0.82 + level * 0.037;
    this.radius = 0.62 * this.scale;
    this.maxHp = Math.round(30 + level * 17 + Math.pow(level, 1.35) * 4);
    this.hp = this.maxHp;
    this.maxMana = 100;
    this.mana = Math.random() * 55 + 25;
    this.damage = 4 + level * 2.05;
    this.speed = 1.7 + level * 0.14;
    this.xpReward = 8 + level * 4;
    this.scoreValue = 18 + level * 14;
    this.knock = new THREE.Vector3();
    this.flash = 0;
    this.lean = 0;
    this.buildMesh();
    this.updateBar(true);
    this.setPosition(x, z);
  }

  buildMesh() {
    const group = new THREE.Group();
    group.scale.setScalar(this.scale);
    this.group = group;

    this.boneMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, color: new THREE.Color().setHSL(0.1, 0.09, 0.94 - this.level * 0.012) });
    this.skull = new THREE.Mesh(BODY_GEO, this.boneMat);
    this.skull.castShadow = true;
    this.skull.receiveShadow = true;
    group.add(this.skull);

    this.jawPivot = new THREE.Group();
    this.jawPivot.position.set(0, -0.62, 0);
    this.jaw = new THREE.Mesh(JAW_GEO, this.boneMat);
    this.jaw.castShadow = true;
    this.jawPivot.add(this.jaw);
    group.add(this.jawPivot);

    this.eyeMat = new THREE.MeshBasicMaterial({ color: this.tier.eye });
    this.eyeL = new THREE.Mesh(EYE_GEO, this.eyeMat);
    this.eyeL.position.set(-0.31, 0.05, 0.6);
    this.eyeR = new THREE.Mesh(EYE_GEO, this.eyeMat);
    this.eyeR.position.set(0.31, 0.05, 0.6);
    group.add(this.eyeL, this.eyeR);

    this.eyeGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(),
      color: this.tier.eye,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    this.eyeGlow.scale.set(1.05, 1.05, 1);
    this.eyeGlow.position.set(0, 0.05, 0.68);
    group.add(this.eyeGlow);

    this.tailMat = new THREE.MeshBasicMaterial({ color: this.isCaster ? 0x5c3681 : 0x2c3b33, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide });
    this.tail = new THREE.Mesh(TAIL_GEO, this.tailMat);
    this.tail.position.y = -1.32;
    group.add(this.tail);

    if (this.isCaster) {
      this.auraMat = new THREE.MeshBasicMaterial({ color: 0xb07bff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
      this.aura = new THREE.Mesh(AURA_GEO, this.auraMat);
      this.aura.position.y = -0.66;
      this.aura.rotation.x = 0.18;
      group.add(this.aura);
    }

    this.barCanvas = document.createElement('canvas');
    this.barCanvas.width = 256;
    this.barCanvas.height = 96;
    this.barCtx = this.barCanvas.getContext('2d');
    this.barTexture = new THREE.CanvasTexture(this.barCanvas);
    this.barTexture.colorSpace = THREE.SRGBColorSpace;
    this.barTexture.minFilter = THREE.LinearFilter;
    this.barSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.barTexture,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      fog: false
    }));
    this.barSprite.scale.set(1.9, 0.7125, 1);
    this.barSprite.position.y = 1.78;
    this.barSprite.renderOrder = 6;
    group.add(this.barSprite);

    this.manager.scene.add(group);

    this.blob = new THREE.Mesh(this.manager.blobGeo, this.manager.blobMat);
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.scale.setScalar(this.scale * 1.45);
    this.blob.renderOrder = 1;
    this.manager.scene.add(this.blob);
  }

  setPosition(x, z) {
    this.pos.x = x;
    this.pos.z = z;
    this.home.x = x;
    this.home.z = z;
    this.group.position.set(x, this.world.height(x, z) + this.hoverHeight, z);
  }

  updateBar(force = false) {
    const hpRatio = clamp(this.hp / this.maxHp, 0, 1);
    const mpRatio = clamp(this.mana / this.maxMana, 0, 1);
    if (!force && Math.abs(hpRatio - (this.lastHpRatio ?? -1)) < 0.005 && Math.abs(mpRatio - (this.lastMpRatio ?? -1)) < 0.02) return;
    this.lastHpRatio = hpRatio;
    this.lastMpRatio = mpRatio;
    const ctx = this.barCtx;
    const w = 256, h = 96;
    ctx.clearRect(0, 0, w, h);
    // plate
    ctx.fillStyle = 'rgba(6,12,9,0.72)';
    ctx.beginPath();
    ctx.moveTo(10, 8);
    ctx.lineTo(w - 10, 8);
    ctx.lineTo(w - 18, 28);
    ctx.lineTo(w - 18, h - 14);
    ctx.lineTo(w - 34, h - 4);
    ctx.lineTo(28, h - 4);
    ctx.lineTo(8, h - 20);
    ctx.lineTo(8, 22);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(170,210,175,0.28)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // level diamond
    ctx.save();
    ctx.translate(31, 47);
    ctx.rotate(Math.PI / 4);
    const tierColor = '#' + this.tier.eye.toString(16).padStart(6, '0');
    ctx.fillStyle = 'rgba(12,20,15,0.95)';
    ctx.strokeStyle = tierColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(-15, -15, 30, 30);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = tierColor;
    ctx.font = 'bold 17px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(this.level), 31, 48);

    const barX = 55, barW = 184;
    // hp
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(barX - 2, 26, barW + 4, 23);
    const hpGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    if (hpRatio > 0.55) {
      hpGrad.addColorStop(0, '#4fcf74');
      hpGrad.addColorStop(1, '#a6e86d');
    } else if (hpRatio > 0.25) {
      hpGrad.addColorStop(0, '#e6a63b');
      hpGrad.addColorStop(1, '#f4d160');
    } else {
      hpGrad.addColorStop(0, '#d83f35');
      hpGrad.addColorStop(1, '#ff7a5c');
    }
    ctx.fillStyle = hpGrad;
    ctx.fillRect(barX, 28, barW * hpRatio, 19);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(barX, 28, barW * hpRatio, 6);
    ctx.strokeStyle = 'rgba(230,240,225,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX - 0.5, 27.5, barW + 1, 20);

    // mana
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(barX - 2, 55, barW + 4, 15);
    const mpGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    mpGrad.addColorStop(0, '#2c78d8');
    mpGrad.addColorStop(1, '#78d4ff');
    ctx.fillStyle = mpGrad;
    ctx.fillRect(barX, 57, barW * mpRatio, 11);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(barX, 57, barW * mpRatio, 3);
    ctx.strokeStyle = 'rgba(170,220,255,0.28)';
    ctx.strokeRect(barX - 0.5, 56.5, barW + 1, 12);

    ctx.fillStyle = 'rgba(210,225,205,0.7)';
    ctx.font = 'bold 9px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(this.isCaster ? 'PENYIHIR' : 'TENGKORAK', w - 25, 20);
    this.barTexture.needsUpdate = true;
  }

  takeDamage(amount, fromPos, knock = 4, options = {}) {
    if (this.dead || this.dying) return { dead: false, damage: 0, crit: false };
    let dmg = amount * (0.9 + Math.random() * 0.2);
    let crit = false;
    if (options.canCrit && Math.random() < 0.22) {
      crit = true;
      dmg *= 1.65;
    }
    dmg = Math.max(1, Math.round(dmg));
    this.hp -= dmg;
    this.flash = 0.14;
    this.aggro = true;
    if (fromPos) {
      const dx = this.pos.x - fromPos.x;
      const dz = this.pos.z - fromPos.z;
      const d = Math.hypot(dx, dz) || 1;
      this.knock.set((dx / d) * knock, 0, (dz / d) * knock);
    }
    this.lastHpRatio = -1;
    this.updateBar();
    const hitPos = new THREE.Vector3(this.group.position.x, this.group.position.y + 0.2, this.group.position.z);
    if (crit) {
      this.effects.crit(hitPos);
      this.audio?.hit(true);
    } else {
      this.effects.hit(hitPos, this.tier.eye, 14);
      this.audio?.hit(false);
    }
    this.manager.onHit?.(this, dmg, crit);
    if (this.hp <= 0) {
      this.die();
      return { dead: true, damage: dmg, crit };
    }
    return { dead: false, damage: dmg, crit };
  }

  die() {
    if (this.dying) return;
    this.dying = true;
    this.dead = true;
    this.hp = 0;
    this.deathT = 0;
    this.barSprite.visible = false;
    if (this.blob) this.blob.visible = false;
    this.aura && (this.aura.visible = false);
    this.eyeGlow.material.opacity = 0.15;
    this.manager.handleKill(this);
  }

  startCast() {
    if (!this.isCaster || this.mana < 45 || this.castCooldown > 0 || this.castWindup > 0) return false;
    this.castWindup = 0.62;
    this.mana -= 45;
    this.castCooldown = 4.4 + Math.random() * 1.5;
    this.lastMpRatio = -1;
    this.updateBar();
    this.audio?.cast();
    this.effects.cast(new THREE.Vector3(this.group.position.x, this.group.position.y - 0.2, this.group.position.z), 0xb07bff);
    return true;
  }

  update(dt, player, active) {
    if (this.dying) {
      this.deathT += dt;
      const k = clamp(this.deathT / 0.8, 0, 1);
      this.group.rotation.z += dt * 2.6;
      this.group.position.y -= dt * 1.3;
      this.group.scale.setScalar(this.scale * (1 - k * 0.55));
      this.tailMat.opacity = 0.38 * (1 - k);
      this.eyeGlow.material.opacity = 0.2 * (1 - k);
      if (this.deathT > 0.85) this.removed = true;
      return;
    }
    if (this.removed) return;

    this.bobPhase += dt * (1.7 + this.level * 0.08);
    this.flash = Math.max(0, this.flash - dt);
    this.boneMat.emissive.setHex(this.flash > 0 ? 0x8a6a38 : 0x000000);
    this.boneMat.emissiveIntensity = this.flash > 0 ? 1.4 : 1;

    const dx = player.position.x - this.pos.x;
    const dz = player.position.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const angle = Math.atan2(dx, dz);
    let targetHover = this.hoverHeight + Math.sin(this.bobPhase) * 0.12;
    const groundY = this.world.height(this.pos.x, this.pos.z);

    this.attackCooldown -= dt;
    this.castCooldown -= dt;
    this.mana = Math.min(this.maxMana, this.mana + dt * (3.5 + this.level * 0.22));
    if (Math.abs(this.mana - (this.lastMpRatio ?? 0) * this.maxMana) > 2) this.updateBar();

    let moving = false;
    let targetLean = 0;

    const playerNearSpawn = Math.hypot(player.position.x, player.position.z) < 10;
    if (playerNearSpawn) this.aggro = false;
    if (active && !player.dead && dist < 18) {
      this.aggro = true;
    }

    if (this.aggro && active && !player.dead) {
      // Face player smoothly
      this.group.rotation.y = this.angleLerp(this.group.rotation.y, angle, 1 - Math.exp(-dt * 7));

      if (this.castWindup > 0) {
        this.castWindup -= dt;
        this.eyeGlow.scale.setScalar(1.5 + Math.sin(this.bobPhase * 8) * 0.25);
        this.eyeMat.color.setHex(this.castWindup > 0.2 ? 0xe6c6ff : this.tier.eye);
        targetHover += 0.25;
        if (this.castWindup <= 0) {
          this.mana -= 0;
          this.manager.spawnProjectile(this, player);
          this.eyeMat.color.setHex(this.tier.eye);
        }
      } else if (this.attackWindup > 0) {
        this.attackWindup -= dt;
        this.jawPivot.rotation.x = lerp(this.jawPivot.rotation.x, 0.55, 1 - Math.exp(-dt * 15));
        targetHover += 0.12;
        if (this.attackWindup <= 0) {
          this.jawPivot.rotation.x = -0.05;
          this.attackCooldown = 1.95 + Math.random() * 0.6;
          if (dist < 3.5) {
            player.takeDamage(this.damage, this.pos);
          }
          this.effects.burst(new THREE.Vector3(this.group.position.x, this.group.position.y - 0.2, this.group.position.z), this.tier.eye, 10, 3);
        }
      } else {
        // Ranged caster behavior
        if (this.isCaster && this.mana >= 45 && this.castCooldown <= 0 && dist > 4.2 && dist < 15) {
          this.startCast();
        } else if (dist > 2.6) {
          // Chase with slight separation
          let sx = 0, sz = 0;
          for (const other of this.manager.enemies) {
            if (other === this || other.dying) continue;
            const ox = this.pos.x - other.pos.x;
            const oz = this.pos.z - other.pos.z;
            const od = ox * ox + oz * oz;
            if (od < 3.2 && od > 0.001) {
              const inv = 1 / Math.sqrt(od);
              sx += ox * inv;
              sz += oz * inv;
            }
          }
          const nx = dx / (dist || 1) + sx * 0.55;
          const nz = dz / (dist || 1) + sz * 0.55;
          const len = Math.hypot(nx, nz) || 1;
          const spd = this.speed * (dist > 5 ? 1 : 0.72);
          this.pos.x += (nx / len) * spd * dt;
          this.pos.z += (nz / len) * spd * dt;
          moving = true;
          targetLean = -0.13;
        } else if (this.attackCooldown <= 0) {
          this.attackWindup = 0.42;
          this.effects.cast(new THREE.Vector3(this.group.position.x, this.group.position.y - 0.3, this.group.position.z), 0xff7a5c);
        }
      }
    } else {
      // Return home and drift
      const hx = this.home.x - this.pos.x;
      const hz = this.home.z - this.pos.z;
      const hd = Math.hypot(hx, hz);
      if (hd > 2.2) {
        this.pos.x += (hx / hd) * 1.15 * dt;
        this.pos.z += (hz / hd) * 1.15 * dt;
        targetLean = -0.05;
      }
      const t = performance.now() * 0.0002 + this.bobPhase;
      this.pos.x += Math.cos(t) * 0.1 * dt;
      this.pos.z += Math.sin(t * 1.2) * 0.1 * dt;
      this.group.rotation.y = this.angleLerp(this.group.rotation.y, this.homeAngle ?? this.group.rotation.y, 1 - Math.exp(-dt * 2));
      this.jawPivot.rotation.x = lerp(this.jawPivot.rotation.x, Math.sin(this.bobPhase * 0.8) * 0.06, 1 - Math.exp(-dt * 5));
    }

    this.jawPivot.rotation.x = lerp(this.jawPivot.rotation.x, this.attackWindup > 0 || this.castWindup > 0 ? 0.5 : 0.02, 1 - Math.exp(-dt * 10));

    this.knock.multiplyScalar(Math.exp(-dt * 6));
    this.pos.x += this.knock.x * dt;
    this.pos.z += this.knock.z * dt;

    const dr = Math.hypot(this.pos.x, this.pos.z);
    if (dr > 109) { this.pos.x *= 109 / dr; this.pos.z *= 109 / dr; }

    if (this.blob) {
      this.blob.position.set(this.pos.x, groundY + 0.05, this.pos.z);
      this.blob.scale.setScalar(this.scale * (1.45 - Math.max(0, this.group.position.y - groundY) * 0.14));
    }
    this.group.position.x = this.pos.x;
    this.group.position.z = this.pos.z;
    this.group.position.y = lerp(this.group.position.y, groundY + targetHover, 1 - Math.exp(-dt * 8));
    this.group.rotation.z = lerp(this.group.rotation.z, targetLean + Math.sin(this.bobPhase * 1.3) * 0.025, 1 - Math.exp(-dt * 5));

    this.eyeGlow.material.opacity = 0.35 + Math.sin(this.bobPhase * 2.4) * 0.1 + (this.castWindup > 0 ? 0.4 : 0);
    this.eyeGlow.scale.setScalar(1.4 + Math.sin(this.bobPhase * 2.4) * 0.12 + (this.castWindup > 0 ? 0.5 : 0));
    if (this.aura) {
      this.aura.rotation.y += dt * 1.4;
      this.auraMat.opacity = 0.35 + Math.sin(this.bobPhase * 1.8) * 0.15;
    }
    this.barSprite.visible = active && dist < 30;
    if (this.barSprite.visible) {
      this.barSprite.scale.set(1.9, 0.7125, 1);
    }
  }

  angleLerp(a, b, t) {
    let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
    return a + d * t;
  }

  dispose() {
    this.manager.scene.remove(this.group);
    if (this.blob) this.manager.scene.remove(this.blob);
    this.barTexture.dispose();
    this.boneMat.dispose();
    this.eyeMat.dispose();
    this.tailMat.dispose();
    this.eyeGlow.material.dispose();
    this.barSprite.material.dispose();
    this.auraMat?.dispose();
  }
}

export class EnemyManager {
  constructor(scene, world, effects, audio) {
    this.scene = scene;
    this.world = world;
    this.effects = effects;
    this.audio = audio;
    this.enemies = [];
    this.projectiles = [];
    this.onKill = null;
    this.onHit = null;
    this.spawnTimer = 0;
    this.maxEnemies = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 760 ? 16 : 24;
    this.projectileGeo = new THREE.IcosahedronGeometry(0.3, 1);
    this.blobGeo = new THREE.CircleGeometry(0.82, 16);
    this.blobMat = new THREE.MeshBasicMaterial({ color: 0x07130d, transparent: true, opacity: 0.42, depthWrite: false });
    this.projectileMatProto = new THREE.MeshBasicMaterial({ color: 0xb37dff });
    this.projectileGlowTex = glowTexture();
    this.spawnInitial();
  }

  spawnInitial() {
    const pts = [
      [-7, -17], [9.5, -20], [-15, -25], [4, -31], [17, -13], [-22, -7], [20, -30],
      [-10, -40], [27, -36], [-30, -30], [34, -8], [-36, 13], [21, 17], [-14, 30],
      [40, 24], [-42, 38], [10, 45], [49, -34], [-49, -46], [31, 52],
      [0, -103], [90, 55], [100, -20], [-88, -65]
    ];
    const count = Math.min(pts.length, this.maxEnemies);
    for (let i = 0; i < count; i++) {
      const [x, z] = pts[i];
      const level = levelAt(x, z);
      const enemy = new Enemy(this, level, x, z, { caster: i % 3 === 1 });
      this.enemies.push(enemy);
    }
  }

  findSpawnSpot(player) {
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * TAU;
      const dist = 26 + Math.random() * 16;
      const x = player.position.x + Math.cos(a) * dist;
      const z = player.position.z + Math.sin(a) * dist;
      const dOrigin = Math.hypot(x, z);
      if (dOrigin > 106) continue;
      if (dOrigin < 13 && player.position.length() < 6) continue;
      return { x, z };
    }
    const a = Math.random() * TAU;
    return { x: Math.cos(a) * 60, z: Math.sin(a) * 60 };
  }

  spawnOne(player) {
    const spot = this.findSpawnSpot(player);
    const level = levelAt(spot.x, spot.z);
    const enemy = new Enemy(this, level, spot.x, spot.z, { caster: Math.random() < 0.4 });
    this.enemies.push(enemy);
    return enemy;
  }

  spawnProjectile(enemy, player) {
    const origin = new THREE.Vector3(enemy.group.position.x, enemy.group.position.y + 0.05, enemy.group.position.z);
    const target = new THREE.Vector3(player.position.x, player.position.y + 1.15, player.position.z);
    const dir = target.sub(origin).normalize();
    const mesh = new THREE.Mesh(this.projectileGeo, this.projectileMatProto.clone());
    mesh.material.color.setHex(enemy.tier.eye);
    mesh.position.copy(origin);
    mesh.scale.setScalar(0.9 + enemy.level * 0.03);
    this.scene.add(mesh);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.projectileGlowTex,
      color: enemy.tier.eye,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    glow.scale.set(1.7, 1.7, 1);
    mesh.add(glow);
    this.projectiles.push({
      mesh,
      dir,
      speed: 9.2,
      damage: enemy.damage * 0.82,
      life: 3.2,
      radius: 1.05,
      color: enemy.tier.eye,
      trailT: 0
    });
    this.audio?.cast();
  }

  updateProjectiles(dt, player) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.mesh.position.addScaledVector(p.dir, p.speed * dt);
      p.mesh.rotation.x += dt * 5;
      p.mesh.rotation.y += dt * 7;
      p.trailT -= dt;
      if (p.trailT <= 0) {
        p.trailT = 0.05;
        this.effects.spark.spawn(p.mesh.position, { count: 1, color: p.color, color2: 0xffffff, speedMin: 0.1, speedMax: 1, sizeMin: 0.1, sizeMax: 0.2, lifeMin: 0.2, lifeMax: 0.45, gravity: 0, drag: 2, alpha: 0.7 });
      }
      const groundY = this.world.height(p.mesh.position.x, p.mesh.position.z);
      let hit = false;
      if (!player.dead) {
        const dx = p.mesh.position.x - player.position.x;
        const dy = p.mesh.position.y - (player.position.y + 1.1);
        const dz = p.mesh.position.z - player.position.z;
        if (dx * dx + dy * dy + dz * dz < p.radius * p.radius) {
          player.takeDamage(p.damage, p.mesh.position);
          hit = true;
        }
      }
      if (p.mesh.position.y < groundY + 0.15) hit = true;
      if (p.life <= 0) hit = true;
      if (hit) {
        this.effects.burst(p.mesh.position, p.color, 22, 5.5);
        this.effects.ring(new THREE.Vector3(p.mesh.position.x, Math.max(groundY, p.mesh.position.y), p.mesh.position.z), p.color, 2.4, 0.35);
        this.audio?.impact();
        this.scene.remove(p.mesh);
        p.mesh.material.dispose();
        p.mesh.children[0]?.material.dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }

  update(dt, player, camera, active = true) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.update(dt, player, active);
      if (e.removed) {
        e.dispose();
        this.enemies.splice(i, 1);
      }
    }
    this.updateProjectiles(dt, player);
    if (active) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.enemies.length < this.maxEnemies) {
        this.spawnOne(player);
        this.spawnTimer = 2.6 + Math.random() * 2.2;
      }
    }
  }

  damageInArc(origin, yaw, range, arcCos, damage, knock, options = {}) {
    let hits = 0;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    for (const e of this.enemies) {
      if (e.dead || e.dying) continue;
      const dx = e.pos.x - origin.x;
      const dz = e.pos.z - origin.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range + e.radius) continue;
      if (arcCos > -0.9 && dist > 0.001) {
        const dot = (dx / dist) * fx + (dz / dist) * fz;
        if (dot < arcCos) continue;
      }
      e.takeDamage(damage, origin, knock, options);
      hits++;
    }
    return hits;
  }

  handleKill(enemy) {
    this.effects.enemyDeath(new THREE.Vector3(enemy.group.position.x, enemy.group.position.y, enemy.group.position.z), enemy.tier.eye, enemy.level >= 7);
    this.audio?.enemyDie(enemy.level >= 7);
    this.onKill?.(enemy);
  }

  resetAroundSpawn() {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const d = Math.hypot(e.pos.x, e.pos.z);
      if (d < 23 || e.dying) {
        if (!e.dying) {
          e.effects.burst(new THREE.Vector3(e.group.position.x, e.group.position.y, e.group.position.z), 0x8be0a4, 10, 2.5);
        }
        this.scene.remove(e.group);
        if (e.blob) this.scene.remove(e.blob);
        e.dispose();
        this.enemies.splice(i, 1);
      }
    }
    this.spawnTimer = 2.2;
    this.projectiles.forEach((p) => {
      this.scene.remove(p.mesh);
      p.mesh.material.dispose();
      p.mesh.children[0]?.material.dispose();
    });
    this.projectiles.length = 0;
    while (this.enemies.length < 5) {
      const a = Math.random() * TAU;
      const dist = 26 + Math.random() * 10;
      const level = levelAt(Math.cos(a) * dist, Math.sin(a) * dist);
      const enemy = new Enemy(this, level, Math.cos(a) * dist, Math.sin(a) * dist);
      this.enemies.push(enemy);
    }
  }
}

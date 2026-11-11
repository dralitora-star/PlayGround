import * as THREE from 'three';

const TAU = Math.PI * 2;

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function smooth(t) { return t * t * (3 - 2 * t); }
function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * t;
}

function mat(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });
}

export class Hero {
  constructor(scene, world, effects) {
    this.scene = scene;
    this.world = world;
    this.effects = effects;
    this.level = 1;
    this.xp = 0;
    this.maxHp = 100;
    this.hp = 100;
    this.maxMana = 100;
    this.mana = 100;
    this.attackPower = 15;
    this.xpNext = 35;
    this.alive = true;
    this.dead = false;
    this.deathT = 0;
    this.invuln = 0;
    this.attackCooldown = 0;
    this.whirlCooldown = 0;
    this.manaCost = 35;
    this.attack = null;
    this.spin = null;
    this.spinOffset = 0;
    this.comboStep = 0;
    this.comboTimer = 0;
    this.lastDamageAt = -99;
    this.walkPhase = 0;
    this.moving = false;
    this.yaw = Math.PI;
    this.velocity = new THREE.Vector3();
    this.knockback = new THREE.Vector3();
    this.footstepTimer = 0;
    this.hurtTimer = 0;
    this.totalKills = 0;
    this.game = null;
    this.build();
    this.resetToSpawn();
  }

  build() {
    this.root = new THREE.Group();
    this.model = new THREE.Group();
    this.model.scale.setScalar(0.94);
    this.root.add(this.model);
    this.scene.add(this.root);

    const skin = mat(0xc98f67);
    const skinDark = mat(0xa9744f);
    const hair = mat(0x33251d);
    const tunic = mat(0x2d6e60);
    const tunicDark = mat(0x23544a);
    const leather = mat(0x6e4a2e);
    const leatherDark = mat(0x4b301d);
    const pants = mat(0x2b3440);
    const boot = mat(0x40342b);
    const metal = new THREE.MeshStandardMaterial({ color: 0xcbd4d8, metalness: 0.65, roughness: 0.32, flatShading: true });
    const gold = new THREE.MeshStandardMaterial({ color: 0xd8a745, metalness: 0.55, roughness: 0.38, flatShading: true });
    const bladeGlow = new THREE.MeshBasicMaterial({ color: 0xa9e9ff, transparent: true, opacity: 0.68 });
    const capeMat = mat(0x1e5146, { side: THREE.DoubleSide });
    const scarfMat = mat(0xb84f3b);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.23, 0.66, 0.25);
    legGeo.translate(0, -0.33, 0);
    const bootGeo = new THREE.BoxGeometry(0.27, 0.23, 0.37);
    bootGeo.translate(0, -0.78, 0.04);
    const legPivot = (x) => {
      const g = new THREE.Group();
      g.position.set(x, 0.95, 0);
      const leg = new THREE.Mesh(legGeo, pants);
      const foot = new THREE.Mesh(bootGeo, boot);
      g.add(leg, foot);
      this.model.add(g);
      return g;
    };
    this.leftLeg = legPivot(-0.19);
    this.rightLeg = legPivot(0.19);

    // Torso + hips
    this.torso = new THREE.Group();
    this.torso.position.y = 0.92;
    this.model.add(this.torso);
    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.47, 0.94, 6), tunic);
    chest.position.y = 0.48;
    this.torso.add(chest);
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.56, 0.35, 6, 1, true), tunicDark);
    skirt.position.y = 0.02;
    this.torso.add(skirt);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.13, 0.56), leatherDark);
    belt.position.y = 0.1;
    this.torso.add(belt);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.17, 0.05), gold);
    buckle.position.set(0, 0.1, 0.28);
    this.torso.add(buckle);
    const chestStrap = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 0.05), leather);
    chestStrap.position.set(-0.06, 0.5, 0.36);
    chestStrap.rotation.z = 0.32;
    this.torso.add(chestStrap);

    // Cape
    this.capePivot = new THREE.Group();
    this.capePivot.position.set(0, 0.86, -0.31);
    this.torso.add(this.capePivot);
    const capeGeo = new THREE.BufferGeometry();
    capeGeo.setAttribute('position', new THREE.Float32BufferAttribute([
      -0.4, 0, 0, 0.4, 0, 0,
      -0.52, -0.5, -0.1, 0.52, -0.5, -0.1,
      -0.6, -1.0, -0.16, 0.6, -1.0, -0.16
    ], 3));
    capeGeo.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4]);
    capeGeo.computeVertexNormals();
    const cape = new THREE.Mesh(capeGeo, capeMat);
    cape.castShadow = true;
    this.capePivot.add(cape);

    // Neck and faceless head
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.18, 6), skinDark);
    neck.position.y = 0.99;
    this.torso.add(neck);
    this.head = new THREE.Group();
    this.head.position.y = 1.24;
    this.torso.add(this.head);
    const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.33, 1), skin);
    skull.scale.set(0.94, 1.06, 0.9);
    skull.castShadow = true;
    this.head.add(skull);
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.345, 7, 5, 0, TAU, 0, Math.PI * 0.58), hair);
    hairCap.position.set(0, 0.055, -0.015);
    hairCap.scale.set(1.02, 1.02, 1.03);
    this.head.add(hairCap);
    const sideHairL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.28, 0.5), hair);
    sideHairL.position.set(-0.295, 0.03, -0.03);
    this.head.add(sideHairL);
    const sideHairR = sideHairL.clone();
    sideHairR.position.x = 0.295;
    this.head.add(sideHairR);
    const fringe = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.3, 4), hair);
    fringe.position.set(0.17, 0.23, 0.22);
    fringe.rotation.set(0.4, 0, 0.5);
    this.head.add(fringe);
    const earL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.13, 0.08), skinDark);
    earL.position.set(-0.315, -0.01, 0);
    this.head.add(earL);
    const earR = earL.clone();
    earR.position.x = 0.315;
    this.head.add(earR);
    // No eyes, nose, or mouth: faceless low-poly hero.

    // Scarf
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.075, 4, 9), scarfMat);
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 1.0;
    this.torso.add(scarf);
    this.scarfTail = new THREE.Group();
    this.scarfTail.position.set(-0.16, 0.98, -0.25);
    this.torso.add(this.scarfTail);
    const tail1 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.48, 0.05), scarfMat);
    tail1.position.y = -0.23;
    tail1.rotation.z = 0.1;
    this.scarfTail.add(tail1);
    const tail2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.04), scarfMat);
    tail2.position.set(-0.05, -0.57, -0.02);
    tail2.rotation.z = 0.25;
    this.scarfTail.add(tail2);

    // Arms
    const armGeo = new THREE.BoxGeometry(0.17, 0.6, 0.19);
    armGeo.translate(0, -0.3, 0);
    const handGeo = new THREE.IcosahedronGeometry(0.11, 0);
    handGeo.translate(0, -0.64, 0);
    const armPivot = (x, side) => {
      const g = new THREE.Group();
      g.position.set(x, 0.71, 0);
      const arm = new THREE.Mesh(armGeo, skin);
      arm.castShadow = true;
      const hand = new THREE.Mesh(handGeo, skinDark);
      hand.castShadow = true;
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.21), leather);
      band.position.y = -0.47;
      g.add(arm, hand, band);
      this.torso.add(g);
      return g;
    };
    this.leftArm = armPivot(-0.5, -1);
    this.rightArm = armPivot(0.5, 1);

    // Pauldrons
    const pauldronGeo = new THREE.DodecahedronGeometry(0.25, 0);
    const pl = new THREE.Mesh(pauldronGeo, leather);
    pl.scale.set(1.15, 0.6, 1);
    pl.position.set(-0.52, 0.77, 0);
    pl.castShadow = true;
    this.torso.add(pl);
    const pr = new THREE.Mesh(pauldronGeo, metal);
    pr.scale.set(1.05, 0.55, 0.95);
    pr.position.set(0.53, 0.77, 0);
    pr.castShadow = true;
    this.torso.add(pr);
    for (let i = 0; i < 3; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.17, 4), metal);
      spike.position.set(0.48 + i * 0.07, 0.93 - i * 0.02, 0.04);
      spike.rotation.z = -0.25;
      this.torso.add(spike);
    }

    // Sword
    this.sword = new THREE.Group();
    this.sword.position.set(0, -0.68, 0);
    this.sword.rotation.set(0.26, 0, -0.24);
    this.rightArm.add(this.sword);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.052, 0.32, 6), leatherDark);
    grip.position.y = 0.06;
    this.sword.add(grip);
    const pommel = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 0), gold);
    pommel.position.y = -0.11;
    this.sword.add(pommel);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.075, 0.11), gold);
    guard.position.y = 0.23;
    this.sword.add(guard);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.94, 0.038), metal);
    blade.position.y = 0.76;
    blade.castShadow = true;
    this.sword.add(blade);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.078, 0.3, 4), metal);
    tip.position.y = 1.36;
    tip.rotation.y = Math.PI / 4;
    this.sword.add(tip);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.025, 1.05, 0.045), bladeGlow);
    edge.position.set(0.04, 0.78, 0);
    this.sword.add(edge);

    this.bladeBase = new THREE.Object3D();
    this.bladeBase.position.set(0, 0.3, 0);
    this.sword.add(this.bladeBase);
    this.bladeTip = new THREE.Object3D();
    this.bladeTip.position.set(0, 1.5, 0);
    this.sword.add(this.bladeTip);

    this.model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });

    this.baseY = 0;
  }

  setGame(game) { this.game = game; }

  get position() { return this.root.position; }
  get yawAngle() { return this.yaw; }

  resetToSpawn() {
    this.level = 1;
    this.xp = 0;
    this.xpNext = 35;
    this.maxHp = 100;
    this.hp = 100;
    this.maxMana = 100;
    this.mana = 100;
    this.attackPower = 15;
    this.dead = false;
    this.alive = true;
    this.deathT = 0;
    this.invuln = 0;
    this.attack = null;
    this.spin = null;
    this.spinOffset = 0;
    this.attackCooldown = 0;
    this.whirlCooldown = 0;
    this.comboStep = 0;
    this.comboTimer = 0;
    this.hurtTimer = 0;
    this.lastDamageAt = -99;
    this.velocity.set(0, 0, 0);
    this.knockback.set(0, 0, 0);
    this.yaw = Math.PI;
    this.root.position.set(0, this.world.height(0, 0), 0);
    this.model.position.set(0, 0, 0);
    this.model.rotation.set(0, this.yaw, 0);
    this.model.visible = true;
    this.root.visible = true;
    this.torso.rotation.set(0, 0, 0);
    this.leftArm.rotation.set(0.06, 0, -0.1);
    this.rightArm.rotation.set(-0.12, 0, 0.32);
    this.leftLeg.rotation.set(0, 0, 0);
    this.rightLeg.rotation.set(0, 0, 0);
    this.effects.clearTrail();
  }

  recalcStats() {
    this.maxHp = 100 + (this.level - 1) * 20;
    this.maxMana = 100 + (this.level - 1) * 8;
    this.attackPower = 15 + (this.level - 1) * 3.4;
    this.xpNext = this.level >= 10 ? 1 : Math.round(35 + (this.level - 1) * 21);
  }

  addXp(amount) {
    if (this.level >= 10) {
      this.xp = 1;
      return 0;
    }
    this.xp += amount;
    let ups = 0;
    while (this.xp >= this.xpNext && this.level < 10) {
      this.xp -= this.xpNext;
      this.level++;
      ups++;
      this.recalcStats();
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.32);
      this.mana = Math.min(this.maxMana, this.mana + this.maxMana * 0.5);
    }
    if (this.level >= 10) this.xp = 1;
    return ups;
  }

  isBusy() { return Boolean(this.attack || this.spin); }
  isAttacking() { return Boolean(this.attack); }

  canAttack() {
    return !this.dead && !this.attack && !this.spin && this.attackCooldown <= 0;
  }

  startAttack() {
    if (!this.canAttack()) return false;
    const step = this.comboStep;
    this.comboStep = (this.comboStep + 1) % 3;
    const types = [
      { type: 'slash1', dur: 0.42, at: 0.4, mult: 1, range: 3.5, arc: 1.12, knock: 4.2 },
      { type: 'slash2', dur: 0.45, at: 0.4, mult: 1.18, range: 3.6, arc: 1.18, knock: 4.8 },
      { type: 'slam', dur: 0.62, at: 0.54, mult: 1.7, range: 4.1, arc: 0.95, knock: 7.5 }
    ];
    const def = types[step];
    this.attack = { ...def, t: 0, didHit: false, step };
    this.attackCooldown = def.dur * 0.82;
    this.comboTimer = 2.4;
    this.game?.onSwing(step);
    return true;
  }

  startWhirl() {
    if (this.dead || this.attack || this.spin || this.whirlCooldown > 0) return false;
    if (this.mana < this.manaCost) {
      this.game?.onNoMana();
      return false;
    }
    this.mana -= this.manaCost;
    this.spin = { t: 0, dur: 0.92, ticks: [0.14, 0.38, 0.62], nextTick: 0 };
    this.whirlCooldown = 3.4;
    this.attack = null;
    this.game?.onWhirlStart();
    return true;
  }

  takeDamage(amount, source) {
    if (this.dead || this.invuln > 0) return false;
    const dmg = Math.max(1, Math.round(amount));
    this.hp = Math.max(0, this.hp - dmg);
    this.invuln = 0.72;
    this.hurtTimer = 0.35;
    this.lastDamageAt = this.game?.time ?? 0;
    if (source) {
      const dx = this.root.position.x - source.x;
      const dz = this.root.position.z - source.z;
      const d = Math.hypot(dx, dz) || 1;
      this.knockback.set((dx / d) * 5.5, 0, (dz / d) * 5.5);
    }
    this.effects.playerHurt(new THREE.Vector3(this.root.position.x, this.root.position.y + 1.3, this.root.position.z));
    this.game?.onPlayerHurt(dmg);
    if (this.hp <= 0) {
      this.die();
      return true;
    }
    return true;
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.alive = false;
    this.deathT = 0;
    this.attack = null;
    this.spin = null;
    this.velocity.set(0, 0, 0);
    this.knockback.set(0, 0, 0);
    this.game?.onPlayerDeath();
  }

  respawn() {
    this.resetToSpawn();
  }

  doMeleeHit() {
    if (!this.game?.enemyManager) return;
    const a = this.attack;
    const dmg = this.attackPower * a.mult;
    const hits = this.game.enemyManager.damageInArc(
      new THREE.Vector3(this.root.position.x, this.root.position.y + 1.1, this.root.position.z),
      this.yaw,
      a.range,
      Math.cos(a.arc / 2),
      dmg,
      a.knock,
      { source: 'hero', canCrit: a.step === 2 }
    );
    if (hits > 0) this.game?.onMeleeConnect(hits, a.step);
    this.game?.shake(a.step === 2 ? 0.2 : 0.09);
  }

  doWhirlHit() {
    if (!this.game?.enemyManager) return;
    const hits = this.game.enemyManager.damageInArc(
      new THREE.Vector3(this.root.position.x, this.root.position.y + 1.1, this.root.position.z),
      this.yaw,
      5.0,
      -1,
      this.attackPower * 0.82,
      8.5,
      { source: 'whirl', canCrit: false }
    );
    if (hits > 0) this.game?.onMeleeConnect(hits, 'whirl');
    this.game?.shake(0.16);
  }

  update(dt, input) {
    if (this.dead) {
      this.deathT += dt;
      const k = Math.min(1, this.deathT / 0.85);
      this.model.rotation.x = lerp(this.model.rotation.x, -1.45, k);
      this.model.position.y = lerp(this.model.position.y, -0.25, k);
      this.model.rotation.z = Math.sin(k * Math.PI) * 0.12;
      this.effects.clearTrail();
      return;
    }

    if (this.invuln > 0) this.invuln -= dt;
    if (this.hurtTimer > 0) this.hurtTimer -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.whirlCooldown > 0) this.whirlCooldown -= dt;
    if (this.comboTimer > 0) this.comboTimer -= dt;
    else this.comboStep = 0;

    this.mana = Math.min(this.maxMana, this.mana + (5.2 + this.level * 0.32) * dt);
    const calm = (this.game?.time ?? 0) - this.lastDamageAt;
    if (calm > 7 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + (1.4 + this.level * 0.15) * dt);
    }

    const active = this.spin || this.attack;
    const speedScale = this.spin ? 0.25 : this.attack ? 0.52 : 1;
    let ix = input.x || 0;
    let iz = input.z || 0;
    const mag = Math.hypot(ix, iz);
    if (mag > 1) { ix /= mag; iz /= mag; }
    this.moving = mag > 0.08;

    const speed = 7.3;
    const targetVx = ix * speed * speedScale;
    const targetVz = iz * speed * speedScale;
    const accel = 1 - Math.exp(-dt * 13);
    this.velocity.x = lerp(this.velocity.x, targetVx, accel);
    this.velocity.z = lerp(this.velocity.z, targetVz, accel);

    this.knockback.multiplyScalar(Math.exp(-dt * 7));

    const px = this.root.position.x + (this.velocity.x + this.knockback.x) * dt;
    const pz = this.root.position.z + (this.velocity.z + this.knockback.z) * dt;
    this.root.position.x = px;
    this.root.position.z = pz;
    this.world.resolveCollisions(this.root.position, 0.42);
    this.root.position.y = this.world.height(this.root.position.x, this.root.position.z);

    if (this.moving && !this.attack && !this.spin) {
      const targetYaw = Math.atan2(this.velocity.x, this.velocity.z);
      this.yaw = angleLerp(this.yaw, targetYaw, 1 - Math.exp(-dt * 12));
    }

    // Locomotion animation
    if (this.moving) {
      this.walkPhase += dt * 10.2;
    } else {
      this.walkPhase += dt * 1.7;
    }
    const walkAmp = this.moving ? 0.72 : 0.06;
    const phase = this.walkPhase;
    const walkSin = Math.sin(phase);
    const bob = this.moving ? Math.abs(Math.sin(phase)) * 0.055 : Math.sin(phase) * 0.012;
    this.model.position.y = lerp(this.model.position.y, bob, 1 - Math.exp(-dt * 12));

    this.leftLeg.rotation.x = lerp(this.leftLeg.rotation.x, walkSin * walkAmp, 1 - Math.exp(-dt * 18));
    this.rightLeg.rotation.x = lerp(this.rightLeg.rotation.x, -walkSin * walkAmp, 1 - Math.exp(-dt * 18));
    this.leftArm.rotation.x = lerp(this.leftArm.rotation.x, -walkSin * walkAmp * 0.7 + (this.moving ? 0 : 0.06), 1 - Math.exp(-dt * 16));
    this.leftArm.rotation.z = -0.08;
    this.capePivot.rotation.x = lerp(this.capePivot.rotation.x, this.moving ? 0.22 + Math.sin(phase) * 0.05 : 0.04, 1 - Math.exp(-dt * 8));
    this.scarfTail.rotation.x = lerp(this.scarfTail.rotation.x, this.moving ? 0.35 : 0.08, 1 - Math.exp(-dt * 7));

    let bodyTwist = 0;
    let bodyPitch = 0;
    let rightArmX = this.moving ? walkSin * walkAmp * 0.55 : -0.12 + Math.sin(phase * 0.8) * 0.04;
    let rightArmY = 0;
    let rightArmZ = 0.32;
    let leftArmX = this.leftArm.rotation.x;

    if (this.attack) {
      const a = this.attack;
      a.t += dt;
      const p = clamp(a.t / a.dur, 0, 1);
      const wind = smooth(clamp(p / 0.22, 0, 1));
      const strike = smooth(clamp((p - 0.2) / 0.32, 0, 1));
      const recover = smooth(clamp((p - 0.54) / 0.46, 0, 1));
      if (a.step === 0) {
        rightArmX = lerp(lerp(lerp(0.2, -1.45, wind), -1.3, strike), 0.1, recover);
        rightArmY = lerp(lerp(lerp(0, 1.1, wind), -1.2, strike), 0, recover);
        bodyTwist = lerp(lerp(lerp(0, 0.42, wind), -0.52, strike), 0, recover);
      } else if (a.step === 1) {
        rightArmX = lerp(lerp(lerp(0.2, -1.35, wind), -1.5, strike), 0.1, recover);
        rightArmY = lerp(lerp(lerp(0, -1.15, wind), 1.25, strike), 0, recover);
        bodyTwist = lerp(lerp(lerp(0, -0.45, wind), 0.5, strike), 0, recover);
      } else {
        rightArmX = lerp(lerp(lerp(-0.1, -2.5, wind), -0.35, strike), 0.05, recover);
        rightArmY = 0;
        bodyPitch = lerp(lerp(0, -0.18, wind), 0.36, strike) * (1 - recover);
      }
      if (!a.didHit && p >= a.at) {
        a.didHit = true;
        this.doMeleeHit();
      }
      if (p >= 1) this.attack = null;
      this.head.rotation.x = bodyPitch * 0.35;
    } else {
      this.head.rotation.x = lerp(this.head.rotation.x, 0, 1 - Math.exp(-dt * 10));
    }

    if (this.spin) {
      const s = this.spin;
      s.t += dt;
      const p = clamp(s.t / s.dur, 0, 1);
      this.spinOffset = smooth(clamp(p / 0.82, 0, 1)) * Math.PI * 4;
      rightArmZ = 1.5;
      rightArmX = -0.35;
      rightArmY = 0;
      this.leftArm.rotation.z = -1.5;
      while (s.nextTick < s.ticks.length && p >= s.ticks[s.nextTick]) {
        s.nextTick++;
        this.doWhirlHit();
        this.effects.ring(new THREE.Vector3(this.root.position.x, this.root.position.y + 0.2, this.root.position.z), 0xbff4ff, 5.5, 0.5);
        this.game?.shake(0.14);
      }
      if (p >= 1) {
        this.spin = null;
        this.spinOffset = 0;
        this.leftArm.rotation.z = -0.08;
      }
    } else {
      this.leftArm.rotation.z = lerp(this.leftArm.rotation.z, -0.08, 1 - Math.exp(-dt * 12));
    }

    this.rightArm.rotation.x = lerp(this.rightArm.rotation.x, rightArmX, 1 - Math.exp(-dt * 25));
    this.rightArm.rotation.y = lerp(this.rightArm.rotation.y, rightArmY, 1 - Math.exp(-dt * 25));
    this.rightArm.rotation.z = lerp(this.rightArm.rotation.z, rightArmZ, 1 - Math.exp(-dt * 20));
    this.leftArm.rotation.x = lerp(this.leftArm.rotation.x, leftArmX, 1 - Math.exp(-dt * 10));
    this.torso.rotation.y = lerp(this.torso.rotation.y, bodyTwist, 1 - Math.exp(-dt * 18));
    this.torso.rotation.x = lerp(this.torso.rotation.x, bodyPitch, 1 - Math.exp(-dt * 14));
    this.model.rotation.y = this.yaw + this.spinOffset;

    // Sword trail
    if (this.attack || this.spin) {
      const performing = this.spin || (this.attack && this.attack.t / this.attack.dur > 0.16);
      if (performing) {
        const base = new THREE.Vector3();
        const tip = new THREE.Vector3();
        this.bladeBase.getWorldPosition(base);
        this.bladeTip.getWorldPosition(tip);
        this.effects.addTrail(base, tip);
      }
    }

    // Footsteps
    if (this.moving) {
      this.footstepTimer -= dt;
      if (this.footstepTimer <= 0) {
        this.footstepTimer = 0.31;
        this.effects.footstep(new THREE.Vector3(this.root.position.x, this.root.position.y + 0.05, this.root.position.z));
      }
    } else {
      this.footstepTimer = 0;
    }
  }
}

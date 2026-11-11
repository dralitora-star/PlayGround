import * as THREE from 'three';

const _v = new THREE.Vector3();

function rand(a, b) { return a + Math.random() * (b - a); }

class ParticlePool {
  constructor(scene, count, additive, uScale) {
    this.count = count;
    this.cursor = 0;
    this.positions = new Float32Array(count * 3);
    this.colors = new Float32Array(count * 3);
    this.sizes = new Float32Array(count);
    this.alphas = new Float32Array(count);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);
    this.gravity = new Float32Array(count);
    this.drag = new Float32Array(count);
    for (let i = 0; i < count; i++) this.positions[i * 3 + 1] = -999;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));
    this.geometry = geo;
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: uScale } },
      vertexShader: `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        uniform float uScale;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * uScale / max(1.0, -mv.z), 1.0, 52.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.12, d) * vAlpha;
          gl_FragColor = vec4(vColor, a);
        }
      `
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    scene.add(this.points);
  }

  spawn(pos, opts = {}) {
    const count = opts.count || 10;
    const color = new THREE.Color(opts.color ?? 0xffffff);
    const color2 = opts.color2 ? new THREE.Color(opts.color2) : null;
    const dir = opts.dir || null;
    const spread = opts.spread ?? 1;
    for (let k = 0; k < count; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.count;
      const theta = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 1;
      const s = Math.sqrt(1 - u * u);
      const speed = rand(opts.speedMin ?? 1, opts.speedMax ?? 4);
      let vx = Math.cos(theta) * s, vy = u, vz = Math.sin(theta) * s;
      if (dir) {
        const d = _v.copy(dir).normalize();
        vx = vx * spread + d.x;
        vy = vy * spread + d.y;
        vz = vz * spread + d.z;
      }
      const norm = Math.hypot(vx, vy, vz) || 1;
      vx = (vx / norm) * speed;
      vy = (vy / norm) * speed;
      vz = (vz / norm) * speed;
      if (opts.up) vy += opts.up;
      this.positions[i * 3] = pos.x + rand(-0.15, 0.15);
      this.positions[i * 3 + 1] = pos.y + rand(-0.1, 0.35);
      this.positions[i * 3 + 2] = pos.z + rand(-0.15, 0.15);
      this.vel[i * 3] = vx;
      this.vel[i * 3 + 1] = vy;
      this.vel[i * 3 + 2] = vz;
      const c = color2 && Math.random() > 0.5 ? color2 : color;
      const tint = rand(0.85, 1.15);
      this.colors[i * 3] = c.r * tint;
      this.colors[i * 3 + 1] = c.g * tint;
      this.colors[i * 3 + 2] = c.b * tint;
      this.sizes[i] = rand(opts.sizeMin ?? 0.08, opts.sizeMax ?? 0.24);
      this.life[i] = this.maxLife[i] = rand(opts.lifeMin ?? 0.35, opts.lifeMax ?? 0.9);
      this.alphas[i] = opts.alpha ?? 1;
      this.gravity[i] = opts.gravity ?? 9;
      this.drag[i] = opts.drag ?? 0.6;
    }
  }

  update(dt) {
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.alphas[i] = 0;
        this.positions[i * 3 + 1] = -999;
        continue;
      }
      const drag = 1 - Math.min(0.95, this.drag[i] * dt);
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 1] -= this.gravity[i] * dt;
      this.vel[i * 3 + 2] *= drag;
      this.positions[i * 3] += this.vel[i * 3] * dt;
      this.positions[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const k = this.life[i] / this.maxLife[i];
      this.alphas[i] = Math.min(1, k * 1.8);
      this.sizes[i] *= 1 + dt * 0.35;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aColor.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;
    this.geometry.attributes.aAlpha.needsUpdate = true;
  }
}

class SwordTrail {
  constructor(scene) {
    this.maxSamples = 26;
    this.samples = [];
    this.positions = new Float32Array(this.maxSamples * 6);
    this.colors = new Float32Array(this.maxSamples * 6);
    this.alphas = new Float32Array(this.maxSamples * 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));
    const indices = [];
    for (let i = 0; i < this.maxSamples - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(indices);
    geo.setDrawRange(0, 0);
    this.geometry = geo;
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: `
        attribute vec3 aColor;
        attribute float aAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          gl_FragColor = vec4(vColor, vAlpha);
        }
      `
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
    this.baseColor = new THREE.Color(0x58d9ee);
    this.tipColor = new THREE.Color(0xf2ffff);
  }

  add(base, tip) {
    this.samples.push({ base: base.clone(), tip: tip.clone(), age: 0 });
    if (this.samples.length > this.maxSamples) this.samples.shift();
  }

  clear() { this.samples.length = 0; }

  update(dt) {
    for (const s of this.samples) s.age += dt;
    const life = 0.26;
    while (this.samples.length && this.samples[0].age > life) this.samples.shift();
    if (this.samples.length < 2) {
      this.geometry.setDrawRange(0, 0);
      return;
    }
    let p = 0;
    for (let i = 0; i < this.samples.length; i++) {
      const s = this.samples[i];
      const k = Math.max(0, 1 - s.age / life);
      const fade = k * k;
      this.positions[p * 3] = s.base.x;
      this.positions[p * 3 + 1] = s.base.y;
      this.positions[p * 3 + 2] = s.base.z;
      this.positions[(p + 1) * 3] = s.tip.x;
      this.positions[(p + 1) * 3 + 1] = s.tip.y;
      this.positions[(p + 1) * 3 + 2] = s.tip.z;
      const cb = this.baseColor;
      const ct = this.tipColor;
      this.colors[p * 3] = cb.r;
      this.colors[p * 3 + 1] = cb.g;
      this.colors[p * 3 + 2] = cb.b;
      this.colors[(p + 1) * 3] = ct.r;
      this.colors[(p + 1) * 3 + 1] = ct.g;
      this.colors[(p + 1) * 3 + 2] = ct.b;
      this.alphas[p] = fade * 0.5;
      this.alphas[p + 1] = fade * 0.95;
      p += 2;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aColor.needsUpdate = true;
    this.geometry.attributes.aAlpha.needsUpdate = true;
    this.geometry.setDrawRange(0, Math.max(0, (this.samples.length - 1) * 6));
    this.geometry.computeBoundingSphere();
  }
}

export class Effects {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.uScale = 900;
    this.spark = new ParticlePool(scene, 620, true, this.uScale);
    this.dust = new ParticlePool(scene, 360, false, this.uScale);
    this.trail = new SwordTrail(scene);
    this.rings = [];
    for (let i = 0; i < 16; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.78, 40), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.renderOrder = 2;
      scene.add(mesh);
      this.rings.push({ mesh, t: 0, dur: 1, maxR: 1, active: false });
    }
    this.ringCursor = 0;
    this.glowTex = this.makeGlowTexture();
    this.flashLights = [];
  }

  makeGlowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,220,255,0.7)');
    g.addColorStop(1, 'rgba(140,80,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  setViewport(height) {
    this.uScale = height * 0.95;
    this.spark.material.uniforms.uScale.value = this.uScale;
    this.dust.material.uniforms.uScale.value = this.uScale;
  }

  addTrail(base, tip) { this.trail.add(base, tip); }
  clearTrail() { this.trail.clear(); }

  burst(pos, color = 0xffd166, count = 14, speed = 5) {
    this.spark.spawn(pos, { count, color, color2: 0xffffff, speedMin: speed * 0.4, speedMax: speed, sizeMin: 0.06, sizeMax: 0.2, lifeMin: 0.25, lifeMax: 0.7, gravity: 7, drag: 1.2 });
  }

  hit(pos, color = 0xffb26b, count = 18) {
    this.spark.spawn(pos, { count, color, color2: 0xfff3cf, speedMin: 1.2, speedMax: 5.4, sizeMin: 0.06, sizeMax: 0.18, lifeMin: 0.2, lifeMax: 0.55, gravity: 8, drag: 1.4 });
    this.dust.spawn(pos, { count: Math.floor(count * 0.45), color: 0xd9c8a9, speedMin: 0.5, speedMax: 2.2, sizeMin: 0.1, sizeMax: 0.3, lifeMin: 0.35, lifeMax: 0.8, gravity: 2.4, drag: 1.8, alpha: 0.6 });
  }

  crit(pos) {
    this.spark.spawn(pos, { count: 26, color: 0xffd166, color2: 0xffffff, speedMin: 2, speedMax: 7.5, sizeMin: 0.08, sizeMax: 0.25, lifeMin: 0.3, lifeMax: 0.75, gravity: 6, drag: 1.1 });
    this.ring(pos, 0xffd166, 2.2, 0.38);
  }

  enemyDeath(pos, color = 0xaadb88, big = false) {
    const mult = big ? 1.7 : 1;
    this.spark.spawn(pos, { count: Math.floor(30 * mult), color: 0xe8dfc4, color2: 0xb9ad8f, speedMin: 2, speedMax: 8 * mult, sizeMin: 0.07, sizeMax: 0.22, lifeMin: 0.4, lifeMax: 1.1, gravity: 10, drag: 1.1 });
    this.spark.spawn(pos, { count: Math.floor(18 * mult), color: color, color2: 0x8a6aff, speedMin: 1, speedMax: 4.2, sizeMin: 0.08, sizeMax: 0.3, lifeMin: 0.5, lifeMax: 1.3, gravity: -1.5, drag: 0.8, up: 1.2 });
    this.dust.spawn(pos, { count: 14, color: 0xd7cfae, speedMin: 1, speedMax: 4, sizeMin: 0.12, sizeMax: 0.35, lifeMin: 0.4, lifeMax: 0.9, gravity: 3, drag: 1.4, alpha: 0.6 });
    this.ring(pos, color, big ? 5 : 3.2, 0.5);
  }

  playerHurt(pos) {
    this.spark.spawn(pos, { count: 16, color: 0xff6b4f, color2: 0xffd166, speedMin: 1.5, speedMax: 5, sizeMin: 0.08, sizeMax: 0.2, lifeMin: 0.25, lifeMax: 0.6, gravity: 4, drag: 1.3 });
  }

  footstep(pos, angle) {
    this.dust.spawn(pos, {
      count: 3,
      color: 0xcdd3a8,
      speedMin: 0.2,
      speedMax: 1.1,
      sizeMin: 0.08,
      sizeMax: 0.2,
      lifeMin: 0.25,
      lifeMax: 0.55,
      gravity: 1.2,
      drag: 2.5,
      alpha: 0.35
    });
  }

  levelUp(pos) {
    this.spark.spawn(new THREE.Vector3(pos.x, pos.y + 1, pos.z), { count: 55, color: 0xffd166, color2: 0x8be0a4, speedMin: 1.5, speedMax: 7, sizeMin: 0.08, sizeMax: 0.26, lifeMin: 0.5, lifeMax: 1.4, gravity: -4, drag: 0.7, up: 2 });
    this.ring(pos, 0xffd166, 7, 0.9);
    this.ring(pos, 0x8be0a4, 4.5, 0.65);
  }

  skill(pos, color = 0x9fe8ff) {
    this.ring(pos, color, 8, 0.7);
    this.ring(pos, 0xffffff, 5, 0.45);
    this.spark.spawn(new THREE.Vector3(pos.x, pos.y + 0.9, pos.z), { count: 34, color, color2: 0xffffff, speedMin: 3, speedMax: 9, sizeMin: 0.07, sizeMax: 0.2, lifeMin: 0.25, lifeMax: 0.65, gravity: 2, drag: 1.5 });
  }

  cast(pos, color = 0xb07bff) {
    this.spark.spawn(pos, { count: 16, color, color2: 0xffffff, speedMin: 0.8, speedMax: 3, sizeMin: 0.07, sizeMax: 0.2, lifeMin: 0.3, lifeMax: 0.8, gravity: -1, drag: 1.2 });
  }

  ring(pos, color = 0xffffff, maxR = 3, dur = 0.5) {
    const r = this.rings[this.ringCursor];
    this.ringCursor = (this.ringCursor + 1) % this.rings.length;
    r.active = true;
    r.t = 0;
    r.dur = dur;
    r.maxR = maxR;
    r.mesh.visible = true;
    r.mesh.position.set(pos.x, this.world.height(pos.x, pos.z) + 0.06, pos.z);
    r.mesh.scale.setScalar(0.4);
    r.mesh.material.color.set(color);
    r.mesh.material.opacity = 0.7;
  }

  update(dt) {
    this.spark.update(dt);
    this.dust.update(dt);
    this.trail.update(dt);
    for (const r of this.rings) {
      if (!r.active) continue;
      r.t += dt;
      const k = Math.min(1, r.t / r.dur);
      const e = 1 - Math.pow(1 - k, 3);
      r.mesh.scale.setScalar(0.5 + e * r.maxR);
      r.mesh.material.opacity = (1 - k) * (1 - k) * 0.65;
      if (k >= 1) {
        r.active = false;
        r.mesh.visible = false;
        r.mesh.material.opacity = 0;
      }
    }
  }
}

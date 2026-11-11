import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';

export const WORLD_RADIUS = 112;
export const TERRAIN_SIZE = 300;

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function paint(geometry, color, jitter = 0) {
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  const c = new THREE.Color(color);
  for (let i = 0; i < count; i++) {
    const j = jitter ? 1 + (Math.random() * 2 - 1) * jitter : 1;
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

function transformed(geometry, position, rotation, scale = 1) {
  const m = new THREE.Matrix4();
  m.compose(
    position || new THREE.Vector3(),
    new THREE.Quaternion().setFromEuler(rotation || new THREE.Euler()),
    new THREE.Vector3(scale, scale, scale)
  );
  geometry.applyMatrix4(m);
  return geometry;
}

function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(120,220,255,0)') {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(0.22, inner.replace(/[\d.]+\)$/, '0.6)'));
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.obstacles = [];
    this.clouds = [];
    this.fireflyData = [];
    this.time = 0;
    this.rand = mulberry32(20261111);
    this.buildSky();
    this.buildTerrain();
    this.buildMountains();
    this.buildSpawn();
    this.buildTrees();
    this.buildRocks();
    this.buildGrassAndFlowers();
    this.buildClouds();
    this.buildFireflies();
  }

  height(x, z) {
    const d = Math.hypot(x, z);
    let h = 2.5 * Math.sin(x * 0.043 + 0.4) * Math.cos(z * 0.047 - 0.2)
      + 1.5 * Math.sin((x + z) * 0.031 + 1.7)
      + 0.55 * Math.cos(x * 0.13 - z * 0.11);
    const rim = Math.max(0, d - 82);
    h += rim * rim * 0.0035;
    const flat = smoothstep(9, 27, d);
    return h * flat;
  }

  slope(x, z) {
    const e = 1.4;
    return Math.max(
      Math.abs(this.height(x + e, z) - this.height(x - e, z)),
      Math.abs(this.height(x, z + e) - this.height(x, z - e))
    );
  }

  resolveCollisions(pos, radius) {
    for (const o of this.obstacles) {
      const dx = pos.x - o.x;
      const dz = pos.z - o.z;
      const min = o.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = o.x + (dx / d) * min;
        pos.z = o.z + (dz / d) * min;
      }
    }
    const d = Math.hypot(pos.x, pos.z);
    if (d > WORLD_RADIUS) {
      pos.x *= WORLD_RADIUS / d;
      pos.z *= WORLD_RADIUS / d;
    }
  }

  buildSky() {
    const skyGeo = new THREE.SphereGeometry(520, 28, 18);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x4f97cf) },
        midColor: { value: new THREE.Color(0xa9d6df) },
        bottomColor: { value: new THREE.Color(0xe4efd5) },
        sunDir: { value: new THREE.Vector3(-0.42, 0.38, -0.82).normalize() },
        sunColor: { value: new THREE.Color(0xfff3c9) }
      },
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 bottomColor;
        uniform vec3 sunDir;
        uniform vec3 sunColor;
        varying vec3 vWorld;
        void main() {
          vec3 dir = normalize(vWorld);
          float h = clamp(dir.y, -1.0, 1.0);
          vec3 col = mix(bottomColor, midColor, smoothstep(-0.02, 0.24, h));
          col = mix(col, topColor, smoothstep(0.2, 0.78, h));
          float sun = pow(max(dot(dir, sunDir), 0.0), 90.0);
          float halo = pow(max(dot(dir, sunDir), 0.0), 8.0);
          col += sunColor * (sun * 1.4 + halo * 0.14);
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
    this.sky = new THREE.Mesh(skyGeo, skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);

    const sunTex = glowTexture('rgba(255,250,220,1)', 'rgba(255,220,140,0)');
    const sunMat = new THREE.SpriteMaterial({ map: sunTex, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
    this.sun = new THREE.Sprite(sunMat);
    this.sun.scale.set(68, 68, 1);
    this.sun.position.copy(new THREE.Vector3(-0.42, 0.38, -0.82).normalize().multiplyScalar(430));
    this.scene.add(this.sun);
  }

  buildTerrain() {
    const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, 118, 118);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, this.height(pos.getX(i), pos.getZ(i)));
    }
    const flat = geo.toNonIndexed();
    const p = flat.attributes.position;
    const colors = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    const greenA = new THREE.Color(0x5b9c45);
    const greenB = new THREE.Color(0x72b151);
    const greenC = new THREE.Color(0x4c873c);
    const dry = new THREE.Color(0x8da657);
    for (let i = 0; i < p.count; i += 3) {
      const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
      const cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
      const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
      const n = Math.sin(cx * 0.23 + cz * 0.17) * 0.5 + Math.cos(cz * 0.31 - cx * 0.12) * 0.5;
      c.copy(greenA).lerp(greenB, Math.max(0, n) * 0.8);
      c.lerp(greenC, Math.max(0, -n) * 0.55);
      c.lerp(dry, smoothstep(4, 13, cy) * 0.35);
      const tint = 0.94 + Math.random() * 0.12;
      for (let k = 0; k < 3; k++) {
        colors[(i + k) * 3] = c.r * tint;
        colors[(i + k) * 3 + 1] = c.g * tint;
        colors[(i + k) * 3 + 2] = c.b * tint;
      }
    }
    flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    flat.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const mesh = new THREE.Mesh(flat, mat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.terrain = mesh;
  }

  buildMountains() {
    const geo = new THREE.ConeGeometry(1, 1, 6, 1);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: false, color: 0x4f7363, flatShading: true });
    const count = 42;
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.receiveShadow = false;
    mesh.castShadow = false;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + this.rand() * 0.12;
      const r = 128 + this.rand() * 38;
      const h = 24 + this.rand() * 54;
      const w = 16 + this.rand() * 24;
      q.setFromEuler(new THREE.Euler(0, this.rand() * Math.PI, 0));
      m.compose(new THREE.Vector3(Math.cos(a) * r, -1.5, Math.sin(a) * r), q, new THREE.Vector3(w, h, w));
      mesh.setMatrixAt(i, m);
      col.setHSL(0.38 + this.rand() * 0.05, 0.18 + this.rand() * 0.1, 0.28 + this.rand() * 0.12);
      mesh.setColorAt(i, col);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.scene.add(mesh);
    this.mountains = mesh;
  }

  buildSpawn() {
    const group = new THREE.Group();
    this.spawnGroup = group;

    const base = new THREE.Mesh(
      new THREE.CircleGeometry(6.3, 32),
      new THREE.MeshLambertMaterial({ color: 0x7f9c6b, transparent: true, opacity: 0.55 })
    );
    base.rotation.x = -Math.PI / 2;
    base.position.y = 0.03;
    base.receiveShadow = true;
    group.add(base);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3.5, 5.5, 48),
      new THREE.MeshBasicMaterial({ color: 0x7ef0c0, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.07;
    group.add(ring);
    this.runeRing = ring;

    const inner = new THREE.Mesh(
      new THREE.RingGeometry(1.2, 1.45, 24),
      new THREE.MeshBasicMaterial({ color: 0xbdf7da, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.08;
    group.add(inner);

    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x8b9787, flatShading: true });
    const darkStone = new THREE.MeshLambertMaterial({ color: 0x6e7b6e, flatShading: true });
    const slabGeo = new THREE.BoxGeometry(1.5, 0.28, 0.78);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const slab = new THREE.Mesh(slabGeo, i % 3 === 0 ? darkStone : stoneMat);
      slab.position.set(Math.cos(a) * 5.8, 0.12, Math.sin(a) * 5.8);
      slab.rotation.y = -a;
      slab.rotation.x = (this.rand() - 0.5) * 0.04;
      slab.castShadow = true;
      slab.receiveShadow = true;
      group.add(slab);
    }

    const pillarGeo = new THREE.BoxGeometry(0.62, 2.9, 0.62);
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
      const x = Math.cos(a) * 7.5;
      const z = Math.sin(a) * 7.5;
      const pillar = new THREE.Group();
      const stone = new THREE.Mesh(pillarGeo, darkStone);
      stone.position.y = 1.4;
      stone.rotation.set((this.rand() - 0.5) * 0.08, a, (this.rand() - 0.5) * 0.08);
      stone.castShadow = true;
      stone.receiveShadow = true;
      pillar.add(stone);
      const rune = new THREE.Mesh(
        new THREE.PlaneGeometry(0.28, 1.15),
        new THREE.MeshBasicMaterial({ color: 0x84f3c5, transparent: true, opacity: 0.5, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      rune.position.set(Math.cos(a + Math.PI / 2) * 0.33, 1.6, Math.sin(a + Math.PI / 2) * 0.33);
      rune.rotation.y = -a + Math.PI / 2;
      pillar.add(rune);
      pillar.position.set(x, this.height(x, z), z);
      group.add(pillar);
      this.obstacles.push({ x, z, r: 0.62 });
    }

    const crystalGeo = new THREE.OctahedronGeometry(0.55, 0);
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0x8cf1cf,
      emissive: 0x2fbf96,
      emissiveIntensity: 1.4,
      flatShading: true,
      roughness: 0.25,
      metalness: 0.1,
      transparent: true,
      opacity: 0.92
    });
    this.crystal = new THREE.Mesh(crystalGeo, crystalMat);
    this.crystal.position.set(0, 5.2, 0);
    this.crystal.castShadow = true;
    group.add(this.crystal);

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('rgba(160,255,225,0.9)', 'rgba(60,220,180,0)'),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.52
    }));
    glow.scale.set(6, 6, 1);
    glow.position.set(0, 5.2, 0);
    group.add(glow);
    this.crystalGlow = glow;

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.0, 0.45, 7.5, 14, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x7df0c5, transparent: true, opacity: 0.022, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    beam.position.set(0, 4, 0);
    group.add(beam);
    this.beam = beam;

    const light = new THREE.PointLight(0x78ffd0, 6, 14, 2);
    light.position.set(0, 4.4, 0);
    group.add(light);

    this.scene.add(group);
  }

  makePineGeometry() {
    const parts = [];
    const trunk = new THREE.CylinderGeometry(0.13, 0.22, 1.15, 5);
    trunk.translate(0, 0.55, 0);
    parts.push(paint(trunk, 0x6b4a30, 0.1));
    const layers = [
      { y: 1.0, r: 1.12, h: 1.55, c: 0x2e6840 },
      { y: 1.85, r: 0.88, h: 1.45, c: 0x357346 },
      { y: 2.65, r: 0.62, h: 1.2, c: 0x3d7f4c }
    ];
    for (const l of layers) {
      const cone = new THREE.ConeGeometry(l.r, l.h, 6);
      cone.translate(0, l.y + l.h * 0.2, 0);
      parts.push(paint(cone, l.c, 0.08));
    }
    return mergeParts(parts);
  }

  makeRoundGeometry() {
    const parts = [];
    const trunk = new THREE.CylinderGeometry(0.16, 0.26, 1.4, 5);
    trunk.translate(0, 0.65, 0);
    parts.push(paint(trunk, 0x725236, 0.09));
    const canopy1 = new THREE.IcosahedronGeometry(1.15, 0);
    canopy1.scale(1.1, 0.95, 1.05);
    canopy1.translate(0, 2.15, 0);
    parts.push(paint(canopy1, 0x5da34c, 0.12));
    const canopy2 = new THREE.IcosahedronGeometry(0.72, 0);
    canopy2.translate(0.5, 2.62, 0.15);
    parts.push(paint(canopy2, 0x6db257, 0.1));
    const canopy3 = new THREE.IcosahedronGeometry(0.58, 0);
    canopy3.translate(-0.52, 2.5, -0.2);
    parts.push(paint(canopy3, 0x4f9444, 0.1));
    return mergeParts(parts);
  }

  buildTrees() {
    const treeMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const pineGeo = this.makePineGeometry();
    const roundGeo = this.makeRoundGeometry();
    const positions = [];
    let attempts = 0;
    while (positions.length < 210 && attempts < 2600) {
      attempts++;
      const a = this.rand() * Math.PI * 2;
      const r = 16 + Math.sqrt(this.rand()) * 98;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (this.slope(x, z) > 2.2) continue;
      let ok = true;
      for (let i = 0; i < positions.length; i++) {
        const p = positions[i];
        const dx = p.x - x;
        const dz = p.z - z;
        if (dx * dx + dz * dz < 10.5) { ok = false; break; }
      }
      if (!ok) continue;
      positions.push({ x, z, pine: this.rand() < 0.58, s: 0.72 + this.rand() * 0.82, rot: this.rand() * Math.PI * 2 });
    }

    const pines = positions.filter(p => p.pine);
    const rounds = positions.filter(p => !p.pine);
    const buildInstances = (list, geometry) => {
      const mesh = new THREE.InstancedMesh(geometry, treeMat, list.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const c = new THREE.Color();
      list.forEach((t, i) => {
        q.setFromEuler(new THREE.Euler(0, t.rot, (this.rand() - 0.5) * 0.04));
        m.compose(new THREE.Vector3(t.x, this.height(t.x, t.z) - 0.05, t.z), q, new THREE.Vector3(t.s, t.s * (0.9 + this.rand() * 0.25), t.s));
        mesh.setMatrixAt(i, m);
        const tint = 0.85 + this.rand() * 0.3;
        c.setRGB(tint, tint, tint);
        mesh.setColorAt(i, c);
        this.obstacles.push({ x: t.x, z: t.z, r: 0.42 + t.s * 0.15 });
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.scene.add(mesh);
      return mesh;
    };
    this.pines = buildInstances(pines, pineGeo);
    this.roundTrees = buildInstances(rounds, roundGeo);
  }

  buildRocks() {
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    const count = 58;
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const a = this.rand() * Math.PI * 2;
      const r = 12 + Math.sqrt(this.rand()) * 98;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const s = 0.28 + this.rand() * 1.05;
      q.setFromEuler(new THREE.Euler(this.rand() * 3, this.rand() * 3, this.rand() * 3));
      m.compose(
        new THREE.Vector3(x, this.height(x, z) + s * 0.18, z),
        q,
        new THREE.Vector3(s * (0.8 + this.rand() * 0.6), s * (0.5 + this.rand() * 0.8), s)
      );
      mesh.setMatrixAt(i, m);
      const g = 0.46 + this.rand() * 0.17;
      c.setRGB(g, g * 1.03, g * 0.94);
      mesh.setColorAt(i, c);
      if (s > 0.55) this.obstacles.push({ x, z, r: s * 0.7 });
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.scene.add(mesh);
    this.rocks = mesh;
  }

  buildGrassAndFlowers() {
    const parts = [];
    for (let i = 0; i < 3; i++) {
      const blade = new THREE.ConeGeometry(0.075, 0.62, 3);
      const a = (i / 3) * Math.PI * 2;
      transformed(blade, new THREE.Vector3(Math.cos(a) * 0.1, 0.28, Math.sin(a) * 0.1), new THREE.Euler(Math.cos(a) * 0.18, a, Math.sin(a) * 0.18));
      parts.push(blade);
    }
    const grassGeo = mergeParts(parts);
    const grassMat = new THREE.MeshLambertMaterial({ color: 0x62a94c, flatShading: true, side: THREE.DoubleSide });
    const count = 950;
    const grass = new THREE.InstancedMesh(grassGeo, grassMat, count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const a = this.rand() * Math.PI * 2;
      const r = 5 + Math.sqrt(this.rand()) * 106;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const s = 0.6 + this.rand() * 1.5;
      q.setFromEuler(new THREE.Euler(0, this.rand() * Math.PI * 2, 0));
      m.compose(new THREE.Vector3(x, this.height(x, z), z), q, new THREE.Vector3(s, s, s));
      grass.setMatrixAt(i, m);
      c.setHSL(0.25 + this.rand() * 0.06, 0.4 + this.rand() * 0.12, 0.3 + this.rand() * 0.13);
      grass.setColorAt(i, c);
    }
    grass.instanceMatrix.needsUpdate = true;
    this.scene.add(grass);

    const flowerParts = [];
    const stem = new THREE.CylinderGeometry(0.015, 0.02, 0.4, 3);
    stem.translate(0, 0.2, 0);
    flowerParts.push(paint(stem, 0x4b8738));
    const bloom = new THREE.IcosahedronGeometry(0.1, 0);
    bloom.translate(0, 0.43, 0);
    flowerParts.push(paint(bloom, 0xffffff, 0.06));
    const flowerGeo = mergeParts(flowerParts);
    const flowerMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const fCount = 240;
    const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, fCount);
    const palette = [0xfff2d0, 0xffd85e, 0xf6b8d2, 0xd8f0ff, 0xff9e6b];
    for (let i = 0; i < fCount; i++) {
      const a = this.rand() * Math.PI * 2;
      const r = 7 + Math.sqrt(this.rand()) * 102;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const s = 0.8 + this.rand() * 0.9;
      q.setFromEuler(new THREE.Euler(0, this.rand() * Math.PI * 2, 0));
      m.compose(new THREE.Vector3(x, this.height(x, z), z), q, new THREE.Vector3(s, s, s));
      flowers.setMatrixAt(i, m);
      c.setHex(palette[Math.floor(this.rand() * palette.length)]);
      flowers.setColorAt(i, c);
    }
    flowers.instanceMatrix.needsUpdate = true;
    this.scene.add(flowers);
    this.grass = grass;
    this.flowers = flowers;
  }

  buildClouds() {
    const parts = [];
    const puffs = [
      [0, 0, 0, 1.3], [1.5, 0.2, 0.2, 1], [-1.6, -0.1, -0.2, 0.9], [0.6, 0.7, 0.1, 0.85], [-0.5, -0.4, 0.3, 0.75]
    ];
    for (const [x, y, z, s] of puffs) {
      const g = new THREE.IcosahedronGeometry(1, 0);
      g.scale(s * 1.5, s * 0.6, s);
      g.translate(x, y, z);
      parts.push(g);
    }
    const cloudGeo = mergeParts(parts);
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xf4f5e9, flatShading: true, transparent: true, opacity: 0.94 });
    for (let i = 0; i < 10; i++) {
      const cloud = new THREE.Mesh(cloudGeo, cloudMat);
      const a = this.rand() * Math.PI * 2;
      const r = 60 + this.rand() * 120;
      cloud.position.set(Math.cos(a) * r, 34 + this.rand() * 22, Math.sin(a) * r);
      const s = 2.6 + this.rand() * 3.6;
      cloud.scale.set(s, s * 0.72, s);
      cloud.rotation.y = this.rand() * Math.PI;
      this.scene.add(cloud);
      this.clouds.push({ mesh: cloud, speed: 0.35 + this.rand() * 0.5 });
    }
  }

  buildFireflies() {
    const count = 100;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = this.rand() * Math.PI * 2;
      const r = 6 + Math.sqrt(this.rand()) * 105;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = this.height(x, z) + 0.6 + this.rand() * 3.2;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      this.fireflyData.push({ x, y, z, phase: this.rand() * Math.PI * 2, speed: 0.3 + this.rand() * 0.8 });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffefb0,
      size: 0.17,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });
    this.fireflies = new THREE.Points(geo, mat);
    this.fireflies.frustumCulled = false;
    this.scene.add(this.fireflies);
  }

  update(dt, time, camera) {
    this.time = time;
    if (this.sky) this.sky.position.copy(camera.position);
    if (this.sun) this.sun.position.copy(camera.position).add(new THREE.Vector3(-0.42, 0.38, -0.82).normalize().multiplyScalar(430));

    if (this.crystal) {
      this.crystal.rotation.y += dt * 0.7;
      this.crystal.position.y = 5.2 + Math.sin(time * 1.2) * 0.18;
      this.crystalGlow.position.y = this.crystal.position.y;
      const p = 0.75 + Math.sin(time * 2.1) * 0.12;
      this.crystalGlow.material.opacity = p * 0.72;
      this.crystalGlow.scale.setScalar(6 + Math.sin(time * 1.8) * 0.4);
    }
    if (this.runeRing) {
      const pulse = 1 + Math.sin(time * 1.5) * 0.05;
      this.runeRing.scale.setScalar(pulse);
      this.runeRing.material.opacity = 0.13 + Math.sin(time * 1.5) * 0.05;
    }
    if (this.beam) {
      this.beam.material.opacity = 0.019 + Math.sin(time * 1.4) * 0.006;
    }
    for (const cloud of this.clouds) {
      cloud.mesh.position.x += cloud.speed * dt;
      if (cloud.mesh.position.x > 210) cloud.mesh.position.x = -210;
    }
    if (this.fireflies) {
      const arr = this.fireflies.geometry.attributes.position.array;
      for (let i = 0; i < this.fireflyData.length; i++) {
        const f = this.fireflyData[i];
        arr[i * 3] = f.x + Math.sin(time * f.speed + f.phase) * 0.55;
        arr[i * 3 + 1] = f.y + Math.sin(time * f.speed * 1.7 + f.phase * 2) * 0.5;
        arr[i * 3 + 2] = f.z + Math.cos(time * f.speed * 0.8 + f.phase) * 0.55;
      }
      this.fireflies.geometry.attributes.position.needsUpdate = true;
    }
  }
}

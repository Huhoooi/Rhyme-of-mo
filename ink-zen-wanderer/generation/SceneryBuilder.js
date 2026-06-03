import * as THREE from 'three';
import { FractalTree } from './FractalTree.js';

/**
 * SceneryBuilder — 六个叙事触发点的景观构建
 * [同学A]
 *
 * 每个触发点都有：
 *  - 一根高耸的彩色光柱（远处可见）
 *  - 对应的主题景观
 */
export class SceneryBuilder {
  constructor(opts = {}) {
    this.terrain = opts.terrain;
    this.triggers = opts.triggers || [];
    /** @type {THREE.Object3D[]} */
    this.objects = [];
    /** @type {FractalTree|null} */
    this._bambooGrove = null;
  }

  init(scene) {
    this.scene = scene;

    for (const trigger of this.triggers) {
      console.log('[SceneryBuilder] 构建:', trigger.id, trigger.title,
        '位置:', trigger.position.x.toFixed(0), trigger.position.z.toFixed(0));

      switch (trigger.id) {
        case 'mountain_path':   this._buildStonePath(trigger);    break;
        case 'cloud_terrace':   this._buildCloudTerrace(trigger); break;
        case 'secluded_stream': this._buildStream(trigger);       break;
        case 'bamboo_grove':    this._buildBambooGrove(trigger);  break;
        case 'return_point':    this._buildReturnPoint(trigger);  break;
      }
    }
  }

  update(time, dt) {
    if (this._streamWater && this._streamBaseY) {
      const pos = this._streamWater.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        pos.setY(i, this._streamBaseY[i] +
          Math.sin(pos.getX(i) * 0.1 + time * 1.2) * 0.08 +
          Math.cos(pos.getZ(i) * 0.12 + time * 0.9) * 0.06);
      }
      pos.needsUpdate = true;
    }
    if (this._mistParticles) {
      for (const p of this._mistParticles) {
        p.mesh.position.y += Math.sin(time * 0.5 + p.phase) * 0.005;
      }
    }
    if (this._bambooGrove) {
      this._bambooGrove.update(time * 1000, dt);
    }
  }

  dispose() {
    for (const obj of this.objects) {
      if (obj.parent) obj.parent.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    }
    this.objects.length = 0;
    if (this._bambooGrove) this._bambooGrove.dispose();
  }

  // ═══════════════════════════════════════════════════════════
  //  1. 山径 — 蜿蜒石板路（从山径通往云台亭子）
  // ═══════════════════════════════════════════════════════════

  _buildStonePath(trigger) {
    // Start: 山径 trigger position
    const sx = trigger.position.x;
    const sz = trigger.position.z;

    // End: 云台 pavilion position
    const pavilionTrigger = this.triggers.find(t => t.id === 'cloud_terrace');
    const ex = pavilionTrigger ? pavilionTrigger.position.x : -40;
    const ez = pavilionTrigger ? pavilionTrigger.position.z : 50;

    const group = new THREE.Group();
    group.name = 'scenery_mountain_path';

    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0x9e8e7e,
      roughness: 0.6,
    });
    const count = 120;

    for (let i = 0; i < count; i++) {
      const t = i / count;
      // Linear interpolation with sinusoidal winding
      const wx = sx + (ex - sx) * t + Math.sin(t * Math.PI * 3.5) * (6 * (1 - Math.abs(t - 0.5) * 2));
      const wz = sz + (ez - sz) * t + Math.cos(t * Math.PI * 2.8) * (4 * (1 - Math.abs(t - 0.5) * 2));
      const wy = this.terrain.getHeightAt(wx, wz) + 0.06;

      const sw = 0.7 + Math.random() * 0.5;
      const sd = 1.0 + Math.random() * 0.7;
      const geo = new THREE.BoxGeometry(sw, 0.15, sd);
      const stone = new THREE.Mesh(geo, stoneMat);
      stone.position.set(wx, wy, wz);
      stone.rotation.y = Math.atan2(
        (ez - sz) * (1 + Math.cos(t * Math.PI * 2.8) * 0.3),
        (ex - sx) * (1 + Math.sin(t * Math.PI * 3.5) * 0.3),
      ) + (Math.random() - 0.5) * 0.25;
      stone.receiveShadow = true;
      stone.castShadow = true;
      group.add(stone);
      this.objects.push(stone);
    }

    this.scene.add(group);
    this.objects.push(group);
  }

  // ═══════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════
  //  3. 云台 — 中式亭子
  // ═══════════════════════════════════════════════════════════

  _buildCloudTerrace(trigger) {
    const cx = trigger.position.x;
    const cz = trigger.position.z;
    const groundY = this.terrain.getHeightAt(cx, cz);

    const group = new THREE.Group();
    group.name = 'scenery_cloud_terrace';

    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x5c3a2e,
      roughness: 0.7,
    });
    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0xb0a898,
      roughness: 0.55,
    });
    const roofMat = new THREE.MeshStandardMaterial({
      color: 0x3a3035,
      roughness: 0.6,
    });

    // ── Stone platform base ─────────────────────────────
    const stepsGeo = new THREE.CylinderGeometry(5.5, 6, 0.5, 32);
    const steps = new THREE.Mesh(stepsGeo, stoneMat);
    steps.position.set(cx, groundY + 0.25, cz);
    steps.receiveShadow = true;
    steps.castShadow = true;
    group.add(steps);
    this.objects.push(steps);

    // Upper platform (wood floor)
    const floorGeo = new THREE.CylinderGeometry(5, 5.2, 0.2, 32);
    const floor = new THREE.Mesh(floorGeo, woodMat);
    floor.position.set(cx, groundY + 0.6, cz);
    floor.receiveShadow = true;
    group.add(floor);
    this.objects.push(floor);

    // ── 4 pillars ───────────────────────────────────────
    const pillarRadius = 4.2;
    const pillarH = 5.5;
    const pillarR = 0.22;
    const pillarBaseY = groundY + 0.7;

    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const px = cx + Math.cos(a) * pillarRadius;
      const pz = cz + Math.sin(a) * pillarRadius;

      const pGeo = new THREE.CylinderGeometry(pillarR, pillarR * 1.2, pillarH, 10);
      const pillar = new THREE.Mesh(pGeo, woodMat);
      pillar.position.set(px, pillarBaseY + pillarH / 2, pz);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      group.add(pillar);
      this.objects.push(pillar);
    }

    // ── Horizontal beams between pillars ────────────────
    const beamTop = pillarBaseY + pillarH;
    for (let i = 0; i < 4; i++) {
      const a1 = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const a2 = ((i + 1) % 4 / 4) * Math.PI * 2 + Math.PI / 4;
      const midX = cx + (Math.cos(a1) + Math.cos(a2)) / 2 * pillarRadius;
      const midZ = cz + (Math.sin(a1) + Math.sin(a2)) / 2 * pillarRadius;
      const dx = Math.cos(a2) * pillarRadius - Math.cos(a1) * pillarRadius;
      const dz = Math.sin(a2) * pillarRadius - Math.sin(a1) * pillarRadius;
      const beamLen = Math.sqrt(dx * dx + dz * dz);
      const beamAngle = Math.atan2(dx, dz);

      const bGeo = new THREE.BoxGeometry(0.18, 0.25, beamLen);
      const beam = new THREE.Mesh(bGeo, woodMat);
      beam.position.set(midX, beamTop, midZ);
      beam.rotation.y = beamAngle;
      beam.castShadow = true;
      group.add(beam);
      this.objects.push(beam);
    }

    // ── Dou-gong brackets (small blocks under roof) ─────
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const bx = cx + Math.cos(a) * (pillarRadius + 0.3);
      const bz = cz + Math.sin(a) * (pillarRadius + 0.3);
      for (let j = 0; j < 3; j++) {
        const blockGeo = new THREE.BoxGeometry(0.3, 0.12, 0.5);
        const block = new THREE.Mesh(blockGeo, woodMat);
        block.position.set(bx, beamTop + 0.15 + j * 0.14, bz);
        block.rotation.y = a;
        group.add(block);
        this.objects.push(block);
      }
    }

    // ── Roof — layered octagonal cones ──────────────────
    const roofBaseY = beamTop + 0.55;

    // Main roof body
    const mainRoofGeo = new THREE.ConeGeometry(7, 2.2, 8, 2);
    const mainRoof = new THREE.Mesh(mainRoofGeo, roofMat);
    mainRoof.position.set(cx, roofBaseY + 1.1, cz);
    mainRoof.rotation.y = Math.PI / 8;
    mainRoof.castShadow = true;
    mainRoof.receiveShadow = true;
    group.add(mainRoof);
    this.objects.push(mainRoof);

    // Upper roof layer (slightly smaller)
    const upperRoofGeo = new THREE.ConeGeometry(4.5, 1.6, 8, 2);
    const upperRoof = new THREE.Mesh(upperRoofGeo, roofMat);
    upperRoof.position.set(cx, roofBaseY + 2.0, cz);
    upperRoof.rotation.y = Math.PI / 8;
    upperRoof.castShadow = true;
    group.add(upperRoof);
    this.objects.push(upperRoof);

    // ── Upturned eaves (corner tips) ────────────────────
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const ex = cx + Math.cos(a) * 6.5;
      const ez = cz + Math.sin(a) * 6.5;

      const eaveGeo = new THREE.BoxGeometry(0.4, 0.08, 1.5);
      const eave = new THREE.Mesh(eaveGeo, roofMat);
      eave.position.set(ex, roofBaseY + 0.2, ez);
      eave.rotation.y = a;
      eave.rotation.x = -0.35; // tilt upward
      eave.castShadow = true;
      group.add(eave);
      this.objects.push(eave);
    }

    // ── Roof finial (spire on top) ──────────────────────
    const finialGeo = new THREE.CylinderGeometry(0.08, 0.15, 1.2, 8);
    const finial = new THREE.Mesh(finialGeo, new THREE.MeshStandardMaterial({
      color: 0x4a3a30,
      roughness: 0.3,
      metalness: 0.5,
    }));
    finial.position.set(cx, roofBaseY + 3.4, cz);
    group.add(finial);
    this.objects.push(finial);

    // Finial orb
    const orbGeo = new THREE.SphereGeometry(0.2, 8, 8);
    const orb = new THREE.Mesh(orbGeo, new THREE.MeshStandardMaterial({
      color: 0x6a5040,
      roughness: 0.2,
      metalness: 0.6,
    }));
    orb.position.set(cx, roofBaseY + 4.1, cz);
    group.add(orb);
    this.objects.push(orb);

    // ── Central stone table ─────────────────────────────
    const tableBaseGeo = new THREE.CylinderGeometry(0.5, 0.7, 0.8, 8);
    const tableBase = new THREE.Mesh(tableBaseGeo, stoneMat);
    tableBase.position.set(cx, groundY + 0.9, cz);
    tableBase.castShadow = true;
    tableBase.receiveShadow = true;
    group.add(tableBase);
    this.objects.push(tableBase);

    const tableTopGeo = new THREE.CylinderGeometry(1.2, 1.3, 0.15, 16);
    const tableTop = new THREE.Mesh(tableTopGeo, stoneMat);
    tableTop.position.set(cx, groundY + 1.35, cz);
    tableTop.castShadow = true;
    tableTop.receiveShadow = true;
    group.add(tableTop);
    this.objects.push(tableTop);

    // ── Mist around pavilion ────────────────────────────
    this._mistParticles = [];

    this.scene.add(group);
    this.objects.push(group);
  }

  // ═══════════════════════════════════════════════════════════
  //  4. 幽涧 — 山涧溪流
  // ═══════════════════════════════════════════════════════════

  _buildStream(trigger) {
    const cx = trigger.position.x;
    const cz = trigger.position.z;

    const group = new THREE.Group();
    group.name = 'scenery_secluded_stream';

    // Stream water — wide and long
    const streamLen = 50;
    const streamWid = 3;
    const segs = 100;
    const stripGeo = new THREE.PlaneGeometry(streamWid, streamLen, 3, segs);
    stripGeo.rotateX(-Math.PI / 2);

    const pos = stripGeo.attributes.position;
    this._streamBaseY = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i) + cx;
      const wz = pos.getZ(i) + cz;
      const h = this.terrain.getHeightAt(wx, wz) + 0.1;
      pos.setX(i, wx);
      pos.setZ(i, wz);
      pos.setY(i, h);
      this._streamBaseY[i] = h;
    }

    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x6699aa,
      roughness: 0.1,
      metalness: 0.2,
      transparent: true,
      opacity: 0.55,
    });
    this._streamWater = new THREE.Mesh(stripGeo, waterMat);
    group.add(this._streamWater);
    this.objects.push(this._streamWater);

    // Rocks along both sides
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x5a5550, roughness: 0.8 });
    for (let i = 0; i < 40; i++) {
      const side = Math.random() > 0.5 ? 1 : -1;
      const rx = cx + (Math.random() - 0.5) * streamLen * 0.9;
      const rz = cz + side * (streamWid * 0.6 + Math.random() * 3);
      const ry = this.terrain.getHeightAt(rx, rz);
      const rGeo = new THREE.IcosahedronGeometry(0.2 + Math.random() * 0.6, 0);
      const rock = new THREE.Mesh(rGeo, rockMat);
      rock.position.set(rx, ry, rz);
      rock.scale.set(1, 0.3 + Math.random() * 0.5, 1);
      rock.castShadow = true;
      rock.receiveShadow = true;
      group.add(rock);
      this.objects.push(rock);
    }

    this.scene.add(group);
    this.objects.push(group);
  }

  // ═══════════════════════════════════════════════════════════
  //  5. 竹林 — 密集竹林
  // ═══════════════════════════════════════════════════════════

  _buildBambooGrove(trigger) {
    const cx = trigger.position.x;
    const cz = trigger.position.z;

    const group = new THREE.Group();
    group.name = 'scenery_bamboo_grove';

    // Dense bamboo cluster using FractalTree
    const groveTerrain = {
      getHeightAt: (x, z) => this.terrain.getHeightAt(cx + x, cz + z),
    };
    const grove = new FractalTree({
      terrain: groveTerrain,
      count: 100,
      spawnRadius: 20,
      seed: 99,
    });
    grove.init(this.scene);

    // Offset to world space
    for (let i = 0; i < grove.count; i++) {
      if (grove._basePos[i]) {
        grove._basePos[i].x += cx;
        grove._basePos[i].z += cz;
      }
    }
    // Rebuild instance matrices at world positions
    for (let i = 0; i < grove.count; i++) {
      const map = grove._instanceMap[i];
      if (!map) continue;
      const mesh = grove._meshes[map.mesh];
      const idx = map.localIdx;
      if (idx >= mesh.count) continue;
      const p = grove._basePos[i];
      const s = grove._baseScale[i];
      const r = grove._baseRotY[i];
      const m = new THREE.Matrix4();
      m.compose(
        new THREE.Vector3(p.x, p.y, p.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r, 0)),
        new THREE.Vector3(s, s, s),
      );
      mesh.setMatrixAt(idx, m);
      mesh.instanceMatrix.needsUpdate = true;
    }

    this._bambooGrove = grove;
    this.scene.add(group);
    this.objects.push(group);
  }

  // ═══════════════════════════════════════════════════════════
  //  6. 归处 — 石碑 + 圆石阵
  // ═══════════════════════════════════════════════════════════

  _buildReturnPoint(trigger) {
    const cx = trigger.position.x;
    const cz = trigger.position.z;
    const groundY = this.terrain.getHeightAt(cx, cz);

    const group = new THREE.Group();
    group.name = 'scenery_return_point';

    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0x8a7a68,
      roughness: 0.6,
    });

    // Tall stele
    const steleGeo = new THREE.BoxGeometry(1.2, 5, 0.4);
    const stele = new THREE.Mesh(steleGeo, stoneMat);
    stele.position.set(cx, groundY + 2.5, cz);
    stele.castShadow = true;
    stele.receiveShadow = true;
    group.add(stele);
    this.objects.push(stele);

    // Base
    const baseGeo = new THREE.BoxGeometry(2, 0.5, 1.2);
    const base = new THREE.Mesh(baseGeo, stoneMat);
    base.position.set(cx, groundY + 0.25, cz);
    base.receiveShadow = true;
    group.add(base);
    this.objects.push(base);

    // Cap
    const capGeo = new THREE.CylinderGeometry(0.8, 0.9, 0.4, 12);
    const cap = new THREE.Mesh(capGeo, stoneMat);
    cap.position.set(cx, groundY + 5.2, cz);
    cap.castShadow = true;
    group.add(cap);
    this.objects.push(cap);

    // Stone circle
    const pebbleMat = new THREE.MeshStandardMaterial({
      color: 0x9a8a78,
      roughness: 0.7,
    });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const px = cx + Math.cos(a) * 5;
      const pz = cz + Math.sin(a) * 5;
      const py = this.terrain.getHeightAt(px, pz);
      const size = 0.3 + Math.random() * 0.5;
      const sGeo = new THREE.IcosahedronGeometry(size, 1);
      const pebble = new THREE.Mesh(sGeo, pebbleMat);
      pebble.position.set(px, py + size * 0.3, pz);
      pebble.receiveShadow = true;
      pebble.castShadow = true;
      group.add(pebble);
      this.objects.push(pebble);
    }

    this.scene.add(group);
    this.objects.push(group);
  }
}

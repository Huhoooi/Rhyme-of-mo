import * as THREE from 'three';

/**
 * FractalTree — L-System 分形树 + GPU Instancing
 * [同学A]
 *
 * 使用 L-System 生成竹/树几何体（茎杆+叶子合并为一个 BufferGeometry），
 * 通过 THREE.InstancedMesh 批量渲染约 350 棵树。
 * 支持风摆动和 bloomTree() 开花接口。
 *
 * Bug 修复要点：
 *  1. 根部贴合地面 → 使用 terrain.getHeightAt(x,z) 获取精确地表高度
 *  2. 多样性     → 5种几何变体 + 每实例随机缩放/旋转/颜色
 *  3. 叶子连接   → 茎杆+叶子在同一 BufferGeometry 中，变换不会分离
 */
export class FractalTree {
  /**
   * @param {object} opts
   * @param {import('./TerrainGenerator.js').TerrainGenerator} opts.terrain
   * @param {number} [opts.count=350]
   * @param {number} [opts.spawnRadius=185]
   * @param {number} [opts.seed=137]
   */
  constructor(opts = {}) {
    /** @type {import('./TerrainGenerator.js').TerrainGenerator} */
    this.terrain = opts.terrain;
    this.count = opts.count ?? 350;
    this.spawnRadius = opts.spawnRadius ?? 185;
    this.seed = opts.seed ?? 137;

    /** @type {THREE.InstancedMesh[]} */
    this._meshes = [];

    // Per-instance base state (indexed by global tree id)
    this._basePos = new Array(this.count);
    this._baseScale = new Float32Array(this.count);
    this._baseRotY = new Float32Array(this.count);
    // Maps global id → { mesh, localIdx }
    this._instanceMap = new Array(this.count);

    // Bloom animation state
    this._bloomStates = new Array(this.count).fill(null);
  }

  // ═══════════════════════════════════════════════════════════
  //  Public API
  // ═══════════════════════════════════════════════════════════

  /**
   * Generate geometries, create InstancedMeshes, place instances.
   * Call once after construction. Adds meshes to the scene.
   * @param {THREE.Scene} scene
   */
  init(scene) {
    const variantCount = 5;
    const perVariant = Math.ceil(this.count / variantCount);

    // Generate variant geometries
    const geometries = [];
    for (let v = 0; v < variantCount; v++) {
      const geo = this._generateTreeGeometry(v);
      geometries.push(geo);
    }

    // Create InstancedMesh for each variant
    const material = new THREE.MeshStandardMaterial({
      roughness: 0.7,
      vertexColors: true,
    });

    for (let v = 0; v < variantCount; v++) {
      const count = v === variantCount - 1
        ? this.count - v * perVariant
        : perVariant;
      const mesh = new THREE.InstancedMesh(geometries[v], material, count);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `trees_variant_${v}`;
      scene.add(mesh);
      this._meshes.push(mesh);
    }

    // Place instances
    this._placeTrees();
  }

  /**
   * Per-frame update: wind sway + bloom animation.
   * @param {number} time — performance.now() raw ms
   * @param {number} deltaTime — seconds since last frame
   */
  update(time, deltaTime) {
    const t = time * 0.001; // seconds

    const dummyMatrix = new THREE.Matrix4();
    const swayEuler = new THREE.Euler();
    const swayQuat = new THREE.Quaternion();
    const rotQuat = new THREE.Quaternion();

    // Track which meshes need their instance data flushed
    const meshesTouched = new Set();

    // Iterate by global ID — uses the _instanceMap from placement
    for (let globalId = 0; globalId < this.count; globalId++) {
      const mapping = this._instanceMap[globalId];
      if (!mapping) continue;

      const mesh = this._meshes[mapping.mesh];
      const localIdx = mapping.localIdx;
      if (localIdx >= mesh.count) continue;

      const pos = this._basePos[globalId];
      const scale = this._baseScale[globalId];
      const baseRotY = this._baseRotY[globalId];

      // ── Wind sway ──────────────────────────────────
      const phaseOffset = pos.x * 0.3 + pos.z * 0.7;
      const swayX = Math.sin(t * 1.2 + phaseOffset) * 0.06;
      const swayZ = Math.cos(t * 0.9 + phaseOffset * 1.3) * 0.04;

      swayEuler.set(swayX, 0, swayZ);
      swayQuat.setFromEuler(swayEuler);

      rotQuat.setFromEuler(new THREE.Euler(0, baseRotY, 0));
      rotQuat.multiply(swayQuat);

      // ── Bloom animation ────────────────────────────
      const bloom = this._bloomStates[globalId];
      if (bloom && bloom.active) {
        const elapsed = t - bloom.startTime;
        const progress = Math.min(elapsed / bloom.duration, 1.0);

        // Color transition: green → pale pink/lavender
        const bloomColor = new THREE.Color();
        bloomColor.r = 0.22 + progress * 0.50;
        bloomColor.g = 0.32 - progress * 0.18;
        bloomColor.b = 0.18 + progress * 0.35;
        mesh.setColorAt(localIdx, bloomColor);

        // Scale pulse during bloom
        const pulseScale = scale * (1.0 + Math.sin(progress * Math.PI) * 0.12);
        dummyMatrix.compose(
          new THREE.Vector3(pos.x, pos.y, pos.z),
          rotQuat,
          new THREE.Vector3(pulseScale, pulseScale, pulseScale),
        );
        mesh.setMatrixAt(localIdx, dummyMatrix);

        if (progress >= 1.0) {
          bloom.active = false;
          // Restore base color
          const baseColor = new THREE.Color();
          baseColor.r = 0.22 + (bloom.baseColorVariance || 0);
          baseColor.g = 0.32 + (bloom.baseColorVariance || 0);
          baseColor.b = 0.18 + (bloom.baseColorVariance || 0);
          mesh.setColorAt(localIdx, baseColor);
        }
      } else {
        // Normal matrix (no bloom)
        dummyMatrix.compose(
          new THREE.Vector3(pos.x, pos.y, pos.z),
          rotQuat,
          new THREE.Vector3(scale, scale, scale),
        );
        mesh.setMatrixAt(localIdx, dummyMatrix);
      }

      meshesTouched.add(mapping.mesh);
    }

    // Flush updated instance data to GPU
    for (const m of meshesTouched) {
      const mesh = this._meshes[m];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  /**
   * Trigger a bloom animation on a specific tree.
   * @param {number} id — tree index (0 to count-1)
   * @param {number} [duration=3.0] — bloom duration in seconds
   */
  bloomTree(id, duration = 3.0) {
    if (id < 0 || id >= this.count) return;
    const mapping = this._instanceMap[id];
    if (!mapping) return;

    this._bloomStates[id] = {
      startTime: performance.now() * 0.001,
      duration,
      progress: 0,
      active: true,
      meshIdx: mapping.mesh,
      localIdx: mapping.localIdx,
      baseColorVariance: this._baseScale[id] * 0.1 - 0.05,
    };
  }

  /** Remove all meshes from scene and dispose resources. */
  dispose() {
    for (const mesh of this._meshes) {
      if (mesh.parent) mesh.parent.remove(mesh);
      mesh.geometry.dispose();
    }
    this._meshes.length = 0;
  }

  // ═══════════════════════════════════════════════════════════
  //  L-System engine
  // ═══════════════════════════════════════════════════════════

  /**
   * Run the L-system string rewriting.
   * @param {string} axiom
   * @param {Record<string, string>} rules
   * @param {number} iterations
   * @returns {string}
   */
  _lsystem(axiom, rules, iterations) {
    let result = axiom;
    for (let i = 0; i < iterations; i++) {
      let next = '';
      for (let c = 0; c < result.length; c++) {
        const ch = result[c];
        next += rules[ch] || ch;
      }
      result = next;
    }
    return result;
  }

  // ═══════════════════════════════════════════════════════════
  //  Geometry generation (merged stalk + leaves)
  // ═══════════════════════════════════════════════════════════

  /**
   * Build one complete tree geometry (stalks + leaves merged).
   * This is the core fix for Bug 3: everything lives in one BufferGeometry.
   * @param {number} variantIndex — 0-4, controls L-system parameters
   * @returns {THREE.BufferGeometry}
   */
  _generateTreeGeometry(variantIndex) {
    // ── Variant parameters ────────────────────────────
    const angles = [22, 25, 28, 30, 24];       // degrees
    const segLengths = [0.9, 1.0, 1.1, 0.85, 1.05];
    const baseRadii = [0.12, 0.14, 0.13, 0.11, 0.15];

    let angleDeg = angles[variantIndex % angles.length];
    let angleRad = angleDeg * Math.PI / 180;
    let segLength = segLengths[variantIndex % segLengths.length];
    let baseRadius = baseRadii[variantIndex % baseRadii.length];

    // Slightly vary rules per variant
    let rules;
    if (variantIndex === 3) {
      // Bushier variant
      rules = { X: 'F[+FX][-FX][+FX]FX', F: 'FF' };
    } else if (variantIndex === 4) {
      // Taller, sparser
      rules = { X: 'F[-FX]F[+FX]FX', F: 'FF' };
      angleRad = angleRad * 0.9;
    } else {
      rules = { X: 'F[+FX][-FX]FX', F: 'FF' };
    }

    const command = this._lsystem('X', rules, 4);

    // ── Accumulators for merged geometry ──────────────
    const vertices = [];
    const normals = [];
    const colors = [];
    const indices = [];

    // ── Turtle state ──────────────────────────────────
    const pos = new THREE.Vector3(0, 0, 0);
    const heading = new THREE.Vector3(0, 1, 0); // grows upward
    let thickness = baseRadius;

    // Random number generator (simple mulberry32, deterministic per variant)
    let rngState = 42 + variantIndex * 137;
    const rng = () => {
      rngState |= 0;
      rngState = rngState * 0x6d2b79f5 + 1 | 0;
      return ((rngState ^ rngState >>> 15) * 0x80000001 | 0) >>> 0;
    };
    const rngFloat = () => (rng() % 100000) / 100000;

    const stack = [];

    // ── Walk the command string ───────────────────────
    for (let i = 0; i < command.length; i++) {
      const ch = command[i];

      switch (ch) {
        case 'F': {
          const newPos = pos.clone().addScaledVector(heading, segLength);
          const newThickness = thickness * 0.92;

          this._addStalkSegment(
            vertices, normals, colors, indices,
            pos.clone(), newPos.clone(),
            thickness, newThickness,
          );

          pos.copy(newPos);
          thickness = newThickness;
          break;
        }

        case '+': {
          // Rotate heading by +angle around a random perpendicular axis
          const axis = this._perpendicular(heading, rngFloat());
          heading.applyAxisAngle(axis, angleRad * (0.9 + rngFloat() * 0.2));
          heading.normalize();
          break;
        }

        case '-': {
          // Rotate heading by -angle around a random perpendicular axis
          const axis = this._perpendicular(heading, rngFloat() + 0.5);
          heading.applyAxisAngle(axis, -angleRad * (0.9 + rngFloat() * 0.2));
          heading.normalize();
          break;
        }

        case '[': {
          stack.push({
            pos: pos.clone(),
            heading: heading.clone(),
            thickness,
          });
          break;
        }

        case ']': {
          if (stack.length > 0) {
            // Add leaves at current branch tip (Bug 3 fix: leaves
            // go into the same vertex buffers as stalks)
            this._addLeafCluster(
              vertices, normals, colors, indices,
              pos.clone(), heading.clone(), rngFloat,
            );

            const state = stack.pop();
            pos.copy(state.pos);
            heading.copy(state.heading);
            thickness = state.thickness;
          }
          break;
        }
      }
    }

    // Also add a leaf cluster at the very tip
    this._addLeafCluster(
      vertices, normals, colors, indices,
      pos.clone(), heading.clone(), rngFloat,
    );

    // ── Build final BufferGeometry ────────────────────
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    return geo;
  }

  // ═══════════════════════════════════════════════════════════
  //  Stalk segment geometry helpers
  // ═══════════════════════════════════════════════════════════

  /**
   * Add a hexagonal-prism stalk segment to the merged geometry.
   */
  _addStalkSegment(vertices, normals, colors, indices, start, end, rStart, rEnd) {
    const dir = new THREE.Vector3().subVectors(end, start).normalize();

    // Find two perpendicular vectors forming the cross-section plane
    let ref = new THREE.Vector3(1, 0, 0);
    if (Math.abs(dir.dot(ref)) > 0.95) ref.set(0, 0, 1);
    const u = new THREE.Vector3().crossVectors(dir, ref).normalize();
    const v = new THREE.Vector3().crossVectors(dir, u).normalize();

    const sides = 6;
    const baseIdx = vertices.length / 3;

    // Create start ring and end ring vertices
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2;
      const cu = Math.cos(angle);
      const sv = Math.sin(angle);
      const nx = u.x * cu + v.x * sv;
      const ny = u.y * cu + v.y * sv;
      const nz = u.z * cu + v.z * sv;

      // Start ring
      vertices.push(
        start.x + nx * rStart,
        start.y + ny * rStart,
        start.z + nz * rStart,
      );
      normals.push(nx, ny, nz);

      // End ring
      vertices.push(
        end.x + nx * rEnd,
        end.y + ny * rEnd,
        end.z + nz * rEnd,
      );
      normals.push(nx, ny, nz);
    }

    // Segment stalk color — greenish-gray bamboo tone
    const stalkR = 0.28;
    const stalkG = 0.38;
    const stalkB = 0.22;

    for (let i = 0; i < sides * 2; i++) {
      colors.push(stalkR, stalkG, stalkB);
    }

    // Connect rings with triangle quads
    for (let i = 0; i < sides; i++) {
      const s0 = baseIdx + i * 2;
      const e0 = baseIdx + i * 2 + 1;
      const s1 = baseIdx + ((i + 1) % sides) * 2;
      const e1 = baseIdx + ((i + 1) % sides) * 2 + 1;

      indices.push(s0, e0, s1);
      indices.push(s1, e0, e1);
    }
  }

  /**
   * Add a cluster of 2-3 leaf quads at a branch tip.
   * Leaves are part of the SAME merged geometry — this is the Bug 3 fix.
   */
  _addLeafCluster(vertices, normals, colors, indices, tipPos, direction, rngFloat) {
    const leafCount = 2 + Math.floor(rngFloat() * 2); // 2-3 leaves

    for (let l = 0; l < leafCount; l++) {
      // Fan leaves around the branch direction
      const fanAngle = (l / leafCount) * Math.PI * 2 + rngFloat() * 0.5;
      const spreadAngle = 0.5 + rngFloat() * 0.4; // ~30-50 degrees from branch direction

      // Create a leaf direction rotated away from the branch axis
      const branchDir = direction.clone().normalize();
      const leafPerp = this._perpendicular(branchDir, fanAngle);

      // Rotate branch direction toward the perpendicular by spreadAngle
      const leafDir = branchDir.clone()
        .multiplyScalar(Math.cos(spreadAngle))
        .addScaledVector(leafPerp, Math.sin(spreadAngle))
        .normalize();

      this._addLeafQuad(
        vertices, normals, colors, indices,
        tipPos, leafDir,
      );
    }
  }

  /**
   * Add a single leaf quad at the given position, oriented along leafDir.
   */
  _addLeafQuad(vertices, normals, colors, indices, center, leafDir) {
    const halfLen = 0.25 + Math.random() * 0.15;
    const halfWid = 0.04 + Math.random() * 0.03;

    // Compute leaf orientation
    const dir = leafDir.clone().normalize();
    let ref = new THREE.Vector3(0, 1, 0);
    if (Math.abs(dir.dot(ref)) > 0.95) ref.set(1, 0, 0);
    const leafNormal = new THREE.Vector3().crossVectors(dir, ref).normalize();
    const leafWidth = new THREE.Vector3().crossVectors(dir, leafNormal).normalize();

    const baseIdx = vertices.length / 3;
    const tip = center.clone().addScaledVector(dir, halfLen);
    const base = center.clone().addScaledVector(dir, -halfLen);

    // 4 corners of the elongated leaf quad
    vertices.push(
      base.x + leafWidth.x * halfWid, base.y + leafWidth.y * halfWid, base.z + leafWidth.z * halfWid,
      base.x - leafWidth.x * halfWid, base.y - leafWidth.y * halfWid, base.z - leafWidth.z * halfWid,
      tip.x - leafWidth.x * halfWid, tip.y - leafWidth.y * halfWid, tip.z - leafWidth.z * halfWid,
      tip.x + leafWidth.x * halfWid, tip.y + leafWidth.y * halfWid, tip.z + leafWidth.z * halfWid,
    );

    // Normals point outward (leaf surface normal)
    for (let i = 0; i < 4; i++) {
      normals.push(leafNormal.x, leafNormal.y, leafNormal.z);
    }

    // Leaf color — slightly different green
    const leafR = 0.25 + Math.random() * 0.1;
    const leafG = 0.40 + Math.random() * 0.1;
    const leafB = 0.20 + Math.random() * 0.06;
    for (let i = 0; i < 4; i++) {
      colors.push(leafR, leafG, leafB);
    }

    // Two triangles
    indices.push(baseIdx, baseIdx + 1, baseIdx + 2);
    indices.push(baseIdx, baseIdx + 2, baseIdx + 3);
  }

  // ═══════════════════════════════════════════════════════════
  //  Utility
  // ═══════════════════════════════════════════════════════════

  /**
   * Return a unit vector perpendicular to `dir`.
   * The `seed` parameter rotates the result around `dir`.
   */
  _perpendicular(dir, seed) {
    let ref = new THREE.Vector3(1, 0, 0);
    if (Math.abs(dir.dot(ref)) > 0.95) ref.set(0, 0, 1);
    const perp = new THREE.Vector3().crossVectors(dir, ref).normalize();

    // Rotate around dir by seed * 2PI for variation
    const rotAngle = (seed - Math.floor(seed)) * Math.PI * 2;
    const axis = dir.clone().normalize();
    perp.applyAxisAngle(axis, rotAngle);

    return perp.normalize();
  }

  // ═══════════════════════════════════════════════════════════
  //  Instance placement
  // ═══════════════════════════════════════════════════════════

  /**
   * Place all tree instances on the terrain.
   * 🔑 Bug 1 fix: Y position from terrain.getHeightAt().
   * 🔑 Bug 2 fix: random scale, rotation, color per instance.
   */
  _placeTrees() {
    const variantCount = this._meshes.length;
    const perVariant = Math.ceil(this.count / variantCount);

    // Poisson-like distribution: use jittered grid for natural spacing
    const gridSize = Math.ceil(Math.sqrt(this.count * 1.3));
    const cellSize = (this.spawnRadius * 2) / gridSize;

    const placed = [];

    // Generate jittered grid positions
    for (let gx = 0; gx < gridSize && placed.length < this.count; gx++) {
      for (let gz = 0; gz < gridSize && placed.length < this.count; gz++) {
        // Jitter within cell
        const jx = (Math.random() - 0.5) * cellSize * 0.7;
        const jz = (Math.random() - 0.5) * cellSize * 0.7;
        const wx = (gx + 0.5) * cellSize - this.spawnRadius + jx;
        const wz = (gz + 0.5) * cellSize - this.spawnRadius + jz;

        // Keep within spawn radius
        if (Math.sqrt(wx * wx + wz * wz) > this.spawnRadius) continue;

        placed.push({ x: wx, z: wz });
      }
    }

    // Shuffle positions so variant assignment is random
    for (let i = placed.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [placed[i], placed[j]] = [placed[j], placed[i]];
    }

    // Place instances
    for (let i = 0; i < this.count; i++) {
      const pos2D = placed[i] || {
        x: (Math.random() - 0.5) * this.spawnRadius * 2,
        z: (Math.random() - 0.5) * this.spawnRadius * 2,
      };

      const variantIdx = i % variantCount;
      const mesh = this._meshes[variantIdx];
      const localIdx = Math.floor(i / variantCount);

      if (localIdx >= mesh.count) continue;

      // 🔑 Bug 1 fix: sample terrain height
      const wy = this.terrain.getHeightAt(pos2D.x, pos2D.z);

      // 🔑 Bug 2 fix: per-instance random variation
      const scale = 0.55 + Math.random() * 0.95;   // 0.55 ~ 1.5
      const rotY = Math.random() * Math.PI * 2;
      const colorVar = (Math.random() - 0.5) * 0.15; // ±7.5% tint variance

      // Store base state for animation
      this._basePos[i] = { x: pos2D.x, y: wy, z: pos2D.z };
      this._baseScale[i] = scale;
      this._baseRotY[i] = rotY;
      this._instanceMap[i] = { mesh: variantIdx, localIdx };

      // Set initial matrix
      const matrix = new THREE.Matrix4();
      matrix.compose(
        new THREE.Vector3(pos2D.x, wy, pos2D.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0)),
        new THREE.Vector3(scale, scale, scale),
      );
      mesh.setMatrixAt(localIdx, matrix);

      // Set per-instance color
      const r = 0.22 + colorVar;
      const g = 0.32 + colorVar;
      const b = 0.18 + colorVar;
      mesh.setColorAt(localIdx, new THREE.Color(r, g, b));
    }

    // Flush instance data to GPU
    for (const mesh of this._meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}

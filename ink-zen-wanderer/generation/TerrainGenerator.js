import * as THREE from 'three';
import { fractalNoise2D, smoothstep, clamp, lerp } from '../utils/MathHelper.js';

/**
 * TerrainGenerator — Perlin 噪声地形 + 水面
 * [同学A]
 *
 * 生成水墨风格的高低起伏地形，高度着色渐变，带动态水面。
 * 暴露 getHeightAt(x,z) 供 FractalTree 查询地表高度放置树木。
 */
export class TerrainGenerator {
  /**
   * @param {object} [opts]
   * @param {number} [opts.size=400]          - 地形世界尺寸 (XZ 方向)
   * @param {number} [opts.resolution=256]    - 高度图分辨率 (格点数/轴)
   * @param {number} [opts.heightScale=22]    - 最大垂直高度
   * @param {number} [opts.noiseScale=0.012]  - 噪声缩放 (越小地形越平缓)
   * @param {number} [opts.octaves=6]         - 分形叠层数
   * @param {number} [opts.waterLevel=2.0]    - 水面 Y 坐标
   */
  constructor(opts = {}) {
    this.size = opts.size ?? 400;
    this.resolution = opts.resolution ?? 256;
    this.heightScale = opts.heightScale ?? 22;
    this.noiseScale = opts.noiseScale ?? 0.012;
    this.octaves = opts.octaves ?? 6;
    this.waterLevel = opts.waterLevel ?? 2.0;

    this.segmentSize = this.size / this.resolution;
    this.halfSize = this.size / 2;

    // ── 1. Generate heightmap ──────────────────────────────
    this._heightData = new Float32Array(this.resolution * this.resolution);
    this._buildHeightmap();

    // ── 2. Build terrain mesh ──────────────────────────────
    this.mesh = this._buildTerrainMesh();

    // ── 3. Build water mesh ────────────────────────────────
    this.water = this._buildWaterMesh();
  }

  // ═══════════════════════════════════════════════════════════
  //  Heightmap
  // ═══════════════════════════════════════════════════════════

  _buildHeightmap() {
    const noiseOpts = {
      octaves: this.octaves,
      persistence: 0.5,
      lacunarity: 2.0,
      scale: this.noiseScale,
    };

    for (let iz = 0; iz < this.resolution; iz++) {
      for (let ix = 0; ix < this.resolution; ix++) {
        // World-space coords for this grid cell
        const wx = ix * this.segmentSize - this.halfSize;
        const wz = iz * this.segmentSize - this.halfSize;

        // Multi-octave noise
        let h = fractalNoise2D(wx, wz, noiseOpts);

        // Add a second noise layer for large-scale mountain shapes
        const macro = fractalNoise2D(wx, wz, {
          octaves: 3,
          persistence: 0.6,
          lacunarity: 2.0,
          scale: this.noiseScale * 0.4,
        });
        h = h * 0.7 + macro * 0.3;

        // Scale to world height
        h *= this.heightScale;

        this._heightData[iz * this.resolution + ix] = h;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  Terrain mesh
  // ═══════════════════════════════════════════════════════════

  _buildTerrainMesh() {
    const segs = this.resolution - 1; // segments for PlaneGeometry
    const geo = new THREE.PlaneGeometry(this.size, this.size, segs, segs);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const vertexCount = pos.count;

    // Create color attribute
    const colors = new Float32Array(vertexCount * 3);

    for (let i = 0; i < vertexCount; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);

      // Sample height from heightmap
      const h = this._sampleHeightmap(vx, vz);
      pos.setY(i, h);

      // Compute vertex color from height — ink-wash gradient
      const { r, g, b } = this._heightToColor(h);
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      roughness: 0.85,
      vertexColors: true,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    return mesh;
  }

  /**
   * Bilinear sample of the heightmap at arbitrary world (x, z).
   * Used by vertex displacement during mesh construction.
   */
  _sampleHeightmap(wx, wz) {
    // Grid-space coordinates
    const gx = (wx + this.halfSize) / this.segmentSize;
    const gz = (wz + this.halfSize) / this.segmentSize;

    const ix0 = clamp(Math.floor(gx), 0, this.resolution - 1);
    const iz0 = clamp(Math.floor(gz), 0, this.resolution - 1);
    const ix1 = clamp(ix0 + 1, 0, this.resolution - 1);
    const iz1 = clamp(iz0 + 1, 0, this.resolution - 1);

    const fx = gx - ix0;
    const fz = gz - iz0;

    const h00 = this._heightData[iz0 * this.resolution + ix0];
    const h10 = this._heightData[iz0 * this.resolution + ix1];
    const h01 = this._heightData[iz1 * this.resolution + ix0];
    const h11 = this._heightData[iz1 * this.resolution + ix1];

    return lerp(lerp(h00, h10, fx), lerp(h01, h11, fx), fz);
  }

  /**
   * Map a terrain height to an ink-wash color.
   * Low valleys → deep ink black; mid → slate gray; peaks → paper white.
   */
  _heightToColor(h) {
    // Normalize height to [0, 1] approximately
    const t = clamp((h / this.heightScale + 1) / 2, 0, 1);

    // Ink-wash palette definitions
    const deepInk = { r: 0.12, g: 0.10, b: 0.08 };   // 浓墨 (valley)
    const midInk = { r: 0.30, g: 0.28, b: 0.26 };     // 淡墨 (mid)
    const lightWash = { r: 0.65, g: 0.63, b: 0.60 };  // 清墨 (upper mid)
    const paper = { r: 0.96, g: 0.94, b: 0.91 };      // 宣纸白 (peak)

    let r, g, b;

    if (t < 0.3) {
      // Deep ink → mid ink
      const s = smoothstep(0, 0.3, t);
      r = lerp(deepInk.r, midInk.r, s);
      g = lerp(deepInk.g, midInk.g, s);
      b = lerp(deepInk.b, midInk.b, s);
    } else if (t < 0.6) {
      // Mid ink → light wash
      const s = smoothstep(0.3, 0.6, t);
      r = lerp(midInk.r, lightWash.r, s);
      g = lerp(midInk.g, lightWash.g, s);
      b = lerp(midInk.b, lightWash.b, s);
    } else {
      // Light wash → paper white
      const s = smoothstep(0.6, 1.0, t);
      r = lerp(lightWash.r, paper.r, s);
      g = lerp(lightWash.g, paper.g, s);
      b = lerp(lightWash.b, paper.b, s);
    }

    // Subtle blue tint for areas below water level
    if (h < this.waterLevel) {
      const wetness = clamp((this.waterLevel - h) / 3, 0, 0.4);
      r = lerp(r, r * 0.7, wetness);
      g = lerp(g, g * 0.8, wetness);
      b = lerp(b, b * 1.3, wetness);
    }

    return { r, g, b };
  }

  // ═══════════════════════════════════════════════════════════
  //  Water mesh
  // ═══════════════════════════════════════════════════════════

  _buildWaterMesh() {
    const waterSize = this.size * 1.05; // slightly larger than terrain
    const waterSegs = 64;
    const geo = new THREE.PlaneGeometry(waterSize, waterSize, waterSegs, waterSegs);
    geo.rotateX(-Math.PI / 2);

    // Store base positions for animation
    const pos = geo.attributes.position;
    this._waterBaseX = new Float32Array(pos.count);
    this._waterBaseZ = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      this._waterBaseX[i] = pos.getX(i);
      this._waterBaseZ[i] = pos.getZ(i);
      pos.setY(i, this.waterLevel);
    }

    const mat = new THREE.MeshStandardMaterial({
      color: 0x8899aa,
      roughness: 0.2,
      metalness: 0.05,
      transparent: true,
      opacity: 0.5,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = this.waterLevel;
    mesh.name = 'water';

    return mesh;
  }

  /**
   * Animate water surface. Call every frame.
   * Uses 3 layered sine waves at different frequencies and directions.
   * @param {number} time — elapsed time in seconds
   */
  updateWater(time) {
    const pos = this.water.geometry.attributes.position;
    const arr = pos.array;

    for (let i = 0; i < pos.count; i++) {
      const x = this._waterBaseX[i];
      const z = this._waterBaseZ[i];
      arr[i * 3 + 1] =
        Math.sin(x * 0.04 + time * 0.8) * 0.35 +
        Math.cos(z * 0.05 + time * 0.6) * 0.35 +
        Math.sin((x + z) * 0.03 + time * 1.1) * 0.2;
    }
    pos.needsUpdate = true;
    // Normals also need updating since geometry changed
    this.water.geometry.computeVertexNormals();
  }

  // ═══════════════════════════════════════════════════════════
  //  Public query API
  // ═══════════════════════════════════════════════════════════

  /**
   * Return the terrain surface height (world Y) at an arbitrary (x, z).
   * Uses bilinear interpolation between the 4 nearest heightmap samples.
   *
   * 🔑 树木放置时用此方法获取精确地表高度，确保根部贴合地面。
   *
   * @param {number} x — world X coordinate
   * @param {number} z — world Z coordinate
   * @returns {number} world Y (terrain surface height)
   */
  getHeightAt(x, z) {
    const gx = (x + this.halfSize) / this.segmentSize;
    const gz = (z + this.halfSize) / this.segmentSize;

    const ix0 = clamp(Math.floor(gx), 0, this.resolution - 1);
    const iz0 = clamp(Math.floor(gz), 0, this.resolution - 1);
    const ix1 = clamp(ix0 + 1, 0, this.resolution - 1);
    const iz1 = clamp(iz0 + 1, 0, this.resolution - 1);

    const fx = clamp(gx - ix0, 0, 1);
    const fz = clamp(gz - iz0, 0, 1);

    const h00 = this._heightData[iz0 * this.resolution + ix0];
    const h10 = this._heightData[iz0 * this.resolution + ix1];
    const h01 = this._heightData[iz1 * this.resolution + ix0];
    const h11 = this._heightData[iz1 * this.resolution + ix1];

    return lerp(lerp(h00, h10, fx), lerp(h01, h11, fx), fz);
  }
}

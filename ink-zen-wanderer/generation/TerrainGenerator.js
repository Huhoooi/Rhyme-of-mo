/**
 * TerrainGenerator — Perlin 噪声地形生成 + 高度颜色插值（同学 A 负责）
 *
 * 功能：
 *  - 3D Perlin 噪声 + FBM（分形布朗运动）多层叠加
 *  - PlaneGeometry 顶点高度位移，生成起伏山脉
 *  - 高度→颜色插值：山脚青绿渐变至山顶灰白，模拟水墨渐变
 *  - 水面平面：正弦波顶点动画 + 简易菲涅尔反射
 *  - getHeightAt(x, z)：供叙事系统/相机查询地形高度
 *
 * 使用方式（main.js 中）：
 *   import { TerrainGenerator } from './generation/TerrainGenerator.js';
 *   const terrain = new TerrainGenerator(200, 256, 30);
 *   scene.remove(ground);  // 移除临时地面
 *   scene.add(terrain.createTerrainMesh());
 *   const { mesh: water, update: updateWater } = terrain.createWaterMesh();
 *   scene.add(water);
 *   // 每帧: updateWater(time);
 */

import * as THREE from 'three';

export class TerrainGenerator {
  /**
   * @param {number} size       地形边长（世界单位）
   * @param {number} segments   网格细分段数
   * @param {number} heightScale 最大高度
   * @param {number} [seed]     噪声种子
   */
  constructor(size = 200, segments = 256, heightScale = 30, seed = null) {
    this.size = size;
    this.segments = segments;
    this.heightScale = heightScale;
    this.seed = seed ?? Math.random() * 10000;

    // FBM 参数
    this.octaves = 6;
    this.persistence = 0.5;
    this.lacunarity = 2.0;
    this.frequency = 0.018;

    // 水墨颜色映射 [高度 0→1]
    this.colorStops = [
      { h: 0.0, color: new THREE.Color('#3b6b4f') },  // 山脚 — 青绿
      { h: 0.3, color: new THREE.Color('#5a7a5a') },  // 低坡
      { h: 0.5, color: new THREE.Color('#8a8a7a') },  // 山腰 — 灰绿过渡
      { h: 0.7, color: new THREE.Color('#b0b0a8') },  // 山肩 — 浅灰
      { h: 0.9, color: new THREE.Color('#d8d8d0') },  // 近山顶
      { h: 1.0, color: new THREE.Color('#f2f0e8') },  // 山顶 — 灰白留白
    ];

    this._terrainMesh = null;
    this._waterData = null;
  }

  // ═══ Perlin 噪声核心 ═══════════════════════════════════════

  _gradient(hash) {
    // 12条单位立方体对角线方向
    const g = [
      [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
      [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
      [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
    ];
    return g[((hash % 12) + 12) % 12];
  }

  _hash(x, y, z) {
    let h = this.seed + x * 374761393 + y * 668265263 + z * 1440676933;
    h = ((h ^ (h >> 13)) * 1274126177) | 0;
    return (h ^ (h >> 16)) % 2147483647;
  }

  _fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  /**
   * 单层 3D Perlin 噪声采样
   * @returns {number} 范围 [-1, 1]
   */
  _perlin(x, y, z) {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const zi = Math.floor(z) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const zf = z - Math.floor(z);

    const u = this._fade(xf);
    const v = this._fade(yf);
    const w = this._fade(zf);

    const aaa = this._hash(xi, yi, zi);
    const baa = this._hash(xi + 1, yi, zi);
    const aba = this._hash(xi, yi + 1, zi);
    const bba = this._hash(xi + 1, yi + 1, zi);
    const aab = this._hash(xi, yi, zi + 1);
    const bab = this._hash(xi + 1, yi, zi + 1);
    const abb = this._hash(xi, yi + 1, zi + 1);
    const bbb = this._hash(xi + 1, yi + 1, zi + 1);

    const dot = (h, dx, dy, dz) => {
      const g = this._gradient(h);
      return g[0] * dx + g[1] * dy + g[2] * dz;
    };

    const x1 = THREE.MathUtils.lerp(dot(aaa, xf, yf, zf), dot(baa, xf - 1, yf, zf), u);
    const x2 = THREE.MathUtils.lerp(dot(aba, xf, yf - 1, zf), dot(bba, xf - 1, yf - 1, zf), u);
    const y1 = THREE.MathUtils.lerp(x1, x2, v);

    const x3 = THREE.MathUtils.lerp(dot(aab, xf, yf, zf - 1), dot(bab, xf - 1, yf, zf - 1), u);
    const x4 = THREE.MathUtils.lerp(dot(abb, xf, yf - 1, zf - 1), dot(bbb, xf - 1, yf - 1, zf - 1), u);
    const y2 = THREE.MathUtils.lerp(x3, x4, v);

    return THREE.MathUtils.lerp(y1, y2, w);
  }

  /**
   * FBM 分形布朗运动 — 多层噪声叠加
   * @returns {number} [0, 1] 归一化高度
   */
  fbm(x, y, z) {
    let amp = 1;
    let freq = this.frequency;
    let val = 0;
    let max = 0;
    for (let i = 0; i < this.octaves; i++) {
      val += amp * this._perlin(x * freq, y * freq, z * freq);
      max += amp;
      amp *= this.persistence;
      freq *= this.lacunarity;
    }
    return (val / max) * 0.5 + 0.5;
  }

  // ═══ 公开接口 ═════════════════════════════════════════════

  /**
   * 查询世界坐标 (x, z) 处的地形高度
   * @returns {number} 世界空间 Y 坐标
   */
  getHeightAt(x, z) {
    const nx = x + this.size * 0.5;
    const nz = z + this.size * 0.5;
    return this.fbm(nx * this.frequency, 0, nz * this.frequency) * this.heightScale;
  }

  /**
   * 创建地形网格
   * @returns {THREE.Mesh}
   */
  createTerrainMesh() {
    const geo = new THREE.PlaneGeometry(this.size, this.size, this.segments, this.segments);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = this.fbm(x * this.frequency, 0, z * this.frequency);
      const worldY = h * this.heightScale;

      pos.setY(i, worldY);
      // 微小水平偏移增加自然感
      pos.setX(i, x + (h - 0.5) * 1.5);

      const c = this._interpColor(h);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    geo.attributes.position.needsUpdate = true;

    const mat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        varying vec3 vPos;
        varying vec3 vNormal;
        varying vec3 vColor;
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          vPos = position.xyz;
          vNormal = normalize(mat3(modelMatrix) * normal);
          vColor = color;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vPos;
        varying vec3 vNormal;
        varying vec3 vColor;
        varying vec3 vWorldPos;
        uniform vec3 uLightDir;
        uniform vec3 uAmbientColor;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        void main() {
          float NdotL = dot(normalize(vNormal), normalize(uLightDir));
          float level = smoothstep(-0.1, 0.3, NdotL) * 0.33
                      + smoothstep(0.3, 0.7, NdotL) * 0.33
                      + smoothstep(0.7, 1.1, NdotL) * 0.34;
          vec3 diffuse = vColor * (0.4 + level * 0.6);
          vec3 ambient = uAmbientColor * vColor * 0.25;
          vec3 color = diffuse + ambient;
          float dist = length(vWorldPos - cameraPosition);
          float fog = 1.0 - exp(-uFogDensity * dist);
          color = mix(color, uFogColor, fog);
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      uniforms: {
        uLightDir: { value: new THREE.Vector3(0.6, 1, 0.4).normalize() },
        uAmbientColor: { value: new THREE.Color('#f5f0e8') },
        uFogColor: { value: new THREE.Color('#F5F5DC') },
        uFogDensity: { value: 0.0035 },
      },
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    this._terrainMesh = mesh;
    return mesh;
  }

  /**
   * 创建水面
   * @returns {{ mesh: THREE.Mesh, update: (time: number) => void }}
   */
  createWaterMesh() {
    const waterSize = this.size * 0.65;
    const segs = 128;
    const geo = new THREE.PlaneGeometry(waterSize, waterSize, segs, segs);
    geo.rotateX(-Math.PI / 2);

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        uniform float uTime;
        void main() {
          vec3 pos = position;
          pos.y += sin(pos.x * 0.3 + uTime) * 0.3
                 + cos(pos.y * 0.4 + uTime * 0.7) * 0.2;
          vec4 wp = modelMatrix * vec4(pos, 1.0);
          vWorldPos = wp.xyz;
          vNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        uniform vec3 uViewPos;
        uniform vec3 uWaterColor;
        void main() {
          vec3 V = normalize(uViewPos - vWorldPos);
          float fresnel = pow(1.0 - abs(dot(V, normalize(vNormal))), 3.0);
          vec3 color = mix(uWaterColor, vec3(0.85, 0.87, 0.82), fresnel * 0.5);
          color += smoothstep(0.3, 0.6, fresnel) * 0.15;
          gl_FragColor = vec4(color, 0.55);
        }
      `,
      uniforms: {
        uTime: { value: 0 },
        uViewPos: { value: new THREE.Vector3(0, 10, 0) },
        uWaterColor: { value: new THREE.Color('#7a9a8a') },
      },
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 1.5;
    mesh.name = 'water';

    this._waterData = { mesh, mat };
    return {
      mesh,
      update: (time) => { mat.uniforms.uTime.value = time; },
    };
  }

  // ═══ 内部工具 ═════════════════════════════════════════════

  _interpColor(h) {
    const t = Math.max(0, Math.min(1, h));
    for (let i = 0; i < this.colorStops.length - 1; i++) {
      const a = this.colorStops[i];
      const b = this.colorStops[i + 1];
      if (t >= a.h && t <= b.h) {
        return a.color.clone().lerp(b.color, (t - a.h) / (b.h - a.h));
      }
    }
    return this.colorStops[this.colorStops.length - 1].color.clone();
  }
}

/**
 * FractalTree — L-System 分形树 + GPU Instancing（同学 A 负责）
 *
 * 功能：
 *  - L-System 字符串生成（可配置公理/规则/迭代次数）
 *  - Turtle 3D 解释器 → 树枝段（位置、方向、长度、半径）
 *  - GPU Instancing（THREE.InstancedMesh）批量渲染数千棵树
 *  - 随机变异（枝长、角度、旋转）模拟自然生长
 *  - 随风摆动动画（简易正弦扰动）
 *  - 叙事联动：单棵树"开花"变色
 *
 * 默认 L-System 规则：
 *   axiom:  "X"
 *   rules:  X → "F[+X][-X]FX"
 *           F → "FF"
 *
 * 使用方式（main.js 中）：
 *   import { FractalTree } from './generation/FractalTree.js';
 *   const forest = new FractalTree({ treeCount: 400, iterations: 4 });
 *   const mesh = forest.generate(terrain);
 *   scene.add(mesh);
 *   // 每帧: forest.update(dt);
 */

import * as THREE from 'three';

const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _pos = new THREE.Vector3();

export class FractalTree {
  /**
   * @param {object} [options]
   * @param {string} [options.axiom]      L-System 公理
   * @param {object} [options.rules]      L-System 替换规则
   * @param {number} [options.iterations] 迭代次数（建议 3-4）
   * @param {number} [options.angle]      分支角度（弧度），默认 25°
   * @param {number} [options.treeCount]  场景中树的总数
   * @param {number} [options.maxHeight]  树的最大高度
   * @param {number} [options.seed]       随机种子
   */
  constructor(options = {}) {
    this.axiom = options.axiom ?? 'X';
    this.rules = options.rules ?? { X: 'F[+X][-X]FX', F: 'FF' };
    this.iterations = options.iterations ?? 4;
    this.angle = options.angle ?? THREE.MathUtils.degToRad(25);
    this.treeCount = options.treeCount ?? 400;
    this.maxHeight = options.maxHeight ?? 8;
    this.seed = options.seed ?? Math.random() * 10000;

    // 场景范围（树散落区域半径）
    this.spreadRadius = 80;

    this._instancedMesh = null;
    this._branchData = [];       // 所有树的所有树枝数据
    this._treeMeta = [];         // 每棵树的元数据（根位置、随机参数）
    this._time = 0;
  }

  // ═══ L-System 字符串生成 ═════════════════════════════════

  /**
   * 迭代生成 L-System 字符串
   * @param {number} [iterations] 覆盖构造函数中的迭代次数
   * @returns {string}
   */
  generateString(iterations = this.iterations) {
    let str = this.axiom;
    for (let i = 0; i < iterations; i++) {
      let next = '';
      for (const ch of str) {
        next += this.rules[ch] ?? ch;
      }
      str = next;
    }
    return str;
  }

  // ═══ Turtle 3D 解释器 ════════════════════════════════════

  /**
   * 将 L-System 字符串解释为树枝段数组
   * 每段包含：起始点、四元数旋转、长度、半径
   *
   * @param {string} lString      L-System 字符串
   * @param {number} [randSeed]   随机种子（每棵树不同以实现变异）
   * @returns {Array<{pos: number[], quat: number[], len: number, radius: number}>}
   */
  interpret(lString, randSeed = 0) {
    const branches = [];
    const stack = [];

    // 当前 turtle 状态
    let x = 0, y = 0, z = 0;
    const orient = new THREE.Quaternion(); // 初始朝向：上
    let length = this.maxHeight * 0.35;
    let radius = 0.25;

    // 随机函数（确定性，基于种子 + 步数）
    let step = 0;
    const rand = () => {
      step++;
      const h = Math.sin((randSeed + step) * 127.1) * 43758.5453;
      return h - Math.floor(h);
    };

    for (const ch of lString) {
      switch (ch) {
        case 'F': {
          // 前进并画枝
          _dir.set(0, 1, 0).applyQuaternion(orient);

          const endX = x + _dir.x * length;
          const endY = y + _dir.y * length;
          const endZ = z + _dir.z * length;

          // 树枝中点 = 位置，方向 = 朝向，长度 = 缩放
          const mx = (x + endX) / 2;
          const my = (y + endY) / 2;
          const mz = (z + endZ) / 2;

          branches.push({
            pos: [mx, my, mz],
            quat: [orient.x, orient.y, orient.z, orient.w],
            len: length,
            radius: radius,
          });

          x = endX;
          y = endY;
          z = endZ;
          break;
        }

        case '+': {
          // 绕局部 Z 轴右转（随机微调）
          const a = this.angle * (0.7 + rand() * 0.6);
          _dir.set(0, 0, 1).applyQuaternion(orient);
          const q = new THREE.Quaternion().setFromAxisAngle(_dir, a);
          orient.multiply(q);
          break;
        }

        case '-': {
          // 绕局部 Z 轴左转（随机微调）
          const a = this.angle * (0.7 + rand() * 0.6);
          _dir.set(0, 0, 1).applyQuaternion(orient);
          const q = new THREE.Quaternion().setFromAxisAngle(_dir, -a);
          orient.multiply(q);
          break;
        }

        case '&': {
          // 绕局部 X 轴俯仰
          _dir.set(1, 0, 0).applyQuaternion(orient);
          const q = new THREE.Quaternion().setFromAxisAngle(_dir, this.angle * 0.5);
          orient.multiply(q);
          break;
        }

        case '^': {
          // 绕局部 X 轴仰角
          _dir.set(1, 0, 0).applyQuaternion(orient);
          const q = new THREE.Quaternion().setFromAxisAngle(_dir, -this.angle * 0.5);
          orient.multiply(q);
          break;
        }

        case '\\': {
          // 绕局部 Y 轴滚转
          _dir.set(0, 1, 0).applyQuaternion(orient);
          const q = new THREE.Quaternion().setFromAxisAngle(_dir, this.angle * 0.3);
          orient.multiply(q);
          break;
        }

        case '/': {
          // 绕局部 Y 轴反向滚转
          _dir.set(0, 1, 0).applyQuaternion(orient);
          const q = new THREE.Quaternion().setFromAxisAngle(_dir, -this.angle * 0.3);
          orient.multiply(q);
          break;
        }

        case '[': {
          // 保存状态
          stack.push({
            x, y, z,
            qx: orient.x, qy: orient.y, qz: orient.z, qw: orient.w,
            length,
            radius,
          });
          // 缩短后续枝长
          length *= 0.7;
          radius *= 0.65;
          break;
        }

        case ']': {
          // 恢复状态
          const s = stack.pop();
          x = s.x;
          y = s.y;
          z = s.z;
          orient.set(s.qx, s.qy, s.qz, s.qw);
          length = s.length;
          radius = s.radius;
          break;
        }
      }
    }

    return branches;
  }

  // ═══ 森林生成 ═══════════════════════════════════════════

  /**
   * 在场景中生成所有树
   * @param {import('./TerrainGenerator.js').TerrainGenerator} terrain — 用于查询高度
   * @returns {THREE.InstancedMesh}
   */
  generate(terrain) {
    const lString = this.generateString();
    this._branchData = [];
    this._treeMeta = [];

    // 收集所有树枝
    for (let i = 0; i < this.treeCount; i++) {
      const seed = this.seed + i * 137;
      const rand = (n) => {
        const h = Math.sin((seed + n) * 127.1) * 43758.5453;
        return h - Math.floor(h);
      };

      // 随机位置（圆形散落）
      const angle = rand(1) * Math.PI * 2;
      const dist = Math.sqrt(rand(2)) * this.spreadRadius;
      const tx = Math.cos(angle) * dist;
      const tz = Math.sin(angle) * dist;

      // 查询地形高度
      const ty = terrain ? terrain.getHeightAt(tx, tz) : 0;

      // 随机缩放和旋转
      const scale = 0.5 + rand(3) * 0.8;
      const rotY = rand(4) * Math.PI * 2;

      // 生成树枝
      const branches = this.interpret(lString, seed);

      this._treeMeta.push({
        rootPos: [tx, ty, tz],
        scale,
        rotY,
        branchOffset: this._branchData.length,
        branchCount: branches.length,
      });

      this._branchData.push(...branches);
    }

    // 构建 InstancedMesh
    return this._buildInstancedMesh();
  }

  /**
   * 构建（或重建）InstancedMesh
   */
  _buildInstancedMesh() {
    // 清理旧网格
    if (this._instancedMesh) {
      this._instancedMesh.geometry.dispose();
      this._instancedMesh.material.dispose();
    }

    const totalBranches = this._branchData.length;

    // 基础枝干几何体：单位长度圆柱（朝向 +Y）
    const baseGeo = new THREE.CylinderGeometry(1, 0.4, 1, 6, 4);

    const mat = new THREE.MeshStandardMaterial({
      color: 0x3a3028,
      roughness: 0.85,
      metalness: 0,
      flatShading: false,
    });

    const mesh = new THREE.InstancedMesh(baseGeo, mat, totalBranches);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'forest';

    // 为每个树枝设置变换矩阵
    const dummy = new THREE.Object3D();
    for (let i = 0; i < totalBranches; i++) {
      const branch = this._branchData[i];

      // 找到所属树的元数据
      let treeMeta = null;
      for (let t = this._treeMeta.length - 1; t >= 0; t--) {
        if (this._treeMeta[t].branchOffset <= i) {
          treeMeta = this._treeMeta[t];
          break;
        }
      }

      if (!treeMeta) continue;

      const tx = treeMeta.rootPos[0];
      const ty = treeMeta.rootPos[1];
      const tz = treeMeta.rootPos[2];

      // 树枝世界坐标 = 树根位置 + 树枝局部位置 * 树缩放
      const bx = tx + branch.pos[0] * treeMeta.scale;
      const by = ty + branch.pos[1] * treeMeta.scale;
      const bz = tz + branch.pos[2] * treeMeta.scale;

      dummy.position.set(bx, by, bz);

      // 树枝朝向（局部四元数）
      const bq = new THREE.Quaternion(branch.quat[0], branch.quat[1], branch.quat[2], branch.quat[3]);

      // 叠加树的 Y 旋转
      const treeRotQ = new THREE.Quaternion().setFromAxisAngle(_up, treeMeta.rotY);
      bq.premultiply(treeRotQ);

      dummy.quaternion.copy(bq);

      // 缩放：长度缩放 Y，半径缩放 XZ
      const s = treeMeta.scale;
      dummy.scale.set(branch.radius * s, branch.len * s, branch.radius * s);

      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      // 实例颜色：树干深色 vs 末梢浅色（基于树枝索引）
      const t = branch.radius / 0.25; // 越粗 → 越接近树干
      const color = new THREE.Color().setHSL(0.1, 0.15, 0.1 + t * 0.3);
      mesh.setColorAt(i, color);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    this._instancedMesh = mesh;
    return mesh;
  }

  // ═══ 动画更新 ═══════════════════════════════════════════

  /**
   * 每帧更新（随风摆动）
   * @param {number} dt 距上一帧秒数
   */
  update(dt) {
    if (!this._instancedMesh) return;
    this._time += dt;

    const dummy = new THREE.Object3D();
    const total = this._branchData.length;

    for (let i = 0; i < total; i++) {
      // 对较细的外层树枝施加更强的摆动
      const branch = this._branchData[i];
      const thinness = 1 - Math.min(branch.radius / 0.25, 1);
      const sway = Math.sin(this._time * 2.5 + branch.pos[1] * 0.5) * thinness * 0.08;

      this._instancedMesh.getMatrixAt(i, _mat4);
      _mat4.decompose(dummy.position, dummy.quaternion, dummy.scale);

      // 绕局部 X 轴微摆
      _dir.set(1, 0, 0).applyQuaternion(dummy.quaternion);
      const swayQ = new THREE.Quaternion().setFromAxisAngle(_dir, sway);
      dummy.quaternion.multiply(swayQ);

      dummy.updateMatrix();
      this._instancedMesh.setMatrixAt(i, dummy.matrix);
    }

    this._instancedMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * 令指定索引的树"开花"（改变颜色）
   * 供叙事系统调用：玩家收集墨魂 → 树变色
   * @param {number} treeIndex
   */
  bloomTree(treeIndex) {
    if (!this._instancedMesh || treeIndex >= this._treeMeta.length) return;

    const meta = this._treeMeta[treeIndex];
    const end = meta.branchOffset + meta.branchCount;

    // 渐变至粉色（模拟开花）
    const blossomColor = new THREE.Color('#e8a0b0');
    for (let i = meta.branchOffset; i < end; i++) {
      const branch = this._branchData[i];
      const t = 1 - Math.min(branch.radius / 0.25, 1); // 末梢更粉
      const base = new THREE.Color().setHSL(0.1, 0.15, 0.1 + (branch.radius / 0.25) * 0.3);
      const color = base.lerp(blossomColor, t * 0.7);
      this._instancedMesh.setColorAt(i, color);
    }
    if (this._instancedMesh.instanceColor) {
      this._instancedMesh.instanceColor.needsUpdate = true;
    }
  }

  /**
   * 获取 InstancedMesh（供外部添加至场景或做其他操作）
   */
  getMesh() {
    return this._instancedMesh;
  }

  /** 释放 GPU 资源 */
  dispose() {
    if (this._instancedMesh) {
      this._instancedMesh.geometry.dispose();
      this._instancedMesh.material.dispose();
      this._instancedMesh = null;
    }
    this._branchData = [];
    this._treeMeta = [];
  }
}

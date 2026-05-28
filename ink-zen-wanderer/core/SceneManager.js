/**
 * SceneManager — 场景管理、雾效、光照、后处理管线（同学 B 负责）
 *
 * 当前为骨架实现：直接使用 main.js 中已有的基础光照和雾效设置。
 * 同学 B 在此文件内完成以下增强后，main.js 解除注释即可接管：
 *
 *  1. 自定义水墨 Shader 材质管理（加载 ink.vert / ink.frag）
 *  2. EffectComposer + RenderPass + ShaderPass 后处理管线
 *  3. 宣纸纹理全屏叠加 Pass
 *  4. 动态雾效参数调节
 *  5. 古琴音效播放控制
 *  6. resize 处理
 *
 * 接口约定（main.js 调用）：
 *   const sm = new SceneManager(scene, renderer, camera);
 *   sm.update(dt);  // 每帧调用
 *   sm.resize(w, h); // 窗口大小变化
 */

import * as THREE from 'three';

export class SceneManager {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.PerspectiveCamera} camera
   * @param {object} [options]
   */
  constructor(scene, renderer, camera, options = {}) {
    this.scene = scene;
    this.renderer = renderer;
    this.camera = camera;

    // 雾效参数
    this.fogColor = new THREE.Color(options.fogColor ?? '#F5F5DC');
    this.fogNear = options.fogNear ?? 80;
    this.fogFar = options.fogFar ?? 300;

    // 初始化基础雾效
    scene.fog = new THREE.Fog(this.fogColor, this.fogNear, this.fogFar);
    scene.background = this.fogColor;

    // TODO: 加载 Shader 文件并创建自定义 ShaderMaterial
    // this._loadShaders();
    // TODO: 初始化 EffectComposer 后处理管线
    // TODO: 创建宣纸纹理全屏 Pass
    // TODO: 加载古琴音效 AudioListener / Audio
  }

  /**
   * 每帧更新（目前仅更新雾效，后续扩展后处理/音效等）
   * @param {number} dt — 距上一帧秒数
   */
  update(dt) {
    // TODO: 同学 B — 更新动态雾效参数
    // TODO: 同学 B — EffectComposer.render()
  }

  /**
   * 窗口大小变化回调
   * @param {number} width
   * @param {number} height
   */
  resize(width, height) {
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    // TODO: 同学 B — 更新 EffectComposer 尺寸
  }

  /**
   * 切换水墨 Shader 模式
   * @param {boolean} enabled
   */
  setInkMode(enabled) {
    // TODO: 同学 B — 切换场景中所有物体的材质
    this._inkMode = enabled;
  }

  /**
   * 设置雾效密度
   * @param {number} density 0~1
   */
  setFogDensity(density) {
    const d = Math.max(0, Math.min(1, density));
    this.scene.fog.density = d;
  }

  /** 清理资源 */
  dispose() {
    // TODO: 同学 B — 释放 EffectComposer、Audio 等资源
  }

  // ── 内部状态 ──
  _inkMode = false;
  _vertexShader = null;
  _fragmentShader = null;
}

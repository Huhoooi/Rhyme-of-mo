# Rhyme-of-Mo（墨境漫游）

基于 WebGL + Three.js 的水墨画风 3D 漫游体验。玩家可在程序化生成的水墨山水中自由探索，触发诗意叙事片段。

## 项目结构

```
ink-zen-wanderer/
├── index.html              # [同学C] 入口文件 & UI 菜单层（暂停 / 设置）
├── main.js                 # [同学C] 主循环、模块组装、叙事触发逻辑
├── core/
│   ├── CameraController.js # [同学C] FPS 漫游、WASD 移动、鼠标视角控制
│   └── SceneManager.js     # [同学B] 场景管理、雾效、光照、后处理管线
├── generation/
│   ├── TerrainGenerator.js # [同学A] Perlin 噪声地形生成、高度颜色插值
│   └── FractalTree.js      # [同学A] L-System 分形树 + GPU Instancing
├── shaders/
│   ├── ink.vert            # [同学B] 水墨顶点着色器
│   └── ink.frag            # [同学B] 水墨片元着色器（Cel Shading + 边缘描边）
├── assets/
│   ├── xuan_paper_noise.png # [同学A] 宣纸纹理
│   └── guqin.mp3           # [同学B] 古琴音效
└── utils/
    └── MathHelper.js       # [三人共用] 向量运算、矩阵变换工具函数
```

## 技术栈

- **Three.js 0.160** — 3D 渲染引擎
- **WebGL 2.0** — GPU 渲染管线
- **Pointer Lock API** — 鼠标锁定与 FPS 视角控制
- **ES Modules** — 模块化组织

## 本地运行

项目使用 ES Modules + CDN 加载 Three.js，直接用静态服务器即可运行：

```bash
# 方式一：Python
cd ink-zen-wanderer
python -m http.server 8080

# 方式二：Node.js
npx serve ink-zen-wanderer

# 方式三：VS Code Live Server 插件
# 右键 index.html → Open with Live Server
```

浏览器打开 `http://localhost:8080`，点击屏幕开始漫游。

## 操作说明

| 按键 | 功能 |
|------|------|
| 鼠标移动 | 视角旋转 |
| W / A / S / D | 前后左右移动 |
| Shift | 加速跑 |
| Space | 上升 |
| Ctrl | 下降 |
| ESC / P | 暂停（打开菜单） |

## 已实现功能

### 同学 C
- **FPS 相机控制器**：Pointer Lock 鼠标视角 + WASD 移动，支持灵敏度调节
- **叙事触发系统**：6 个场景触发区域，进入范围后展示水墨风格文字
- **暂停菜单**：继续漫游 / 设置 / 退出
- **设置面板**：鼠标灵敏度滑块调节
- **水墨 UI 风格**：宣纸色调、墨色面板、朱砂点缀、淡入淡出动画

### 同学 A
- **Perlin 噪声地形**：3D Perlin + FBM 多层叠加，高度颜色插值（山脚青绿→山顶灰白）
- **L-System 分形树**：递归文法生成 + GPU Instancing（350 棵、约 3 万树枝），支持随风摆动和开花变色
- **水面生成**：正弦波顶点动画 + 简易菲涅尔反射
- **MathHelper**：共用数学工具函数

### 同学 B 
- **SceneManager 场景主控**：设计并 3D 场景核心控制流，统一调度全局光照、环境雨雾、天空穹顶及水墨后处理风格。
- **双层雨滴粒子系统**：构建近/远双层雨滴粒子，集成动态风向位移演算与边界重生（落地循环）逻辑，增强空间纵深感。
- **FBM 动态云雾特效**：采用多层半透明网格叠加，结合 FBM 噪声驱动云雾形态演化，深度营造“烟雨江南”的写意氛围。
- **宣纸纹理质感叠加**：利用 Canvas 动态生成高频纸质噪声并进行图层混合，大幅增强画面的写意宣纸物理质感。
- **音效管理与状态恢复**：实现古琴合成背景音效控制，支持本地音频文件的动态加载、多轨混音及播放状态断点恢复。
- **写意水墨Shader**：独立编写 `ink.vert` 与 `ink.frag`，实现基于 **Cel Shading**（非真实感渲染）与三维边缘描边的写意到着色器骨架。

## 协作说明

- `main.js` 中已解除所有模块导入注释，地形和分形树已接入主循环
- 同学 B 解除 `SceneManager` 导入注释并实现后，帧循环中的 `sceneManager.update(dt)` 自动生效
- `CameraController` 独立封装，不依赖其他自定义模块
- CSS 变量集中定义，方便统一调整水墨主题配色

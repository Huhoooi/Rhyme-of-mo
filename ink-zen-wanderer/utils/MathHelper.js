/**
 * MathHelper — 向量运算、矩阵变换工具函数（三人共用）
 * 提供各模块所需的纯数学工具，无外部依赖。
 */
export const MathHelper = {
  degToRad(degrees) {
    return degrees * (Math.PI / 180);
  },

  radToDeg(radians) {
    return radians * (180 / Math.PI);
  },

  lerp(a, b, t) {
    return a + (b - a) * t;
  },

  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  },

  map(value, inMin, inMax, outMin, outMax) {
    return ((value - inMin) / (inMax - inMin)) * (outMax - outMin) + outMin;
  },

  smoothstep(edge0, edge1, x) {
    const t = MathHelper.clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  },

  /** 基于正弦的确定性伪随机，用于噪声种子生成 */
  hash(x) {
    const h = Math.sin(x * 127.1) * 43758.5453;
    return h - Math.floor(h);
  },

  /** 二维平滑噪声（快速噪声查询，不依赖 Perlin） */
  smoothNoise2D(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);

    const h = MathHelper.hash;
    const n00 = h(ix + iy * 57);
    const n10 = h(ix + 1 + iy * 57);
    const n01 = h(ix + (iy + 1) * 57);
    const n11 = h(ix + 1 + (iy + 1) * 57);

    return MathHelper.lerp(
      MathHelper.lerp(n00, n10, sx),
      MathHelper.lerp(n01, n11, sx),
      sy
    );
  },
};

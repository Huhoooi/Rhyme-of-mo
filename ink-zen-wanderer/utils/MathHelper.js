/**
 * MathHelper — 共用数学工具
 * [三人共用] 向量运算、插值函数、Perlin 噪声
 *
 * 纯函数模块，零依赖，无副作用。
 */

// ── Permutation table (Ken Perlin's classic) ──────────────────
const _perm = new Uint8Array(512);
const _grad3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];

// Seed the permutation table with a shuffled 0..255 sequence
(function _initPerm() {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  // Fisher–Yates shuffle with fixed seed for reproducibility
  let seed = 42;
  for (let i = 255; i > 0; i--) {
    seed = (seed * 16807 + 0) % 2147483647;
    const j = seed % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) _perm[i] = p[i & 255];
})();

// ── Internal helpers ──────────────────────────────────────────

/** Smoothstep fade curve: 6t^5 - 15t^4 + 10t^3 */
function _fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Dot product of gradient vector at (xi, yi) with distance (dx, dy) */
function _dot2(ix, iy, dx, dy) {
  const gi = _perm[ix + _perm[iy]] % 12;
  return _grad3[gi][0] * dx + _grad3[gi][1] * dy;
}

// ── Public API ────────────────────────────────────────────────

/**
 * 2D Perlin noise.
 * @param {number} x
 * @param {number} y
 * @returns {number} 值域约 [-1, 1]
 */
export function perlin2D(x, y) {
  // Integer grid cell
  const xi = Math.floor(x) & 255;
  const yi = Math.floor(y) & 255;
  // Fractional offset within cell
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  // Fade curves
  const u = _fade(xf);
  const v = _fade(yf);

  // Dot products at 4 corners
  const d00 = _dot2(xi, yi, xf, yf);
  const d10 = _dot2(xi + 1, yi, xf - 1, yf);
  const d01 = _dot2(xi, yi + 1, xf, yf - 1);
  const d11 = _dot2(xi + 1, yi + 1, xf - 1, yf - 1);

  // Bilinear interpolation
  const nx0 = d00 + u * (d10 - d00);
  const nx1 = d01 + u * (d11 - d01);
  return nx0 + v * (nx1 - nx0);
}

/**
 * 分形布朗运动 (fBm) — 多层 Perlin 噪声叠加。
 * @param {number} x
 * @param {number} y
 * @param {object} [opts]
 * @param {number} [opts.octaves=6]        - 叠层数
 * @param {number} [opts.persistence=0.5]  - 每层振幅衰减系数
 * @param {number} [opts.lacunarity=2.0]   - 每层频率倍增系数
 * @param {number} [opts.scale=1.0]        - 全局坐标缩放（越大噪声越密）
 * @returns {number} 值域约 [-1, 1]
 */
export function fractalNoise2D(x, y, opts = {}) {
  const {
    octaves = 6,
    persistence = 0.5,
    lacunarity = 2.0,
    scale = 1.0,
  } = opts;

  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;

  let sx = x * scale;
  let sy = y * scale;

  for (let i = 0; i < octaves; i++) {
    value += perlin2D(sx * frequency, sy * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  // Normalize to approx [-1, 1]
  return value / maxValue;
}

/**
 * 线性插值。
 * @param {number} a
 * @param {number} b
 * @param {number} t - 插值因子 [0, 1]
 * @returns {number}
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * 钳制值到 [min, max] 区间。
 * @param {number} v
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

/**
 * Hermite 平滑阶跃 (smoothstep)。
 * 在 edge0 和 edge1 之间平滑过渡，输出 [0, 1]。
 * @param {number} edge0
 * @param {number} edge1
 * @param {number} x
 * @returns {number}
 */
export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * 区间映射：将 v 从 [inMin, inMax] 线性映射到 [outMin, outMax]。
 * @param {number} v
 * @param {number} inMin
 * @param {number} inMax
 * @param {number} outMin
 * @param {number} outMax
 * @returns {number}
 */
export function mapRange(v, inMin, inMax, outMin, outMax) {
  const t = (v - inMin) / (inMax - inMin);
  return outMin + t * (outMax - outMin);
}

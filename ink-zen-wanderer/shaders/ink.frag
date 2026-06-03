/**
 * 水墨渲染 — 片元着色器（同学 B 负责）
 *
 * 核心效果：
 *  1. Cel Shading — 将漫反射量化为 3~4 个离散色阶
 *  2. 边缘描边 — 基于深度/法线突变的轮廓线检测
 *  3. 边缘光（Rim Light） — 菲涅尔效果模拟墨迹晕染
 *  4. 体积雾 — 指数距离雾 + 淡米色雾色（#F5F5DC）
 *  5. 宣纸纹理叠加 — 全屏噪点纹理混合
 *
 * 可调参数（通过 uniform 传入）：
 *  - uLevels: 色阶数量（默认 3）
 *  - uOutlineThreshold: 描边敏感度
 *  - uRimPower: 边缘光强度
 *  - uFogDensity / uFogColor: 雾参数
 */

varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec3 vViewDir;
varying vec2 vUv;

uniform vec3 uLightDir;          // 主光源方向
uniform vec3 uAmbientColor;      // 环境光颜色
uniform vec3 uDiffuseColor;      // 物体固有色
uniform int  uLevels;            // 色阶数量 2-5
uniform float uOutlineThreshold; // 描边阈值（基于深度）
uniform float uRimPower;         // 边缘光强度
uniform vec3 uFogColor;          // 雾颜色（淡米色）
uniform float uFogDensity;       // 雾密度
uniform sampler2D uPaperTex;     // 宣纸噪点纹理
uniform float uPaperStrength;    // 纹理叠加强度
uniform float uTime;             // 时间（用于轻微噪点动画）

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(vViewDir);
  vec3 L = normalize(uLightDir);

  // ── 1. Cel Shading ─────────────────────────────────
  float NdotL = dot(N, L);
  float level = floor(NdotL * float(uLevels)) / float(uLevels);

  // 将量化的光照映射回亮度范围：暗面保留一定亮度避免死黑
  float brightness = 0.25 + level * 0.75;

  vec3 ambient = uAmbientColor * uDiffuseColor * 0.3;
  vec3 diffuse = uDiffuseColor * brightness;

  // ── 2. Rim Light（边缘光 / 墨迹晕染） ──────────────
  float rim = 1.0 - abs(dot(N, V));
  rim = pow(rim, 2.5) * uRimPower;
  vec3 rimColor = vec3(0.92, 0.88, 0.80); // 暖白晕染

  // ── 3. 组合颜色 ───────────────────────────────────
  vec3 color = ambient + diffuse + rim * rimColor;

  // ── 4. 体积雾 ─────────────────────────────────────
  float dist = length(vWorldPos - cameraPosition);
  float fogFactor = 1.0 - exp(-uFogDensity * dist * dist);
  color = mix(color, uFogColor, fogFactor);

  // ── 5. 宣纸纹理叠加 ───────────────────────────────
  vec2 paperUV = vWorldPos.xz * 0.05 + uTime * 0.002;
  float paperNoise = texture2D(uPaperTex, paperUV).r;
  color = mix(color, color * (0.85 + paperNoise * 0.3), uPaperStrength);

  // ── 6. 描边（简化版：基于视角-法线夹角） ─────────
  float edge = 1.0 - abs(dot(N, V));
  if (edge > uOutlineThreshold) {
    color = mix(color, vec3(0.05, 0.03, 0.02), (edge - uOutlineThreshold) * 3.0);
  }

  gl_FragColor = vec4(color, 1.0);
}

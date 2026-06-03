precision highp float;
varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
    // 1. 归一化向量
  vec3 N = normalize(vNormal);
    // 假设一个固定从右上方打过来的平行光方向 (Light Direction)
  vec3 L = normalize(vec3(1.0, 1.0, 0.8));
  vec3 V = normalize(vViewPosition);

    // 2. 计算标准漫反射强度 (N点乘L)
  float dotNL = dot(N, L);
  float intensity = max(dotNL, 0.0);

    // 3. 【水墨核心：明暗阶梯化】将平滑的光影强制切分成3个墨色阶梯
  float inkScale;
  if(intensity > 0.7) {
    inkScale = 1.0;    // 极亮面（宣纸原色/留白）
  } else if(intensity > 0.3) {
    inkScale = 0.6;    // 淡墨
  } else {
    inkScale = 0.2;    // 浓墨/暗部
  }

    // 4. 【水墨核心：边缘勾线】计算视线与法线点积，越接近边缘值越小
  float rim = 1.0 - max(dot(V, N), 0.0);
    // 用 pow 控制勾线的粗细和硬度，值越大线条越细
  float edge = pow(rim, 3.0); 

    // 5. 基础水墨颜色：这里用灰黑色作为墨底 (#222222)
  vec3 inkColor = vec3(0.13, 0.13, 0.13);
    // 宣纸背景色：淡米色 (#F5F5DC)
  vec3 paperColor = vec3(0.96, 0.96, 0.86);

    // 混合光照效果
  vec3 finalColor = mix(inkColor, paperColor, inkScale);

    // 如果判定在边缘，直接涂黑，模拟毛笔勾边
  if(edge > 0.4) {
    finalColor = inkColor * 0.5; // 深黑色的边框
  }

  gl_FragColor = vec4(finalColor, 1.0);
}
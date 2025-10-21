precision highp float;
varying vec2 vUv;

uniform sampler2D uTransTex;
uniform mat4 uInvProj;
uniform mat4 uInvView;
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform float uRayleighScale;
uniform float uMieScale;
uniform float uGroundAlbedo;
uniform int uSteps;
uniform vec2 uResolution;

uniform float uSunAngularRadius;
uniform float uSunIntensity;
uniform float uHaloStrength;
uniform float uHaloFalloff;


const float PI = 3.141592653589793;
const float Rg = 6360000.0;
const float Rt = 6420000.0;
const float HR = 8000.0;
const float HM = 1200.0;
const vec3 betaR = vec3(5.8e-6, 13.5e-6, 33.1e-6);
const vec3 betaM = vec3(21.0e-6);
const float g = 0.76;

vec3 getViewDir(vec2 uv) {
  vec2 ndc = uv * 2.0 - 1.0;
  vec4 p = vec4(ndc, 1.0, 1.0);
  vec4 v = uInvProj * p;
  v /= v.w;
  v = uInvView * v;
  vec3 dir = normalize(v.xyz - uCamPos);
  return dir;
}

bool raySphere(vec3 ro, vec3 rd, float r, out float t0, out float t1) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r*r;
  float disc = b*b - c;
  if (disc < 0.0) return false;
  float s = sqrt(disc);
  t0 = -b - s; t1 = -b + s;
  return true;
}

float densityR(float h) { return exp(-(h - Rg) / HR); }
float densityM(float h) { return exp(-(h - Rg) / HM); }

float hgPhase(float cosTheta, float gg) {
  float g2 = gg*gg;
  float denom = pow(1.0 + g2 - 2.0*gg*cosTheta, 1.5);
  return (1.0 - g2) / (4.0*PI*denom);
}

vec2 rMuToUV(float r, float mu) {
  float u = clamp((r - (Rg + 1.0)) / ((Rt - 1.0) - (Rg + 1.0)), 0.0, 1.0);
  float v = clamp((mu + 1.0) * 0.5, 0.0, 1.0);
  return vec2(u, v);
}

vec3 sampleTransmittance(vec3 pos, vec3 dir) {
  float r = length(pos);
  vec3 up = pos / r;
  float mu = dot(dir, up);
  vec2 uv = rMuToUV(r, mu);
  return texture2D(uTransTex, uv).rgb;
}

void main() {
  vec3 ro = vec3(0.0, Rg + 2.0, 0.0);
  vec3 rd = getViewDir(vUv);

  float t0, t1;
  if (!raySphere(ro, rd, Rt, t0, t1)) { gl_FragColor = vec4(0.0); return; }
  if (t0 < 0.0) t0 = 0.0;

  int STEPS = max(uSteps, 4);
  float t = t0;
  float dt = (t1 - t0) / float(STEPS);

  vec3 L = vec3(0.0);
  vec3 Tcam = vec3(1.0);

  for (int i=0; i<256; ++i) {
    if (i >= STEPS) break;
    vec3 p = ro + rd * (t + 0.5*dt);
    float h = length(p);
    float rhoR = exp(-(h - Rg) / HR) * uRayleighScale;
    float rhoM = exp(-(h - Rg) / HM) * uMieScale;

    vec3 T_sun = sampleTransmittance(p, uSunDir);

    float cosTheta = dot(rd, uSunDir);
    float phaseR = (3.0/(16.0*PI)) * (1.0 + cosTheta*cosTheta);
    float phaseM = hgPhase(cosTheta, g);

    vec3 sigma_s = betaR * rhoR * phaseR + betaM * rhoM * phaseM;
    vec3 dL = Tcam * sigma_s * T_sun * dt;
    L += dL;

    vec3 sigma_t = betaR * rhoR + betaM * rhoM;
    Tcam *= exp(-sigma_t * dt);

    t += dt;
  }

  // ---- Sun disk & circumsolar halo ----
  // 观察方向与太阳方向夹角
  float cosTS = clamp(dot(rd, uSunDir), -1.0, 1.0);
  float theta = acos(cosTS);

  // 圆盘：用 smoothstep 软边抗锯齿
  float r = uSunAngularRadius;           // ~0.00465 rad
  float edge = r * 0.35;                 // 边缘软化比例，可调
  float disk = smoothstep(r + edge, r - edge, theta);

  // 简易环日（经验项）：高斯或 exp 衰减
  float halo = exp(-pow(theta / (r * uHaloFalloff), 2.0)) * uHaloStrength;

  // 视线方向的大气透过率：用 LUT 近似（从相机点 ro 沿 rd 到顶层）
  vec3 T_view = sampleTransmittance(ro, rd);

  // 太阳基色（可微暖），强度由 uSunIntensity 控制
  vec3 sunCol = vec3(1.0, 0.995, 0.98);

  // 注意：圆盘与环日都是“直射项”，叠加在天空的散射项之上
  L += T_view * sunCol * uSunIntensity * (disk + halo);


  L += uGroundAlbedo * (1.0 - Tcam);
  gl_FragColor = vec4(L, 1.0);
}
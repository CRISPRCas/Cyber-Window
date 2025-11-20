precision highp float;
varying vec2 vUv;

uniform sampler2D uTransTex;
uniform mat4  uInvProj;
uniform mat4  uInvView;
uniform vec3  uCamPos;
uniform vec3  uSunDir;
uniform float uRayleighScale;
uniform float uMieScale;
uniform float uGroundAlbedo;
uniform float uGroundRoughness;
uniform float uGroundNoiseScale;
uniform float uGroundRippleAmp;
uniform float uGroundRippleFreq;
uniform float uGroundRippleSpeed;
uniform int   uSteps;
uniform vec2  uResolution;

// Sun (disk)
uniform float uSunAngularRadius;
uniform float uSunIntensity;
uniform float uHaloStrength;
uniform float uHaloFalloff;

// === Clouds uniforms ===
uniform sampler2D uPerlinTex;
uniform float uCloudCoverage;
uniform float uCloudHeight;
uniform float uCloudThickness;
uniform float uCloudSigmaT;
uniform float uCloudPhaseG;
uniform int   uCloudSteps;
uniform float uCloudMaxDistance;
uniform float uCloudFadeStart;
uniform float uCloudFadeEnd;
uniform vec2  uCloudWind;
uniform float uCloudTime;
uniform float uCloudAmbientK;
uniform float uCloudOpacity;
uniform int   uCloudEnabled;


// Fast approx controls
uniform float uMultiScatterBoost;   // 可设 0
uniform float uAerialStrength;
uniform float uAerialDistance;
uniform float uSkySunIntensity;     // 天空散射使用的太阳强度

// One-bounce multiple scattering
uniform int   uMS_Steps;            // 4~6
uniform float uMS_Strength;         // 0.8~1.2

// Phase
uniform float uMieG;                // 0.60~0.70

// Tone mapping
uniform float uExposure;            // 曝光

const float PI = 3.141592653589793;
const float Rg = 6360000.0;
const float Rt = 6420000.0;
const float HR = 8000.0;
const float HM = 1200.0;
const vec3  betaR = vec3(5.8e-6, 13.5e-6, 33.1e-6);
const vec3  betaM = vec3(21.0e-6);

// ---------- helpers ----------
vec3 ACESFilm(vec3 x){
  const float a=2.51, b=0.03, c=2.43, d=0.59, e=0.14;
  return clamp((x*(a*x+b)) / (x*(c*x+d)+e), 0.0, 1.0);
}
float clampDot(vec3 a, vec3 b){ return clamp(dot(a,b), -1.0, 1.0); }
float hash12(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

void orthoBasis(vec3 n, out vec3 t, out vec3 b){
  vec3 up = abs(n.z) < 0.999 ? vec3(0.0,0.0,1.0) : vec3(1.0,0.0,0.0);
  t = normalize(cross(up, n));
  b = normalize(cross(n, t));
}

float hgPhase(float ct, float g){
  float g2=g*g;
  return (1.0-g2)/(4.0*PI*pow(max(1e-4, 1.0+g2-2.0*g*ct), 1.5));
}

// 太阳光盘角盘平均（4 taps）
float hgPhaseAveraged(vec3 rd, vec3 sunDir, float g, float theta){
  vec3 t, b; orthoBasis(sunDir, t, b);
  vec3 d1 = normalize(sunDir * cos(theta) + t * sin(theta));
  vec3 d2 = normalize(sunDir * cos(theta) - t * sin(theta));
  vec3 d3 = normalize(sunDir * cos(theta) + b * sin(theta));
  vec3 d4 = normalize(sunDir * cos(theta) - b * sin(theta));
  float p1 = hgPhase(clampDot(rd,d1), g);
  float p2 = hgPhase(clampDot(rd,d2), g);
  float p3 = hgPhase(clampDot(rd,d3), g);
  float p4 = hgPhase(clampDot(rd,d4), g);
  return 0.25 * (p1+p2+p3+p4);
}

vec3 getViewDir(vec2 uv){
  vec2 ndc = uv*2.0-1.0;
  vec4 p = vec4(ndc,1.0,1.0);
  vec4 v = uInvProj*p; v/=v.w; v=uInvView*v;
  return normalize(v.xyz - uCamPos);
}

bool raySphere(vec3 ro, vec3 rd, float r, out float t0, out float t1){
  float b = dot(ro,rd);
  float c = dot(ro,ro) - r*r;
  float d = b*b - c;
  if(d<0.0) return false;
  float s = sqrt(d);
  t0 = -b - s; t1 = -b + s;
  return true;
}

float densityR(float h){ return exp(-(h - Rg)/HR); }
float densityM(float h){ return exp(-(h - Rg)/HM); }

vec2 rMuToUV(float r, float mu){
  float u = clamp((r-(Rg+1.0))/((Rt-1.0)-(Rg+1.0)),0.0,1.0);
  float v = clamp((mu+1.0)*0.5,0.0,1.0);
  return vec2(u,v);
}

vec3 sampleTransmittance(vec3 pos, vec3 dir){
  float r = length(pos);
  vec3 up = pos/r;
  float mu = clampDot(dir, up);
  return texture2D(uTransTex, rMuToUV(r,mu)).rgb;
}

// --- Sun visibility with ground occlusion ---------------------------------
vec3 sampleTransmittanceToSun(vec3 pos){
  float r = length(pos);
  vec3  up = pos / r;
  float mu = dot(uSunDir, up);                 // sun dir vs local up
  float mu_min = -sqrt(max(0.0, 1.0 - (Rg*Rg)/(r*r))); // horizon test
  if (mu < mu_min) return vec3(0.0);
  return texture2D(uTransTex, rMuToUV(r, mu)).rgb;
}
// --------------------------------------------------------------------------

// 小旋转矩阵，用于打散各_octave 的相关性
const mat3 FBM_M = mat3(
   0.00,  0.80,  0.60,
  -0.80,  0.36, -0.48,
  -0.60, -0.48,  0.64
);

// 从 2D Perlin 纹理取样（用 XZ 做平面，低频比例 0.01 可按需调）
float noise3D(in vec3 p) {
    vec2 uv = p.xz * 0.01;
    return texture2D(uPerlinTex, uv).r;
}

// 分形布朗运动（FBM）
float fbm(vec3 p) {
    float t;
    float mult = 2.76434;  // 频率倍增
    t  = 0.51749673 * noise3D(p); p = FBM_M * p * mult;
    t += 0.25584929 * noise3D(p); p = FBM_M * p * mult;
    t += 0.12527603 * noise3D(p); p = FBM_M * p * mult;
    t += 0.06255931 * noise3D(p);
    return t;
}

// 云密度（球面高度版）
float cloud_density(vec3 worldPos, vec3 offset, float h) {
    // 形状坐标（低频缩放 + 风偏移）
    vec3 p = worldPos * 0.0212242 + offset;

    float dens = fbm(p);

    // 覆盖度阈值
    float cov = 1.0 - uCloudCoverage;
    dens *= smoothstep(cov, cov + 0.05, dens);

    // 高度衰减：h = |p|-Rg（以米计）
    float t = clamp((h - uCloudHeight) / max(1.0, uCloudThickness), 0.0, 1.0);
    float heightAttenuation = (1.0 - t);
    heightAttenuation *= heightAttenuation; // 边界更柔
    dens *= heightAttenuation;

    return clamp(dens, 0.0, 1.0);
}

void main(){
  vec3 ro = vec3(0.0, Rg + 2.0, 0.0);
  vec3 rd = getViewDir(vUv);
  vec3 up = normalize(ro);

  // ---- 暮光门控：太阳高度 < -5° 时抑制天空散射（软过渡 ±0.75°） ----
  float sunAlt = asin(clamp(dot(uSunDir, up), -1.0, 1.0));   // 弧度
  const float minAltRad = radians(-1.0);   // ≈ 20 分钟
  const float softRad   = radians(0.75);
  float sunGate = smoothstep(minAltRad - softRad, minAltRad + softRad, sunAlt);
  float moonDayFade = 1.0 - smoothstep(-0.2, 0.12, sunAlt); // hide moon when sun high

  // ---------- 地面 ----------
  float tg0,tg1;
  bool didReflect = false;
  if(raySphere(ro, rd, Rg, tg0, tg1) && tg0>0.0){
    vec3 pg = ro + rd*tg0;
    vec3 ng = normalize(pg);

    // Small time-varying ripples to mimic water normals (with decorrelated noise)
    vec3 wt, wb; orthoBasis(ng, wt, wb);
    vec2 p = pg.xz * (0.018 * uGroundRippleFreq);
    float tWave = uCloudTime * uGroundRippleSpeed;

    // Noise gradients for smoother, less repetitive perturbation
    vec2 du = vec2(0.011, 0.0);
    vec2 dv = vec2(0.0, 0.011);
    float h0 = texture2D(uPerlinTex, p + vec2(0.17, -0.09) + vec2(0.05, 0.03)*tWave).r;
    float hx = texture2D(uPerlinTex, p + vec2(-0.13, 0.21) + vec2(-0.04, 0.02)*tWave + du).r;
    float hz = texture2D(uPerlinTex, p + vec2(0.08, 0.16) + vec2(0.02, -0.05)*tWave + dv).r;
    vec2 grad = vec2(hx - h0, hz - h0);

    // Add light hash wobble to break temporal repetition
    grad += (vec2(hash12(p * 4.7 + tWave), hash12(p * 3.9 - tWave)) - 0.5) * 0.12;

    // Distance-based fade (avoid patterned far field)
    float horizDist = length(pg.xz);
    float rippleFade = 1.0 - smoothstep(900.0, 4200.0, horizDist);

    vec2 ripple = grad * (uGroundRippleAmp * rippleFade);
    ng = normalize(ng + wt * ripple.x + wb * ripple.y);

    // Mirror reflection with softened jitter (filtered noise to avoid grain)
    vec3 baseRef = reflect(rd, ng);
    vec3 t, b; orthoBasis(baseRef, t, b);
    float rough = uGroundRoughness;
    vec2 nUv = vUv * uGroundNoiseScale;
    float n1 = texture2D(uPerlinTex, nUv).r - 0.5;
    float n2 = texture2D(uPerlinTex, nUv + vec2(11.7, 5.3)).r - 0.5;
    float h1 = hash12(vUv * 123.4) - 0.5;
    float h2 = hash12(vUv * 456.7) - 0.5;
    float j1 = mix(n1, h1, 0.25);
    float j2 = mix(n2, h2, 0.25);
    vec3 jitter = normalize(baseRef + t * (j1*rough) + b * (j2*rough));
    rd = normalize(mix(baseRef, jitter, 0.9));

    ro = pg + ng*1.0; // lift off ground
    up = normalize(ro);
    didReflect = true;
  }

  float t0,t1;
  if(!raySphere(ro, rd, Rt, t0, t1)){ gl_FragColor = vec4(0.0); return; }
  if(t0<0.0) t0=0.0;

  // ---------- 天空主循环 ----------
  int   STEPS = max(uSteps,4);
  float t = t0;
  float dt = (t1 - t0)/float(STEPS);

  vec3 L = vec3(0.0);
  vec3 Tcam = vec3(1.0);

  for(int i=0;i<256;++i){
    if(i>=STEPS) break;

    vec3 p = ro + rd*(t + 0.5*dt);
    float h = length(p);
    float rhoR = densityR(h)*uRayleighScale;
    float rhoM = densityM(h)*uMieScale;

    vec3 T_sun = sampleTransmittanceToSun(p);

    // 相函数：近太阳角盘平均
    float ct  = clampDot(rd, uSunDir);
    float phaseR = (3.0/(16.0*PI))*(1.0 + ct*ct);
    float phaseM = hgPhase(ct, uMieG);
    float ang = acos(ct);
    float w   = smoothstep(1.2*uSunAngularRadius, 0.0, ang);
    float phaseM_avg = hgPhaseAveraged(rd, uSunDir, uMieG, uSunAngularRadius);
    phaseM = mix(phaseM, phaseM_avg, w);

    vec3 sigma_s = betaR*rhoR*phaseR + betaM*rhoM*phaseM;
    vec3 sunCol  = vec3(1.0,0.995,0.98);
    vec3 Li      = sunGate * sunCol * uSkySunIntensity * T_sun; // 门控
    vec3 dL1     = Tcam * sigma_s * Li * dt;
    L += dL1;

    // one-bounce
    vec3 L2 = vec3(0.0);
    if(uMS_Steps>0){
      float ts0, ts1;
      if(raySphere(p, uSunDir, Rt, ts0, ts1)){
        ts0 = max(0.0, ts0);
        float ds = (ts1 - ts0)/float(uMS_Steps);
        for(int j=0;j<16;++j){
          if(j>=uMS_Steps) break;

          float sj = ts0 + (float(j)+0.5)*ds;
          vec3 q = p + uSunDir*sj;

          float hq = length(q);
          float rhoR_q = densityR(hq)*uRayleighScale;
          float rhoM_q = densityM(hq)*uMieScale;

          vec3 T_sun_q = sampleTransmittanceToSun(q);

          vec3 w_qp = normalize(p - q);
          float cos_q = clampDot(uSunDir, w_qp);
          float phaseR_q = (3.0/(16.0*PI))*(1.0 + cos_q*cos_q);
          float phaseM_q = hgPhase(cos_q, uMieG);

          float dqp = max(1.0, distance(q,p));
          float hmid = 0.5*(hq + h);
          float rhoR_mid = densityR(hmid)*uRayleighScale;
          float rhoM_mid = densityM(hmid)*uMieScale;
          vec3 sigma_t_mid = betaR*rhoR_mid + betaM*rhoM_mid;
          vec3 T_qp = exp(-sigma_t_mid * dqp);

          vec3 sigma_s_q = betaR*rhoR_q*phaseR_q + betaM*rhoM_q*phaseM_q;
          vec3 Li_q = sunGate * (sunCol * uSkySunIntensity) * T_sun_q; // 门控
          vec3 Lq_to_p = sigma_s_q * Li_q * T_qp * ds;

          float cos_p = clampDot(rd, w_qp);
          float phaseR_p = (3.0/(16.0*PI))*(1.0 + cos_p*cos_p);
          float phaseM_p = hgPhase(cos_p, uMieG);
          vec3 sigma_s_p = betaR*rhoR*phaseR_p + betaM*rhoM*phaseM_p;

          L2 += sigma_s_p * Lq_to_p;
        }
      }
    }
    L += Tcam * (uMS_Strength * L2) * dt;

    vec3 sigma_t = betaR*rhoR + betaM*rhoM;
    Tcam *= exp(-sigma_t * dt);
    if (max(Tcam.r, max(Tcam.g, Tcam.b)) < 0.0015) {
      // Mostly extinguished; skip the rest of the march
      break;
    }
    t += dt;
  }

  // ----- Volumetric Clouds: Ray Marching (方案B：用 LUT 调制太阳->云) -----
  if (uCloudEnabled == 1) {
    // 云层半径
    float Rb = Rg + uCloudHeight;            // inner (bottom)
    float RtC = Rb + uCloudThickness;        // outer (top)

    // 与外层相交
    float to0, to1;
    if (raySphere(ro, rd, RtC, to0, to1)) {
      // 选择进入/退出云层的 [t0, t1]
      float t0 = 0.0;
      float t1 = 0.0;

      float rc = length(ro);
      if (rc < Rb) {
        // 相机位于云层以下：先退出 inner，再退出 outer
        float ti0, ti1;
        if (!raySphere(ro, rd, Rb, ti0, ti1)) {
          // 朝向与下边界无交：不渲染云
          // do nothing
        } else {
          t0 = max(0.0, ti1);
          t1 = to1;
        }
      } else if (rc < RtC) {
        // 相机在云层内部：从0开始到外层退出
        t0 = 0.0;
        t1 = to1;
      } else {
        // 相机在云层之外（上方），可能从外层进入到外层退出
        t0 = max(0.0, to0);
        t1 = to1;
      }

      // clamp 最大行进距离
      float tMax = t0 + uCloudMaxDistance;
      t1 = min(t1, tMax);

        if (t1 > t0) {
          int STEPS = max(uCloudSteps, 4);
          float dt = (t1 - t0) / float(STEPS);
          float t = t0 + 0.5 * dt;

          vec3 Tcloud = vec3(1.0);
          vec3 Lcloud = vec3(0.0);

          // 风偏移
          vec3 windOfs = vec3(uCloudWind.x, 0.0, uCloudWind.y) * uCloudTime * 0.02;

        for (int i=0; i<256; ++i) {
          if (i >= STEPS) break;

          vec3 p = ro + rd * t;
          float h = length(p) - Rg;

            // 云密度（0..1）
            float dens = cloud_density(p, windOfs, h);
              // 基于水平距离的衰减：近处概率≈1，超出半径快速衰减到0
              float horizDist = length((p - ro).xz);
              float fadeStart = min(uCloudFadeStart, uCloudFadeEnd);
              float fadeEnd   = max(uCloudFadeStart, uCloudFadeEnd) + 1e-3;
              float rangeFade = 1.0 - smoothstep(fadeStart, fadeEnd, horizDist);
              dens *= rangeFade;
            if (dens > 1e-4) {
              float sigma_t = uCloudSigmaT * dens;
              float alpha   = 1.0 - exp(-sigma_t * dt);

            // 方案B：太阳->样本点的大气透过率（用 LUT）
            vec3 T_sun = sampleTransmittanceToSun(p);

            // 单次散射（HG）
            float cosTheta = dot(rd, uSunDir);
            float phase = hgPhase(cosTheta, uCloudPhaseG);

            // 入射光（直射 + 近似环境天光）
            // Rayleigh-tinted ambient keeps backlit clouds from turning yellow when the sun is low
            vec3 skyTint = normalize(vec3(betaR.r, betaR.g, betaR.b));
            skyTint = pow(skyTint, vec3(0.65));
            vec3 Li = uSunIntensity * T_sun * phase
                    + skyTint * uCloudAmbientK;

            // 贡献并更新云内透过率（Beer–Lambert）
            Lcloud += Tcloud * Li * alpha;
            Tcloud *= exp(-sigma_t * dt);

            // 早停
            if (max(Tcloud.r, max(Tcloud.g, Tcloud.b)) < 0.005) break;
          }

          t += dt;
        }

        // 最终与天空合成（云不透明度整体乘子）
        L = L * Tcloud + Lcloud * uCloudOpacity;
      }
    }
  }
  // ----- end volumetric clouds -----



  // ---------- 暖雾 / Aerial ----------
  // 基于光学厚度与近地平线形状（稳定，避免满屏）
  float viewDistance = max(0.0, t1 - t0);
  float tauView = clamp(1.0 - (Tcam.r + Tcam.g + Tcam.b) * (1.0/3.0), 0.0, 1.0);

  float mu = dot(rd, up);
  float horizonW = smoothstep(0.0, 0.35, 1.0 - mu);

  // 暖色只在太阳升到地平线以上时逐渐出现（避免日出前整屏暖色）
  float warmGate = smoothstep(0.0, 0.12, sunAlt); // 0°→~6.9° 打开
  float sunView   = clampDot(rd, uSunDir);
  float warmBySun = pow(max(0.0, sunView), 3.0) * warmGate;
  float warmByHorizon = horizonW * warmGate;
  float warmMix  = clamp(max(warmBySun, 0.6*warmByHorizon), 0.0, 1.0);

  vec3 rayBlue  = normalize(vec3(betaR.r, betaR.g, betaR.b) / betaR.b);
  rayBlue       = pow(rayBlue, vec3(0.75));
  vec3 warmHaze = vec3(1.0, 0.82, 0.60);

  float fogAlpha = uAerialStrength * tauView * horizonW * sunGate; // 门控
  vec3  fogBase  = mix(rayBlue, warmHaze, warmMix);

  L = mix(L, fogBase, clamp(fogAlpha, 0.0, 1.0));

  // ---------- sun disk ----------
  float ct = clampDot(rd, uSunDir);
  float th = acos(ct);
  float r   = uSunAngularRadius;
  float edge= r*0.35;
  float disk= smoothstep(r+edge, r-edge, th);

  // 低太阳高度增强 halo（可把 haloStrength 设 0 关闭）
  float haloAuto = uHaloStrength * mix(2.0, 1.0, smoothstep(0.0, 0.2, sunAlt));
  float halo= exp(-pow(th/(r*uHaloFalloff),2.0)) * haloAuto;

  // 太阳盘可见性（独立于 sunGate）
  float sunVisible = smoothstep(-0.02, 0.0, dot(uSunDir, up));
  vec3  T_view = sampleTransmittance(ro, rd);
  vec3  sunCol = vec3(1.0,0.995,0.98);
  L += T_view * sunCol * uSunIntensity * (disk + halo) * sunVisible;

  // ---------- tone map ----------
  vec3 color = ACESFilm(L * uExposure);
  gl_FragColor = vec4(color,1.0);
}

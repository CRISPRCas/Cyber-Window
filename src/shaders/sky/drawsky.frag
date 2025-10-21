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
uniform int   uSteps;
uniform vec2  uResolution;

// Sun (disk)
uniform float uSunAngularRadius;
uniform float uSunIntensity;
uniform float uHaloStrength;
uniform float uHaloFalloff;

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

void main(){
  vec3 ro = vec3(0.0, Rg + 2.0, 0.0);
  vec3 rd = getViewDir(vUv);
  vec3 up = normalize(ro);

  // ---- 暮光门控：太阳高度 < -5° 时抑制天空散射（软过渡 ±0.75°） ----
  float sunAlt = asin(clamp(dot(uSunDir, up), -1.0, 1.0));   // 弧度
  const float minAltRad = radians(-1.0);   // ≈ 20 分钟
  const float softRad   = radians(0.75);
  float sunGate = smoothstep(minAltRad - softRad, minAltRad + softRad, sunAlt);

  float t0,t1;
  if(!raySphere(ro, rd, Rt, t0, t1)){ gl_FragColor = vec4(0.0); return; }
  if(t0<0.0) t0=0.0;

  // ---------- 地面 ----------
  float tg0,tg1;
  if(raySphere(ro, rd, Rg, tg0, tg1) && tg0>0.0){
    vec3 pg = ro + rd*tg0;
    vec3 ng = normalize(pg);
    float NoL = max(dot(ng, uSunDir), 0.0);

    vec3 T_sun_g = sampleTransmittanceToSun(pg + ng*1.0);

    vec3 dirGC = normalize(ro - pg);
    float seg = distance(ro, pg);
    int N = 16; float dts = seg/float(N);
    vec3 T_gc = vec3(1.0);
    for(int i=0;i<N;++i){
      vec3 ps = pg + dirGC*(dts*(float(i)+0.5));
      float h  = length(ps);
      float rhoR = densityR(h)*uRayleighScale;
      float rhoM = densityM(h)*uMieScale;
      vec3 sigma_t = betaR*rhoR + betaM*rhoM;
      T_gc *= exp(-sigma_t * dts);
    }

    vec3 sunCol = vec3(1.0,0.995,0.98);
    vec3 Eg     = sunGate * sunCol * T_sun_g * NoL; // 门控
    vec3 Lg     = (uGroundAlbedo/PI) * Eg * T_gc;
    vec3 color = ACESFilm(Lg * uExposure);
    gl_FragColor = vec4(color,1.0);
    return;
  }

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
    t += dt;
  }

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

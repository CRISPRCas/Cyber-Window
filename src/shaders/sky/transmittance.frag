precision highp float;
varying vec2 vUv;
uniform float uRayleighScale;
uniform float uMieScale;

const float Rg = 6360000.0;
const float Rt = 6420000.0;
const float HR = 8000.0;
const float HM = 1200.0;
const vec3 betaR = vec3(5.8e-6, 13.5e-6, 33.1e-6);
const vec3 betaM = vec3(21.0e-6);

void uvToRMu(in vec2 uv, out float r, out float mu) {
  r = mix(Rg + 1.0, Rt - 1.0, uv.x);
  mu = mix(-1.0, 1.0, uv.y);
}

bool raySphere(in vec3 ro, in vec3 rd, float radius, out float t0, out float t1) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - radius*radius;
  float disc = b*b - c;
  if (disc < 0.0) return false;
  float s = sqrt(disc);
  t0 = -b - s; t1 = -b + s;
  return true;
}

float densityR(float h) { return exp(-(h - Rg) / HR); }
float densityM(float h) { return exp(-(h - Rg) / HM); }

void main() {
  float r, mu; uvToRMu(vUv, r, mu);
  vec3 ro = vec3(0.0, r, 0.0);
  vec3 up = normalize(ro);
  vec3 east = normalize(cross(vec3(0,0,1), up));
  if (length(east) < 0.1) east = normalize(cross(vec3(1,0,0), up));
  vec3 north = normalize(cross(up, east));
  vec3 rd = normalize(mu * up + sqrt(max(0.0, 1.0 - mu*mu)) * north);

  float t0,t1;
  if (!raySphere(ro, rd, Rt, t0, t1)) { gl_FragColor = vec4(1.0); return; }
  if (t0 < 0.0) t0 = 0.0;

  const int STEPS = 64;
  float t = t0;
  float dt = (t1 - t0) / float(STEPS);
  vec3 optical = vec3(0.0);
  for (int i=0; i<STEPS; ++i) {
    vec3 p = ro + rd * (t + 0.5*dt);
    float h = length(p);
    float rhoR = densityR(h) * uRayleighScale;
    float rhoM = densityM(h) * uMieScale;
    optical += (betaR * rhoR + betaM * rhoM) * dt;
    t += dt;
  }
  vec3 T = exp(-optical);
  gl_FragColor = vec4(T, 1.0);
}
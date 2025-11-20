# Cyber Window - Bruneton Sky

Physical sky/sun rendering with volumetric clouds, built on Three.js and Vite. Ships with a GitHub Actions workflow that deploys to GitHub Pages.

## License
MIT License — see `LICENSE`.

## Key formulas and approximations

- **Atmospheric transmittance (Beer–Lambert):**
  $$
  T(s) = \exp\left(-\int_0^s \sigma_t(u) \, \mathrm{d}u\right)
  $$
  Implemented in the transmittance LUT (`TransmittancePass`) as a discrete integral over Rayleigh and Mie extinction along the view ray.

- **Single scattering radiance:**
  $$
  L = \int_0^s T(0\!\to\!x)\, \sigma_s(x)\, \Phi(\theta)\, T(x\!\to\!sun)\, L_\text{sun}\ \mathrm{d}x
  $$
  Evaluated in `drawsky.frag` with a small number of ray-march steps; `uSteps` controls the sample count.

- **Henyey–Greenstein phase (clouds):**
  $$
  \Phi(\theta) = \frac{1}{4\pi}\,\frac{1-g^2}{(1 + g^2 - 2g\cos\theta)^{3/2}}
  $$
  Controlled by `cloud.phaseG`.

- **Sun direction (solar position approximation):**
  Uses a simplified SPA-like calculation in `data/solar.ts` from latitude, longitude, date, and UTC offset to produce a unit vector `uSunDir`.

- **Perlin/FBM noise for clouds:**
  Cloud density uses fractal Brownian motion over the Perlin tile (`src/assets/perlin256.png`) to drive coverage, height falloff, and temporal wind offset (`cloud.windX/Z`).


## Directory tree (key files)
```
Cyber-Window/
├─ README.md
├─ index.html
├─ package.json
├─ vite.config.ts
├─ src/
│  ├─ main.ts
│  ├─ assets/
│  │  └─ perlin256.png
│  ├─ core/
│  │  ├─ App.ts
│  │  ├─ PerfTuner.ts
│  │  └─ RealTimeService.ts
│  ├─ data/
│  │  └─ solar.ts
│  ├─ sky/
│  │  ├─ TransmittancePass.ts
│  │  └─ DrawSkyPass.ts
│  ├─ shaders/
│  │  └─ sky/
│  ├─ ui/
│  │  └─ Params.ts
│  └─ types/
│     └─ shaders.d.ts
├─ .github/workflows/deploy.yml
└─ dist/… (build output)
```


## Architecture
- Runtime entry: `src/main.ts` instantiates `core/App`.
- Scene graph and loop: `core/App.ts` creates the WebGL renderer, camera, OrbitControls, GUI, and links params to shader uniforms. It ticks per-frame via `app.frame(dt)` from `main.ts`.
- Rendering pipeline:
  - `sky/TransmittancePass.ts` builds a 2D Bruneton-style transmittance LUT.
  - `sky/DrawSkyPass.ts` renders full-screen sky + sun + ground reflection + volumetric clouds using GLSL (`shaders/sky/drawsky.frag`) and the LUT texture.
  - `PerfTuner` adapts quality (pixel ratio, march steps) to stay near target FPS.
- Parameter model & UI: `ui/Params.ts` defines all tweakable settings; `lil-gui` folders are wired in `App` with property accessors that drive shader uniforms in real time.
- Real-time data: `core/RealTimeService.ts` (opt-in) pulls geolocation and weather (Open-Meteo) to set sun, clouds, and wind each minute.
- Assets: `src/assets/perlin256.png` is baked in the build and used for cloud noise.

## Call flow
1) `main.ts` creates `App` and starts a requestAnimationFrame loop. Each frame calls `app.frame(dt)`.
2) `App.frame` updates controls, computes sun direction (`data/solar.ts`), runs the transmittance prepass when needed, updates uniforms, and renders `DrawSkyPass`.
3) `PerfTuner.update` adjusts pixel ratio and step counts based on recent FPS.
4) GUI edits mutate `Params`; property setters propagate directly into shader uniforms in `DrawSkyPass`.


## Render flow (GitHub Pages to runtime)
```
User browser
  |
  v
GitHub Pages (serves dist/)
  |
  +--> dist/index.html
          |
          +--> loads /assets/index-*.js (Vite bundle)
                  |
                  +--> src/main.ts
                          |
                          +--> const app = new App(#app)
                          |       |
                          |       +--> App constructor:
                          |       |       - create WebGLRenderer, camera, OrbitControls
                          |       |       - create GUI hooks (Params <-> uniforms)
                          |       |       - trans = new TransmittancePass(...)
                          |       |       - trans.render() // build LUT
                          |       |       - drawSky = new DrawSkyPass(..., trans.texture, params)
                          |       |       - new PerfTuner(...)
                          |       |       - new RealTimeService(params) optional
                          |       |
                          +--> RAF loop:
                                  - compute dt
                                  - app.frame(dt)
                                      |
                                      +--> controls.update()
                                      +--> computeSunDirection(...) // data/solar.ts
                                      +--> drawSky.setSunDir(), set uniforms
                                      +--> perfTuner.update(dt) // pixel ratio, steps
                                      +--> renderer.render(fullscreen quad via DrawSkyPass)
                                      +--> (if realtime.enabled) RealTimeService tick:
                                              geolocation -> params.place/time
                                              weather -> cloud coverage, wind
                                              params -> uniforms
```


## Local setup and dev
```bash
npm install          # first time
npm run dev          # starts Vite dev server (hot reload)
```
Open the printed local URL; controls appear via lil-gui and the HUD buttons in `index.html`.

## Build (local)
```bash
npm run build        # outputs to dist/
npm run preview      # serve the production build locally
```

## Deploy to GitHub Pages (gh-pages)
This repo already includes a workflow at `.github/workflows/deploy.yml`.
- Vite base path is set to `/Cyber-Window/` in `vite.config.ts` so assets load correctly on Pages.
- The workflow builds on pushes to `main` (or manual dispatch) and publishes to the `gh-pages` environment via `actions/deploy-pages`.

To deploy:
1) Push to `main`.
2) GitHub Actions runs `Deploy to GitHub Pages`, uploads `dist`, and publishes.
3) The site is served at `https://<username>.github.io/Cyber-Window/` after the deploy job finishes.

Custom domain (optional):
1) Point your DNS CNAME to `<username>.github.io`.
2) In GitHub → Settings → Pages, set the custom domain (this writes `CNAME` for you).
3) If serving from the domain root, change `base` in `vite.config.ts` to `'/'`, then push to rebuild.



## Control panel reference
| Parameter | Meaning | Range (UI) | Default |
| --- | --- | --- | --- |
| atmosphere.rayleighScale | Rayleigh scattering strength | 0.1–5.0 | 1.6 |
| atmosphere.mieScale | Mie scattering strength | 0.1–5.0 | 3.2 |
| atmosphere.groundAlbedo | Ground reflectance | 0–1 | 0.08 |
| place.latitude | Observer latitude (deg) | -66–66 | 22.33812 |
| place.longitude | Observer longitude (deg) | -180–180 | 114.26439 |
| time.year | Year | 2000–2035 | 2025 |
| time.month | Month | 1–12 | 10 |
| time.day | Day | 1–31 | 20 |
| time.hour | Hour (24h) | 0–23 | 17 |
| time.minute | Minute | 0–59 | 40 |
| time.utcOffset | UTC offset (h) | -12–14 | 8 |
| render.singleScatteringSteps | Sky march steps | 8–64 | 20 |
| sun.angularDiameterDeg | Apparent sun diameter | 0.3–0.7 | 0.53 |
| sun.intensity | Direct sun intensity | 0–100 | 24 |
| sun.haloStrength | Halo glow strength | 0–2 | 1.0 |
| sun.haloFalloff | Halo falloff | 0.5–8 | 5 |
| sky2.multiScatterBoost | Approx multi-scatter boost | 0–1 | 0.0 |
| sky2.aerialStrength | Aerial haze strength | 0–1 | 0.20 |
| sky2.aerialDistance | Haze distance (m) | 20000–200000 | 150000 |
| sky2.skySunIntensity | Sky lighting sun intensity | 0–60 | 20.0 |
| sky2.exposure | Tone-mapping exposure | 0.1–2.0 | 0.9 |
| ground.mirrorRoughness | Ground mirror blur | 0–0.2 | 0.05 |
| ground.mirrorNoiseScale | Noise scale for blur | 0.5–8 | 2.0 |
| ground.rippleAmplitude | Ripple height | 0–0.2 | 0.10 |
| ground.rippleFrequency | Ripple frequency | 0.2–8 | 4.0 |
| ground.rippleSpeed | Ripple animation speed | 0–6 | 3.0 |
| cloud.enabled | Toggle volumetric clouds | bool | true |
| cloud.coverage | Cloud cover fraction | 0–1 | 0.36 |
| cloud.height | Cloud base height (m) | 200–4000 | 640 |
| cloud.thickness | Cloud layer thickness (m) | 200–4000 | 1100 |
| cloud.sigmaT | Extinction coefficient | 0.1–2.0 | 0.2 |
| cloud.phaseG | Anisotropy g | 0–0.9 | 0.6 |
| cloud.steps | Ray-march steps | 8–128 | 96 |
| cloud.maxDistance | Max march distance (m) | 500–20000 | 2000 |
| cloud.fadeStart | Fade start distance (m) | 0–20000 | 2000 |
| cloud.fadeEnd | Fade end distance (m) | 0–20000 | 8000 |
| cloud.windX | Wind X (shader units) | -160–160 | 40 |
| cloud.windZ | Wind Z (shader units) | -160–160 | 40 |
| cloud.ambientK | Ambient light multiplier | 0–0.5 | 0.03 |
| cloud.opacity | Cloud opacity multiplier | 0–2 | 1.8 |
| realtime.enabled | Auto geolocation + weather | bool | false |
| realtime.status | Status text (read-only) | — | manual |
| realtime.lastUpdate | Last fetch time (read-only) | — | — |

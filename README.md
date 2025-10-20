# Cyber Window - Bruneton Sky (Template)

Implements **Level 0 + Sun-1 + UX-0 (partial Level 1)**:
- Bruneton-style **Transmittance LUT**
- **Single-scattering** sky (no multi-scattering yet)
- **SPA-like** solar position
- Minimal GUI

## Run
```bash
npm install
npm run dev
```

## Files
- `src/core/App.ts` — main app
- `src/sky/TransmittancePass.ts` — 2D transmittance LUT
- `src/sky/DrawSkyPass.ts` — single-scattering sky
- `src/data/solar.ts` — solar position
- `src/ui/Params.ts` — GUI params
- `shaders/sky/*.frag` — GLSL shaders

## Next
- MultipleScattering & Aerial LUTs
- Clouds & TAA
- Spectral
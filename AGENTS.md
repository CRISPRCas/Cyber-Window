# Repository Guidelines

## Project Structure & Module Organization
- Runtime entry: `src/main.ts` mounts the canvas, starts the frame loop, and wires UI buttons in `index.html`.
- Rendering pipeline: `src/core/App.ts` orchestrates controls, `TransmittancePass`, `DrawSkyPass`, and `PerfTuner`; reusable passes live in `src/sky/`.
- Parameter model and GUI bindings live in `src/ui/Params.ts`; solar math is in `src/data/solar.ts`.
- Assets and shader glue: textures in `src/assets/`, GLSL under `src/shaders/`, and shader typings in `src/types/shaders.d.ts`.
- Build output is emitted to `dist/`.

## Build, Test, and Development Commands
- `npm install` (Node ≥20.19) — install dependencies.
- `npm run dev` — start the Vite dev server with hot reload on http://localhost:5173.
- `npm run build` — produce a production bundle in `dist/` (used by the Pages workflow).
- `npm run preview` — serve the built bundle locally; use before publishing.

## Coding Style & Naming Conventions
- Language: TypeScript with ES modules; keep imports relative within `src/`.
- Indentation: 2 spaces; prefer trailing semicolons and follow surrounding quote style.
- Classes and passes use `PascalCase`; variables, methods, and uniforms use `camelCase`.
- Keep uniform/UI names aligned with `Params` keys so GUI binding stays stable.
- Real-time work stays inside `RealTimeService`; avoid fetches inside passes.

## Testing & QA
- No automated tests. Validate with `npm run dev`, interact with lil-gui controls, and watch FPS/readouts. Before publishing, run `npm run preview` and scan the console for warnings.
- When changing shaders or math, add short inline notes on constants or units to aid reviews.

## Commit & Pull Request Guidelines
- Match history style: short, imperative subjects (e.g., “Fix cloud cover index”, “Improve cover mapping”).
- Ensure `npm run build` passes. Summarize visual impacts, include screenshots or short clips for render/UI tweaks, and link issue IDs.
- Flag API or base-path changes that affect GitHub Pages deploys (`.github/workflows/deploy.yml`, `vite.config.ts`).

## Security & Configuration Tips
- Real-time mode requests geolocation and Open-Meteo; keep network calls in `RealTimeService` and surface status text for failures.
- Avoid committing secrets; none are expected. For new endpoints, keep them opt-in and document flags in `Params`.

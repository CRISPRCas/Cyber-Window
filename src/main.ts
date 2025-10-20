import { App } from './core/App';

const app = new App(document.getElementById('app')!);

const fpsEl = document.getElementById('fps')!;
let last = performance.now(), frames = 0, acc = 0;
function loop() {
  const now = performance.now();
  const dt = (now - last) / 1000;
  last = now;
  app.frame(dt);

  frames++; acc += dt;
  if (acc >= 1.0) {
    fpsEl.textContent = `${frames} fps`;
    frames = 0; acc = 0;
  }
  requestAnimationFrame(loop);
}
loop();
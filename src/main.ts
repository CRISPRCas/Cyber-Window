import { App } from './core/App';

const app = new App(document.getElementById('app')!);

const snapBtn = document.getElementById('snap-sun');
if (snapBtn) snapBtn.addEventListener('click', () => app.snapToSun());

const immersiveBtn = document.getElementById('immersive-toggle');
const immersiveHint = document.getElementById('immersive-hint');
let immersive = false;
let hintTimer: number | null = null;

const setImmersive = (on: boolean, opts: { fromFullscreenChange?: boolean } = {}) => {
  if (hintTimer !== null) {
    window.clearTimeout(hintTimer);
    hintTimer = null;
  }

  immersive = on;
  if (immersive) {
    document.body.classList.add('immersive');
    if (immersiveBtn) immersiveBtn.textContent = 'Exit Immersive';
    // Try to enter fullscreen for full overlay. Ignore failures (e.g., if denied).
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  } else {
    document.body.classList.remove('immersive');
    if (immersiveBtn) immersiveBtn.textContent = 'Enter Immersive';
    if (!opts.fromFullscreenChange && document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  }
  if (immersiveBtn) immersiveBtn.setAttribute('aria-hidden', immersive ? 'true' : 'false');
  if (immersiveHint) {
    immersiveHint.style.display = immersive ? '' : 'none';
    immersiveHint.setAttribute('aria-hidden', immersive ? 'false' : 'true');
    if (immersive) {
      // Auto-hide the hint after a moment to keep the view clean (still exit with Esc).
      hintTimer = window.setTimeout(() => {
        immersiveHint.style.display = 'none';
        immersiveHint.setAttribute('aria-hidden', 'true');
      }, 3500);
    }
  }
};

if (immersiveBtn) {
  immersiveBtn.addEventListener('click', () => setImmersive(!immersive));
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && immersive) {
    setImmersive(false);
  }
});

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && immersive) {
    setImmersive(false, { fromFullscreenChange: true });
  }
});

const fpsEl = document.getElementById('fps')!;
let last = performance.now(), frames = 0, acc = 0;
let snappedToSun = false;
function loop() {
  const now = performance.now();
  const dt = (now - last) / 1000;
  last = now;
  app.frame(dt);

  if (!snappedToSun) {
    app.snapToSun();
    snappedToSun = true;
  }

  frames++; acc += dt;
  if (acc >= 1.0) {
    fpsEl.textContent = `${frames} fps`;
    frames = 0; acc = 0;
  }
  requestAnimationFrame(loop);
}
loop();

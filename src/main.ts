import { App } from './core/App';
import { PresentationFlow } from './core/PresentationFlow';

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

const noticeEl = document.getElementById('param-notice');
let noticeTimer: number | null = null;
const showNotice = (msg: string) => {
  if (!noticeEl) return;
  noticeEl.textContent = msg;
  noticeEl.classList.add('show');
  if (noticeTimer !== null) window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => {
    noticeEl?.classList.remove('show');
  }, 1700);
};
app.setParamNoticeHandler(showNotice);

const subtitle1 = document.getElementById('subtitle-1');
const subtitle2 = document.getElementById('subtitle-2');
const subtitleBox = document.getElementById('subtitles');
const fadeEl = document.getElementById('fade-overlay');
const setSubtitle = (line1: string, line2: string) => {
  if (subtitle1) subtitle1.textContent = line1;
  if (subtitle2) subtitle2.textContent = line2;
  if (subtitleBox) subtitleBox.classList.add('show');
};
const setFade = (opacity: number) => {
  if (!fadeEl) return;
  fadeEl.style.opacity = `${opacity}`;
  fadeEl.style.pointerEvents = opacity > 0.01 ? 'auto' : 'none';
};

const flow = new PresentationFlow(app, {
  setSubtitle,
  setFade,
  setNotice: showNotice,
  setImmersive
});
const demoBtn = document.getElementById('run-demo');
if (demoBtn) demoBtn.addEventListener('click', () => flow.start());

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
  flow.update(dt);
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

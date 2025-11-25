import * as THREE from 'three';
import { App } from './App';

type SubtitleSetter = (line1: string, line2: string) => void;
type FadeSetter = (opacity: number) => void;
type NoticeSetter = (msg: string) => void;

type Step = {
  duration: number;
  subtitle: { line1: string; line2: string };
  onStart?: () => void;
  onUpdate?: (t: number, dt: number) => void;
  onComplete?: () => void;
};

type CameraPose = { theta: number; phi: number; radius: number };

const easeInOut = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const twoPhase = (t: number) => (t < 0.5 ? t / 0.5 : 1 - (t - 0.5) / 0.5);

export class PresentationFlow {
  private app: App;
  private setSubtitle: SubtitleSetter;
  private setFade: FadeSetter;
  private setNotice: NoticeSetter;
  private setImmersive: (on: boolean) => void;

  private steps: Step[] = [];
  private active = false;
  private stepIndex = 0;
  private stepTime = 0;
  private elapsed = 0;

  private camStart: CameraPose | null = null;
  private camTarget: CameraPose | null = null;
  private camEase = easeInOut;
  private timeLerpStart = 0;
  private timeLerpEnd = 0;

  constructor(app: App, opts: { setSubtitle: SubtitleSetter; setFade: FadeSetter; setNotice: NoticeSetter; setImmersive: (on: boolean) => void; }) {
    this.app = app;
    this.setSubtitle = opts.setSubtitle;
    this.setFade = opts.setFade;
    this.setNotice = opts.setNotice;
    this.setImmersive = opts.setImmersive;
    this.steps = this.buildSteps();
  }

  start() {
    this.steps = this.buildSteps();
    this.elapsed = 0;
    this.stepIndex = 0;
    this.stepTime = 0;
    this.active = true;
    this.setSubtitle(this.steps[0].subtitle.line1, this.steps[0].subtitle.line2);
    this.steps[0].onStart?.();
  }

  update(dt: number) {
    if (!this.active) return;
    const step = this.steps[this.stepIndex];
    this.stepTime += dt;
    this.elapsed += dt;
    const t = Math.min(1, this.stepTime / step.duration);
    step.onUpdate?.(t, dt);
    if (this.stepTime >= step.duration) {
      step.onComplete?.();
      this.stepIndex++;
      if (this.stepIndex >= this.steps.length) {
        this.active = false;
        return;
      }
      this.stepTime = 0;
      const next = this.steps[this.stepIndex];
      this.setSubtitle(next.subtitle.line1, next.subtitle.line2);
      next.onStart?.();
    }
  }

  private buildSteps(): Step[] {
    const toMin = (timeStr: string) => {
      const [h, m] = timeStr.split(':').map(v => parseInt(v, 10));
      return h * 60 + m;
    };
    const setTimeRange = (from: string, to: string, t: number) => {
      const m = lerp(toMin(from), toMin(to), easeInOut(t));
      this.app.setTimeMinutes(m);
    };
    const followSun = (radius: number, blend: number) => {
      const sunDir = this.app.getSunDirection();
      if (sunDir.lengthSq() < 1e-6) return;
      const pose = this.poseFromDirection(sunDir, radius);
      this.blendCamera(pose, blend);
    };

    const steps: Step[] = [
      {
        duration: 10,
        subtitle: { line1: 'Initialization', line2: 'Adjusting target FPS: 20 → 60' },
        onStart: () => {
          this.app.setRealtimeEnabled(false);
          this.setFade(0);
          this.app.setParamValue('render.targetFPS', 20, { fireOnChange: true, flash: true, label: 'targetFPS: 20 → 60' });
        },
        onUpdate: t => {
          const eased = easeInOut(t);
          this.app.setParamValue('render.targetFPS', lerp(20, 60, eased), { fireOnChange: true });
        }
      },
      {
        duration: 10,
        subtitle: { line1: 'Diurnal Cycle: Sunrise', line2: 'Time: 06:20 → 07:20' },
        onStart: () => {
          this.app.notifyParam('time.hour', 'Time 06:20 → 07:20');
          this.app.setTimeMinutes(toMin('06:20'));
        },
        onUpdate: t => {
          setTimeRange('06:20', '07:20', t);
          followSun(3.6, 0.35);
        }
      },
      {
        duration: 10,
        subtitle: { line1: 'Procedural Surface', line2: 'Time: 07:20 → 10:00' },
        onStart: () => {
          this.camStart = this.app.getCameraSpherical();
          const upPhi = THREE.MathUtils.degToRad(55);
          this.camTarget = { ...this.camStart!, phi: upPhi, radius: this.camStart!.radius };
          this.camEase = easeInOut;
        },
        onUpdate: t => {
          setTimeRange('07:20', '10:00', t);
          this.updateCameraLerp(easeInOut(t));
        }
      },
      {
        duration: 10,
        subtitle: { line1: 'Atmosphere Density', line2: 'Rayleigh: 1.6 → 4.0 → 1.6' },
        onStart: () => {
          this.app.notifyParam('atmosphere.rayleighScale', 'Rayleigh 1.6 → 4.0 → 1.6');
          this.app.setTimeMinutes(toMin('12:00'));
          const pose = this.app.getCameraSpherical();
          this.camStart = pose;
          const downPhi = THREE.MathUtils.degToRad(120);
          this.camTarget = { ...pose, phi: downPhi, radius: pose.radius };
          this.camEase = easeInOut;
        },
        onUpdate: t => {
          this.app.setTimeMinutes(toMin('12:00'));
          this.updateCameraLerp(easeInOut(t));
          const wave = easeInOut(twoPhase(t));
          const val = lerp(1.6, 4.0, wave);
          this.app.setParamValue('atmosphere.rayleighScale', val, { fireOnChange: false });
        }
      },
      {
        duration: 10,
        subtitle: { line1: 'Sunset: Real-Time Solver', line2: 'Time: 12:00 → 17:45' },
        onStart: () => {
          this.app.notifyParam('time.hour', 'Time 12:00 → 17:45');
        },
        onUpdate: t => {
          setTimeRange('12:00', '17:45', t);
          followSun(3.4, 0.5);
        }
      },
      {
        duration: 10,
        subtitle: { line1: 'Cloud Erosion', line2: 'Coverage: 36% → 50% → 36%' },
        onStart: () => {
          this.app.notifyParam('cloud.coverage', 'Coverage 0.36 → 0.50 → 0.36');
        },
        onUpdate: t => {
          const wave = easeInOut(twoPhase(t));
          const coverage = lerp(0.36, 0.5, wave);
          this.app.setParamValue('cloud.coverage', coverage, { fireOnChange: false });
        }
      },
      {
        duration: 10,
        subtitle: { line1: 'Volumetric 3D Parallax', line2: 'Height: 640m → 2500m → 640m' },
        onStart: () => {
          this.camStart = this.app.getCameraSpherical();
          this.camTarget = {
            theta: this.camStart.theta - Math.PI * 0.25,
            phi: THREE.MathUtils.degToRad(95),
            radius: this.camStart.radius * 1.05
          };
          this.app.notifyParam('cloud.height', 'Height 640 → 2500 → 640');
          this.camEase = easeInOut;
        },
        onUpdate: t => {
          const wave = easeInOut(twoPhase(t));
          const height = lerp(640, 2500, wave);
          this.app.setParamValue('cloud.height', height, { fireOnChange: false });
          this.updateCameraLerp(easeInOut(t));
        }
      },
      {
        duration: 10,
        subtitle: { line1: 'Atmospheric Haze', line2: 'Mie Scale: 3.2 → 5.0 → 3.2' },
        onStart: () => {
          this.app.notifyParam('atmosphere.mieScale', 'Mie 3.2 → 5.0 → 3.2');
        },
        onUpdate: t => {
          const wave = easeInOut(twoPhase(t));
          const mie = lerp(3.2, 5.0, wave);
          this.app.setParamValue('atmosphere.mieScale', mie, { fireOnChange: false });
          followSun(3.0, 0.4);
        }
      },
      {
        duration: 10,
        subtitle: { line1: 'API Synchronization', line2: 'Status: Connecting...' },
        onStart: () => {
          this.app.setRealtimeEnabled(true, { flash: true, label: 'Real-time: on (sync)' });
        },
        onUpdate: () => {
          this.setNotice('Syncing with live API…');
        }
      },
      {
        duration: 10,
        subtitle: { line1: 'System Reset', line2: 'Resetting State...' },
        onStart: () => {
          this.app.setRealtimeEnabled(false, { flash: true, label: 'Real-time: off' });
          const startMinutes = this.readTimeMinutes();
          const targetMinutes = toMin('17:30');
          this.camStart = this.app.getCameraSpherical();
          this.camTarget = { theta: 0, phi: THREE.MathUtils.degToRad(105), radius: 3.0 };
          this.camEase = easeInOut;
          this.app.setParamValue('time.hour', this.app.getParams().time.hour, { fireOnChange: false });
          this.timeLerpStart = startMinutes;
          this.timeLerpEnd = targetMinutes;
          this.app.notifyParam('time.hour', 'Reset time → 17:30');
          this.app.setParamValue('cloud.coverage', 0.36, { fireOnChange: false, flash: true, label: 'Coverage reset' });
          this.app.setParamValue('cloud.windX', 40, { fireOnChange: false, flash: true, label: 'Wind reset' });
        },
        onUpdate: t => {
          const eased = easeInOut(t);
          this.app.setTimeMinutes(lerp(this.timeLerpStart, this.timeLerpEnd, eased));
          this.updateCameraLerp(eased);
        }
      },
      {
        duration: 5,
        subtitle: { line1: 'Immersive Mode', line2: 'UI: Hidden' },
        onStart: () => {
          this.camStart = this.app.getCameraSpherical();
          this.camTarget = { ...this.camStart, radius: Math.max(1.8, this.camStart.radius * 0.7) };
          this.camEase = easeInOut;
          this.setImmersive(true);
          this.setNotice('Immersive view enabled');
        },
        onUpdate: t => {
          this.updateCameraLerp(easeInOut(t));
        }
      },
      {
        duration: 5,
        subtitle: { line1: 'Cyber Window', line2: 'Project by Yangfan WU — Group 22' },
        onStart: () => {
          this.setImmersive(true);
          this.app.snapToSun();
        }
      }
    ];

    return steps;
  }

  private readTimeMinutes() {
    const t = this.app.getParams().time;
    return t.hour * 60 + t.minute;
  }

  private updateCameraLerp(t: number) {
    if (!this.camStart || !this.camTarget) return;
    const eased = this.camEase ? this.camEase(t) : t;
    const theta = this.lerpAngle(this.camStart.theta, this.camTarget.theta, eased);
    const phi = lerp(this.camStart.phi, this.camTarget.phi, eased);
    const radius = lerp(this.camStart.radius, this.camTarget.radius, eased);
    this.app.setCameraSpherical(theta, phi, radius);
  }

  private blendCamera(target: CameraPose, blend: number) {
    const current = this.app.getCameraSpherical();
    const theta = this.lerpAngle(current.theta, target.theta, blend);
    const phi = lerp(current.phi, target.phi, blend);
    const radius = lerp(current.radius, target.radius, blend);
    this.app.setCameraSpherical(theta, phi, radius);
  }

  private poseFromDirection(dir: THREE.Vector3, radius: number): CameraPose {
    const offset = dir.clone().normalize().multiplyScalar(-radius);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    return { theta: spherical.theta, phi: spherical.phi, radius };
  }

  private lerpAngle(a: number, b: number, t: number) {
    const delta = THREE.MathUtils.euclideanModulo(b - a + Math.PI, Math.PI * 2) - Math.PI;
    return a + delta * t;
  }
}

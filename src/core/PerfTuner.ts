import * as THREE from 'three';
import { Params } from '../ui/Params';
import { DrawSkyPass } from '../sky/DrawSkyPass';

type PerfTunerOptions = {
  renderer: THREE.WebGLRenderer;
  drawSky: DrawSkyPass;
  params: Params;
  container: HTMLElement;
};

/**
 * Simple adaptive quality controller.
 * Tries to keep frame time reasonable by lowering pixel ratio / march steps
 * when FPS drops, and restoring quality slowly when FPS is healthy.
 */
export class PerfTuner {
  private renderer: THREE.WebGLRenderer;
  private drawSky: DrawSkyPass;
  private params: Params;
  private container: HTMLElement;

  private readonly minPixelRatio = 0.65;
  private readonly maxPixelRatio: number;
  private readonly minCloudSteps = 24;
  private readonly minSkySteps = 12;
  private readonly baseCloudSteps: number;
  private readonly baseSkySteps: number;

  private frameCounter = 0;
  private timeAcc = 0;
  private cooldown = 0;

  constructor(opts: PerfTunerOptions) {
    this.renderer = opts.renderer;
    this.drawSky = opts.drawSky;
    this.params = opts.params;
    this.container = opts.container;
    this.baseCloudSteps = opts.params.cloud.steps;
    this.baseSkySteps = opts.params.render.singleScatteringSteps;
    this.maxPixelRatio = opts.renderer.getPixelRatio();
  }

  update(dt: number) {
    this.frameCounter++;
    this.timeAcc += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);

    if (this.timeAcc < 0.4) return;

    const fps = this.frameCounter / this.timeAcc;
    this.frameCounter = 0;
    this.timeAcc = 0;
    if (this.cooldown > 0) return;

    const targetFPS = this.getTargetFPS();
    const lowThresh = targetFPS * 0.75;
    const highThresh = targetFPS * 1.15;

    if (fps < lowThresh) {
      if (this.dropQuality()) this.cooldown = 1.2;
    } else if (fps > highThresh) {
      if (this.restoreQuality()) this.cooldown = 1.5;
    }
  }

  private dropQuality(): boolean {
    if (this.reducePixelRatio()) return true;

    if (this.params.cloud.enabled && this.params.cloud.steps > this.minCloudSteps) {
      this.params.cloud.steps = Math.max(this.minCloudSteps, this.params.cloud.steps - 8);
      return true;
    }

    if (this.params.render.singleScatteringSteps > this.minSkySteps) {
      this.params.render.singleScatteringSteps = Math.max(this.minSkySteps, this.params.render.singleScatteringSteps - 2);
      return true;
    }

    return false;
  }

  private restoreQuality(): boolean {
    if (this.params.render.singleScatteringSteps < this.baseSkySteps) {
      this.params.render.singleScatteringSteps = Math.min(this.baseSkySteps, this.params.render.singleScatteringSteps + 2);
      return true;
    }

    if (this.params.cloud.steps < this.baseCloudSteps && this.params.cloud.enabled) {
      this.params.cloud.steps = Math.min(this.baseCloudSteps, this.params.cloud.steps + 8);
      return true;
    }

    return this.increasePixelRatio();
  }

  private reducePixelRatio(): boolean {
    const current = this.renderer.getPixelRatio();
    if (current <= this.minPixelRatio + 1e-3) return false;
    const next = Math.max(this.minPixelRatio, current - 0.15);
    this.applyPixelRatio(next);
    return true;
  }

  private increasePixelRatio(): boolean {
    const current = this.renderer.getPixelRatio();
    if (current >= this.maxPixelRatio - 1e-3) return false;
    const next = Math.min(this.maxPixelRatio, current + 0.1);
    this.applyPixelRatio(next);
    return true;
  }

  private applyPixelRatio(ratio: number) {
    this.renderer.setPixelRatio(ratio);
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h, false);
    this.drawSky.setSize(w, h);
  }

  private getTargetFPS() {
    return Math.max(1, this.params.render.targetFPS);
  }
}

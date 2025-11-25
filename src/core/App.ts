import * as THREE from 'three';
import { GUI } from 'lil-gui';
import { createParams, Params } from '../ui/Params';
import { computeSunDirection } from '../data/solar';
import { TransmittancePass } from '../sky/TransmittancePass';
import { DrawSkyPass } from '../sky/DrawSkyPass';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PerfTuner } from './PerfTuner';
import { RealTimeService } from './RealTimeService';

export class App {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera;
  private params: Params;
  private gui: GUI;
  private guiBindings = new Map<string, any>();
  private guiFolders: Record<string, any> = {};
  private guiFlashTimers = new Map<string, number>();
  private paramNoticeHandler?: (msg: string) => void;
  private controls: OrbitControls;
  private perf: PerfTuner;
  private realtime: RealTimeService;
  private sunDir = new THREE.Vector3();
  private lutDirty = false;
  private lutTimer = 0;

  private trans: TransmittancePass;
  private drawSky: DrawSkyPass;

  private _cloudTime = 0;

  constructor(container: HTMLElement) {
    const setTooltip = (ctrl: any, text: string) => {
      const el = ctrl?.domElement as HTMLElement | undefined;
      if (!el) return;
      const root = el.closest('.controller') as HTMLElement | null;
      const target = root || el;
      target.setAttribute('title', text);
      const input = target.querySelector('input, select, button, .name') as HTMLElement | null;
      if (input) input.setAttribute('title', text);
    };

    this.container = container;
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000);
    this.camera.position.set(0, 1.8, 3);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enableZoom = false;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.6;
    this.controls.minPolarAngle = 0.05;
    this.controls.maxPolarAngle = Math.PI - 0.05;
    this.controls.target.set(0, 1.8, 0);
    this.controls.update();

    this.params = createParams();
    this.realtime = new RealTimeService(this.params);

    const gui = new GUI();
    this.gui = gui;

    const sky = gui.addFolder('Sky');
    this.guiFolders.sky = sky;
    const rayleighCtrl = sky.add(this.params.atmosphere, 'rayleighScale', 0.1, 5.0, 0.01).name('rayleighScale').onChange(()=>this.refreshLUT());
    this.bindControl('atmosphere.rayleighScale', rayleighCtrl);
    setTooltip(rayleighCtrl, 'Rayleigh scattering scale; higher = bluer/brighter sky.');
    const mieCtrl = sky.add(this.params.atmosphere, 'mieScale', 0.1, 5.0, 0.01).name('mieScale').onChange(()=>this.refreshLUT());
    this.bindControl('atmosphere.mieScale', mieCtrl);
    setTooltip(mieCtrl, 'Mie haze density; increases low-angle glow and overall haze.');
    const albedoCtrl = sky.add(this.params.atmosphere, 'groundAlbedo', 0.0, 1.0, 0.01).name('groundAlbedo');
    setTooltip(albedoCtrl, 'Ground reflectance feeding indirect sky light.');

    const sky2 = gui.addFolder('Sky-2 (fast approx)');
    this.guiFolders.sky2 = sky2;
    setTooltip(
      sky2.add(this.params.sky2, 'multiScatterBoost', 0.0, 1.0, 0.01),
      'Adds extra multi-scatter energy for a brighter dome (artistic).'
    );
    setTooltip(
      sky2.add(this.params.sky2, 'aerialStrength', 0.0, 1.0, 0.01),
      'Strength of near-ground warm fog/aerial perspective.'
    );
    setTooltip(
      sky2.add(this.params.sky2, 'aerialDistance', 20000, 200000, 1000),
      'Distance scale before aerial fog reaches full strength.'
    );
    setTooltip(
      sky2.add(this.params.sky2, 'skySunIntensity', 0.0, 60.0, 0.5),
      'Sun intensity used by the fast sky approximation (halo/ambient).'
    );
    setTooltip(
      sky2.add(this.params.sky2, 'exposure', 0.1, 2.0, 0.01),
      'Overall exposure applied after tone mapping.'
    );

    const sun = gui.addFolder('Sun');
    this.guiFolders.sun = sun;
    setTooltip(
      sun.add(this.params.sun, 'angularDiameterDeg', 0.3, 0.7, 0.01),
      'Apparent size of the sun disk in degrees.'
    );
    setTooltip(
      sun.add(this.params.sun, 'intensity', 0.0, 100.0, 0.1),
      'Brightness of direct sunlight and sky illumination.'
    );
    setTooltip(
      sun.add(this.params.sun, 'haloStrength', 0.0, 2.0, 0.01),
      'Strength of the sun glow/halo around the disk.'
    );
    setTooltip(
      sun.add(this.params.sun, 'haloFalloff', 0.5, 8.0, 0.1),
      'How quickly the halo fades away from the sun.'
    );
    const ground = gui.addFolder('Ground');
    this.guiFolders.ground = ground;
    setTooltip(
      ground.add(this.params.ground, 'mirrorRoughness', 0.0, 0.2, 0.005).name('mirrorBlur'),
      'Amount of blur on the mirror reflection (0 = sharp, higher = blurrier).'
    );
    setTooltip(
      ground.add(this.params.ground, 'mirrorNoiseScale', 0.5, 8.0, 0.1).name('noiseScale'),
      'Texture scale that drives blur jitter; adjust to reduce grain patterns.'
    );
    setTooltip(
      ground.add(this.params.ground, 'rippleAmplitude', 0.0, 0.2, 0.002).name('rippleAmp'),
      'Height/strength of water-like ripples on the ground mirror.'
    );
    setTooltip(
      ground.add(this.params.ground, 'rippleFrequency', 0.2, 8.0, 0.05).name('rippleFreq'),
      'Spatial frequency of ripples; higher = tighter waves.'
    );
    setTooltip(
      ground.add(this.params.ground, 'rippleSpeed', 0.0, 6.0, 0.05).name('rippleSpeed'),
      'How fast ripples animate over time.'
    );

    const place = gui.addFolder('Place');
    this.guiFolders.place = place;
    setTooltip(
      place.add(this.params.place, 'latitude', -66, 66, 0.01).listen(),
      'Latitude (deg) used to compute solar position.'
    );
    setTooltip(
      place.add(this.params.place, 'longitude', -180, 180, 0.01).listen(),
      'Longitude (deg) used to compute solar position.'
    );
    setTooltip(
      place.add(this.params.time, 'utcOffset', -12, 14, 1).name('UTC offset').listen(),
      'Local UTC offset applied to the date/time for sun calculation.'
    );

    const time = gui.addFolder('Time');
    this.guiFolders.time = time;
    setTooltip(time.add(this.params.time, 'year', 2000, 2035, 1).listen(), 'Local year for solar ephemeris.');
    setTooltip(time.add(this.params.time, 'month', 1, 12, 1).listen(), 'Local month for solar ephemeris.');
    setTooltip(time.add(this.params.time, 'day', 1, 31, 1).listen(), 'Local day for solar ephemeris.');
    const hourCtrl = time.add(this.params.time, 'hour', 0, 23, 1).listen();
    const minuteCtrl = time.add(this.params.time, 'minute', 0, 59, 1).listen();
    this.bindControl('time.hour', hourCtrl);
    this.bindControl('time.minute', minuteCtrl);
    setTooltip(hourCtrl, 'Local hour for solar ephemeris.');
    setTooltip(minuteCtrl, 'Local minute for solar ephemeris.');

    const skyStepCtrl = gui.add(this.params.render, 'singleScatteringSteps', 8, 64, 1).name('skySteps');
    this.bindControl('render.singleScatteringSteps', skyStepCtrl);
    setTooltip(
      skyStepCtrl,
      'Primary sky ray-march steps (higher = smoother, slower).'
    );
    const targetFpsCtrl = gui.add(this.params.render, 'targetFPS', 24, 120, 1).name('targetFPS').listen();
    this.bindControl('render.targetFPS', targetFpsCtrl);
    setTooltip(
      targetFpsCtrl,
      'Desired frame rate for the adaptive quality tuner; lower favors visuals, higher favors speed.'
    );

    const realFolder = gui.addFolder('Real-time');
    this.guiFolders.realtime = realFolder;
    const rtToggle = realFolder.add(this.params.realtime, 'enabled').name('Use real-time');
    this.bindControl('realtime.enabled', rtToggle);
    rtToggle.onChange((v: boolean) => {
      if (v) this.realtime.start();
      else this.realtime.stop();
    });
    setTooltip(rtToggle, 'Fetch live time/weather to drive sun and clouds.');
    const statusCtrl = realFolder.add(this.params.realtime, 'status').name('status').listen();
    const updateCtrl = realFolder.add(this.params.realtime, 'lastUpdate').name('lastUpdate').listen();
    setTooltip(statusCtrl, 'Connection status for real-time mode.');
    setTooltip(updateCtrl, 'Timestamp of the last successful update.');
    if ((statusCtrl as any).disable) (statusCtrl as any).disable();
    if ((updateCtrl as any).disable) (updateCtrl as any).disable();

    // Cloud GUI
    const cloud = gui.addFolder('Cloud (volumetric)');
    this.guiFolders.cloud = cloud;
    setTooltip(cloud.add(this.params.cloud, 'enabled').name('enabled'), 'Toggle volumetric clouds on/off.');
    const cloudCoverageCtrl = cloud.add(this.params.cloud, 'coverage', 0.0, 1.0, 0.01).listen();
    this.bindControl('cloud.coverage', cloudCoverageCtrl);
    setTooltip(cloudCoverageCtrl, 'Fraction of sky covered by clouds (0 clear → 1 overcast).');
    const cloudHeightCtrl = cloud.add(this.params.cloud, 'height', 200, 4000, 10);
    this.bindControl('cloud.height', cloudHeightCtrl);
    setTooltip(cloudHeightCtrl, 'Cloud base height above ground (meters).');
    setTooltip(cloud.add(this.params.cloud, 'thickness', 200, 4000, 10), 'Vertical thickness of the cloud layer (meters).');
    setTooltip(cloud.add(this.params.cloud, 'sigmaT', 0.005, 2.0, 0.01), 'Extinction per meter; lower = more transparent, higher = denser.');
    const phaseCtrl = cloud.add(this.params.cloud, 'phaseG', 0.0, 0.9, 0.01);
    this.bindControl('cloud.phaseG', phaseCtrl);
    setTooltip(phaseCtrl, 'Scattering anisotropy; 0 isotropic, higher = more forward scattering.');
    setTooltip(cloud.add(this.params.cloud, 'steps', 8, 256, 1), 'Cloud ray-march steps (quality vs performance).');
    setTooltip(cloud.add(this.params.cloud, 'maxDistance', 500, 20000, 100), 'Maximum cloud march length per view ray (meters).');
    setTooltip(cloud.add(this.params.cloud, 'fadeStart', 0, 20000, 100), 'Distance where clouds start fading out toward horizon.');
    setTooltip(cloud.add(this.params.cloud, 'fadeEnd', 0, 20000, 100), 'Distance where the fade to zero completes.');
    const windXCtrl = cloud.add(this.params.cloud, 'windX', -160, 160, 0.5).listen();
    this.bindControl('cloud.windX', windXCtrl);
    setTooltip(windXCtrl, 'Wind speed along +X (m/s) advecting the noise.');
    setTooltip(cloud.add(this.params.cloud, 'windZ', -160, 160, 0.5).listen(), 'Wind speed along +Z (m/s) advecting the noise.');
    setTooltip(cloud.add(this.params.cloud, 'ambientK', 0.0, 0.5, 0.01), 'Ambient skylight added to clouds (prevents dark backsides).');
    setTooltip(cloud.add(this.params.cloud, 'opacity', 0.0, 4.0, 0.01), 'Final opacity multiplier applied after marching.');

    // Transmittance LUT
    this.trans = new TransmittancePass(this.renderer, this.params.atmosphere);
    this.trans.render();

    // Sky draw pass
    this.drawSky = new DrawSkyPass(this.renderer, this.camera, this.trans.texture, this.params);

    // Randomize cloud phase per load so the pattern changes on each refresh
    const cloudSeed = new THREE.Vector3(
      Math.random() * 1000.0,
      Math.random() * 1000.0,
      Math.random() * 1000.0
    );
    this.drawSky.setCloudSeed(cloudSeed);
    this._cloudTime = Math.random() * 10000.0;
    this.drawSky.setCloudTime(this._cloudTime);

    // Perlin noise texture
    {
      const loader = new THREE.TextureLoader();
      const perlinUrl = new URL('../assets/perlin256.png', import.meta.url).href;
      const perlin = loader.load(perlinUrl);
      perlin.wrapS = perlin.wrapT = THREE.RepeatWrapping;
      perlin.minFilter = THREE.LinearMipMapLinearFilter;
      perlin.magFilter = THREE.LinearFilter;
      this.drawSky.setPerlinTexture(perlin);
    }

    window.addEventListener('resize', () => {
      this.camera.aspect = container.clientWidth / container.clientHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(container.clientWidth, container.clientHeight);
      this.drawSky.setSize(container.clientWidth, container.clientHeight);
    });
    this.drawSky.setSize(container.clientWidth, container.clientHeight);

    this.perf = new PerfTuner({
      renderer: this.renderer,
      drawSky: this.drawSky,
      params: this.params,
      container
    });
  }

  setParamNoticeHandler(fn: (msg: string) => void) {
    this.paramNoticeHandler = fn;
  }

  collapseUnchangedPanels() {
    const toClose = ['sun', 'sky2', 'ground', 'place'];
    toClose.forEach(key => {
      const f = this.guiFolders[key];
      if (f?.close) f.close();
    });
  }

  private bindControl(path: string, ctrl: any) {
    this.guiBindings.set(path, ctrl);
  }

  private flashParam(path: string, message?: string) {
    const ctrl = this.guiBindings.get(path);
    const el = (ctrl?.domElement as HTMLElement | undefined) || null;
    const target = (el?.closest('.controller') as HTMLElement | null) || el;
    if (target) {
      target.classList.add('flash-notice');
      const existing = this.guiFlashTimers.get(path);
      if (existing) window.clearTimeout(existing);
      const timer = window.setTimeout(() => target.classList.remove('flash-notice'), 900);
      this.guiFlashTimers.set(path, timer);
    }
    if (message && this.paramNoticeHandler) {
      this.paramNoticeHandler(message);
    }
  }

  private assignParam(path: string, value: any): boolean {
    const parts = path.split('.');
    let obj: any = this.params;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!obj) return false;
      obj = obj[parts[i]];
    }
    const key = parts[parts.length - 1];
    if (!obj || !(key in obj)) return false;
    (obj as any)[key] = value;
    return true;
  }

  private updateControllerDisplay(path: string) {
    const ctrl = this.guiBindings.get(path);
    if (ctrl?.updateDisplay) ctrl.updateDisplay();
  }

  setParamValue(
    path: string,
    value: any,
    opts: { flash?: boolean; label?: string; fireOnChange?: boolean } = {}
  ) {
    const ctrl = this.guiBindings.get(path);
    if (ctrl && opts.fireOnChange !== false && typeof ctrl.setValue === 'function') {
      ctrl.setValue(value);
    } else {
      const ok = this.assignParam(path, value);
      if (!ok) return;
      this.updateControllerDisplay(path);
      if (path.startsWith('atmosphere.')) this.refreshLUT();
    }

    if (opts.flash) {
      const valStr = typeof value === 'number' ? value.toFixed(2).replace(/\.?0+$/, '') : String(value);
      const msg = opts.label ?? `${path} → ${valStr}`;
      this.flashParam(path, msg);
    }
  }

  notifyParam(path: string, message: string) {
    this.flashParam(path, message);
  }

  getParams() { return this.params; }

  getSunDirection() { return this.sunDir.clone(); }

  getCameraSpherical() {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const sph = new THREE.Spherical().setFromVector3(offset);
    return { theta: sph.theta, phi: sph.phi, radius: sph.radius };
  }

  setCameraSpherical(theta: number, phi: number, radius: number) {
    const offset = new THREE.Vector3().setFromSpherical(new THREE.Spherical(radius, phi, theta));
    this.camera.position.copy(this.controls.target).add(offset);
    this.camera.lookAt(this.controls.target);
    this.controls.update();
  }

  setTimeMinutes(totalMinutes: number) {
    const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
    const hour = Math.floor(wrapped / 60);
    const minute = Math.floor(wrapped % 60);
    this.params.time.hour = hour;
    this.params.time.minute = minute;
    this.updateControllerDisplay('time.hour');
    this.updateControllerDisplay('time.minute');
  }

  setRealtimeEnabled(on: boolean, opts: { flash?: boolean; label?: string } = {}) {
    this.setParamValue('realtime.enabled', on, { fireOnChange: true, flash: opts.flash, label: opts.label });
  }

  snapToSun() {
    if (this.sunDir.lengthSq() < 1e-6) return;
    const target = this.controls.target.clone();
    const radius = this.camera.position.distanceTo(target) || 3.0;
    const dir = this.sunDir.clone().normalize();
    const pos = target.clone().sub(dir.multiplyScalar(radius));
    this.camera.position.copy(pos);
    this.camera.lookAt(target);
    this.controls.update();
  }

  private refreshLUT() {
    this.lutDirty = true;
    this.lutTimer = 0;
  }

  frame(dt: number) {
    this.lutTimer += dt;
    if (this.lutDirty && this.lutTimer > 0.12) {
      this.trans.updateAtmosphere(this.params.atmosphere);
      this.trans.render();
      this.lutDirty = false;
      this.lutTimer = 0;
    }

    this.controls.update();
    this._cloudTime += dt;
    this.drawSky.setCloudTime(this._cloudTime);
    this.perf.update(dt);

    const date = new Date(Date.UTC(
      this.params.time.year, this.params.time.month - 1, this.params.time.day,
      this.params.time.hour - this.params.time.utcOffset, this.params.time.minute, 0, 0
    ));
    const { dir /*, altDeg*/ } = computeSunDirection(this.params.place.latitude, this.params.place.longitude, date);
    this.sunDir.set(dir.x, dir.y, dir.z);
    this.drawSky.render(dir);
  }
}

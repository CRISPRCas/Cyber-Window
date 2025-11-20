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
  private controls: OrbitControls;
  private perf: PerfTuner;
  private realtime: RealTimeService;
  private sunDir = new THREE.Vector3();

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

    const sky = gui.addFolder('Sky');
    sky.add(this.params.atmosphere, 'rayleighScale', 0.1, 5.0, 0.01).name('rayleighScale').onChange(()=>this.refreshLUT());
    sky.add(this.params.atmosphere, 'mieScale', 0.1, 5.0, 0.01).name('mieScale').onChange(()=>this.refreshLUT());
    sky.add(this.params.atmosphere, 'groundAlbedo', 0.0, 1.0, 0.01).name('groundAlbedo');

    const sky2 = gui.addFolder('Sky-2 (fast approx)');
    sky2.add(this.params.sky2, 'multiScatterBoost', 0.0, 1.0, 0.01);
    sky2.add(this.params.sky2, 'aerialStrength',    0.0, 1.0, 0.01);
    sky2.add(this.params.sky2, 'aerialDistance',    20000, 200000, 1000);
    sky2.add(this.params.sky2, 'skySunIntensity',   0.0, 60.0, 0.5);
    sky2.add(this.params.sky2, 'exposure',          0.1, 2.0, 0.01);

    const sun = gui.addFolder('Sun');
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
    place.add(this.params.place, 'latitude', -66, 66, 0.01);
    place.add(this.params.place, 'longitude', -180, 180, 0.01);
    place.add(this.params.time, 'utcOffset', -12, 14, 1).name('UTC offset');

    const time = gui.addFolder('Time');
    time.add(this.params.time, 'year', 2000, 2035, 1);
    time.add(this.params.time, 'month', 1, 12, 1);
    time.add(this.params.time, 'day', 1, 31, 1);
    time.add(this.params.time, 'hour', 0, 23, 1);
    time.add(this.params.time, 'minute', 0, 59, 1);

    gui.add(this.params.render, 'singleScatteringSteps', 8, 64, 1).name('skySteps');

    const realFolder = gui.addFolder('Real-time');
    const rtToggle = realFolder.add(this.params.realtime, 'enabled').name('Use real-time');
    rtToggle.onChange((v: boolean) => {
      if (v) this.realtime.start();
      else this.realtime.stop();
    });
    const statusCtrl = realFolder.add(this.params.realtime, 'status').name('status').listen();
    const updateCtrl = realFolder.add(this.params.realtime, 'lastUpdate').name('lastUpdate').listen();
    if ((statusCtrl as any).disable) (statusCtrl as any).disable();
    if ((updateCtrl as any).disable) (updateCtrl as any).disable();

    // ===== Cloud GUI =====
    const cloud = gui.addFolder('Cloud (volumetric)');
    cloud.add(this.params.cloud, 'enabled').name('enabled');
    cloud.add(this.params.cloud, 'coverage', 0.0, 1.0, 0.01);
    cloud.add(this.params.cloud, 'height', 200, 4000, 10);
    cloud.add(this.params.cloud, 'thickness', 200, 4000, 10);
    cloud.add(this.params.cloud, 'sigmaT', 0.1, 2.0, 0.01);
    cloud.add(this.params.cloud, 'phaseG', 0.0, 0.9, 0.01);
    cloud.add(this.params.cloud, 'steps', 8, 128, 1);
    cloud.add(this.params.cloud, 'maxDistance', 500, 20000, 100);
    cloud.add(this.params.cloud, 'fadeStart', 0, 20000, 100);
    cloud.add(this.params.cloud, 'fadeEnd', 0, 20000, 100);
    cloud.add(this.params.cloud, 'windX', -160, 160, 0.5);
    cloud.add(this.params.cloud, 'windZ', -160, 160, 0.5);
    cloud.add(this.params.cloud, 'ambientK', 0.0, 0.5, 0.01);
    cloud.add(this.params.cloud, 'opacity', 0.0, 2.0, 0.01);

    // LUT
    this.trans = new TransmittancePass(this.renderer, this.params.atmosphere);
    this.trans.render();

    // Sky draw pass
    this.drawSky = new DrawSkyPass(this.renderer, this.camera, this.trans.texture, this.params);

    // Perlin 纹理
    {
      const loader = new THREE.TextureLoader();
      const perlin = loader.load('assets/perlin256.png');
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
    this.trans.updateAtmosphere(this.params.atmosphere);
    this.trans.render();
  }

  frame(dt: number) {
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

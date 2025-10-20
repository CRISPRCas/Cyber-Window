import * as THREE from 'three';
import { GUI } from 'lil-gui';
import { createParams, Params } from '../ui/Params';
import { computeSunDirection } from '../data/solar';
import { TransmittancePass } from '../sky/TransmittancePass';
import { DrawSkyPass } from '../sky/DrawSkyPass';

export class App {
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera;
  private params: Params;

  private trans: TransmittancePass;
  private drawSky: DrawSkyPass;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000);
    this.camera.position.set(0, 1.8, 3);

    this.params = createParams();
    const gui = new GUI();
    const sky = gui.addFolder('Sky');
    sky.add(this.params.atmosphere, 'rayleighScale', 0.1, 5.0, 0.01).name('rayleighScale').onChange(()=>this.refreshLUT());
    sky.add(this.params.atmosphere, 'mieScale', 0.1, 5.0, 0.01).name('mieScale').onChange(()=>this.refreshLUT());
    sky.add(this.params.atmosphere, 'groundAlbedo', 0.0, 1.0, 0.01).name('groundAlbedo');

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

    // LUT
    this.trans = new TransmittancePass(this.renderer, this.params.atmosphere);
    this.trans.render();

    // Sky draw pass
    this.drawSky = new DrawSkyPass(this.renderer, this.camera, this.trans.texture, this.params);

    window.addEventListener('resize', () => {
      this.camera.aspect = container.clientWidth / container.clientHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(container.clientWidth, container.clientHeight);
      this.drawSky.setSize(container.clientWidth, container.clientHeight);
    });
    this.drawSky.setSize(container.clientWidth, container.clientHeight);
  }

  private refreshLUT() {
    this.trans.updateAtmosphere(this.params.atmosphere);
    this.trans.render();
  }

  frame(dt: number) {
    const date = new Date(Date.UTC(
      this.params.time.year, this.params.time.month - 1, this.params.time.day,
      this.params.time.hour - this.params.time.utcOffset, this.params.time.minute, 0, 0
    ));
    const sunDir = computeSunDirection(this.params.place.latitude, this.params.place.longitude, date);
    this.drawSky.render(sunDir);
  }
}
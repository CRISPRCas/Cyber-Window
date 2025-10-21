import * as THREE from 'three';
import { Params } from '../ui/Params';
import drawSkyFrag from '../shaders/sky/drawsky.frag?raw';

export class DrawSkyPass {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera2D: THREE.OrthographicCamera;
  private mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor(renderer: THREE.WebGLRenderer, camera3D: THREE.PerspectiveCamera, transTex: THREE.Texture, params: Params) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera2D = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geo = new THREE.PlaneGeometry(2, 2);

    // 安全默认值（若 Params 未定义）
    const defaultExposure = (params as any)?.sky2?.exposure ?? 0.9;

    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTransTex: { value: transTex },
        uInvProj:  { value: new THREE.Matrix4() },
        uInvView:  { value: new THREE.Matrix4() },
        uCamPos:   { value: new THREE.Vector3() },
        uSunDir:   { value: new THREE.Vector3(0,1,0) },
        uRayleighScale: { value: params.atmosphere.rayleighScale },
        uMieScale:      { value: params.atmosphere.mieScale },
        uGroundAlbedo:  { value: params.atmosphere.groundAlbedo },
        uSteps:         { value: params.render.singleScatteringSteps },
        uResolution:    { value: new THREE.Vector2(1,1) },

        // Sun
        uSunAngularRadius: { value: (params.sun.angularDiameterDeg * Math.PI/180) * 0.5 },
        uSunIntensity:     { value: params.sun.intensity },
        uHaloStrength:     { value: params.sun.haloStrength },
        uHaloFalloff:      { value: params.sun.haloFalloff },

        // Sky2 controls
        uMultiScatterBoost: { value: params.sky2.multiScatterBoost },
        uAerialStrength:    { value: params.sky2.aerialStrength },
        uAerialDistance:    { value: params.sky2.aerialDistance },
        uSkySunIntensity:   { value: params.sky2.skySunIntensity },

        // MS approx
        uMS_Steps:        { value: 5 },
        uMS_Strength:     { value: 1.0 },

        // Phase
        uMieG:            { value: 0.60 },

        // Tone map
        uExposure:        { value: defaultExposure },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
      `,
      fragmentShader: drawSkyFrag
    });

    // property hooks
    Object.defineProperty(params.render, 'singleScatteringSteps', {
      set: (v: number)=>{ this.mat.uniforms.uSteps.value = v; },
      get: ()=> this.mat.uniforms.uSteps.value
    });
    Object.defineProperty(params.atmosphere, 'rayleighScale', {
      set: (v: number)=>{ this.mat.uniforms.uRayleighScale.value = v; },
      get: ()=> this.mat.uniforms.uRayleighScale.value
    });
    Object.defineProperty(params.atmosphere, 'mieScale', {
      set: (v: number)=>{ this.mat.uniforms.uMieScale.value = v; },
      get: ()=> this.mat.uniforms.uMieScale.value
    });
    Object.defineProperty(params.atmosphere, 'groundAlbedo', {
      set: (v: number)=>{ this.mat.uniforms.uGroundAlbedo.value = v; },
      get: ()=> this.mat.uniforms.uGroundAlbedo.value
    });
    Object.defineProperty(params.sun, 'angularDiameterDeg', {
      set: (v: number)=>{ this.mat.uniforms.uSunAngularRadius.value = (v*Math.PI/180)*0.5; },
      get: ()=> (this.mat.uniforms.uSunAngularRadius.value*2)*180/Math.PI
    });
    Object.defineProperty(params.sun, 'intensity', {
      set: (v: number)=>{ this.mat.uniforms.uSunIntensity.value = v; },
      get: ()=> this.mat.uniforms.uSunIntensity.value
    });
    Object.defineProperty(params.sun, 'haloStrength', {
      set: (v: number)=>{ this.mat.uniforms.uHaloStrength.value = v; },
      get: ()=> this.mat.uniforms.uHaloStrength.value
    });
    Object.defineProperty(params.sun, 'haloFalloff', {
      set: (v: number)=>{ this.mat.uniforms.uHaloFalloff.value = v; },
      get: ()=> this.mat.uniforms.uHaloFalloff.value
    });
    Object.defineProperty(params.sky2, 'multiScatterBoost', {
      set: (v: number)=>{ this.mat.uniforms.uMultiScatterBoost.value = v; },
      get: ()=> this.mat.uniforms.uMultiScatterBoost.value
    });
    Object.defineProperty(params.sky2, 'aerialStrength', {
      set: (v: number)=>{ this.mat.uniforms.uAerialStrength.value = v; },
      get: ()=> this.mat.uniforms.uAerialStrength.value
    });
    Object.defineProperty(params.sky2, 'aerialDistance', {
      set: (v: number)=>{ this.mat.uniforms.uAerialDistance.value = v; },
      get: ()=> this.mat.uniforms.uAerialDistance.value
    });
    Object.defineProperty(params.sky2, 'skySunIntensity', {
      set: (v: number)=>{ this.mat.uniforms.uSkySunIntensity.value = v; },
      get: ()=> this.mat.uniforms.uSkySunIntensity.value
    });

    // 新增：曝光控制
    if (!(params as any).sky2.exposure) { (params as any).sky2.exposure = defaultExposure; }
    Object.defineProperty((params as any).sky2, 'exposure', {
      set: (v: number)=>{ this.mat.uniforms.uExposure.value = v; },
      get: ()=> this.mat.uniforms.uExposure.value
    });

    this.mesh = new THREE.Mesh(geo, this.mat);
    this.scene.add(this.mesh);

    const updateFromCamera = () => {
      const invProj = new THREE.Matrix4().copy(camera3D.projectionMatrix).invert();
      const invView = new THREE.Matrix4().copy(camera3D.matrixWorld);
      this.mat.uniforms.uInvProj.value.copy(invProj);
      this.mat.uniforms.uInvView.value.copy(invView);
      this.mat.uniforms.uCamPos.value.copy(camera3D.position);
    };
    (this as any).updateFromCamera = updateFromCamera;
    updateFromCamera();
  }

  setSize(w: number, h: number) {
    this.mat.uniforms.uResolution.value.set(w, h);
  }

  render(sunDir: {x:number,y:number,z:number}) {
    (this as any).updateFromCamera();
    this.mat.uniforms.uSunDir.value.set(sunDir.x, sunDir.y, sunDir.z);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera2D);
  }
}

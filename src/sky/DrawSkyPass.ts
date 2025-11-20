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

    // Conservative defaults in case params are missing
    const defaultExposure = (params as any)?.sky2?.exposure ?? 0.9;

    // Cloud params fallback when not provided
    const pCloud = (params as any).cloud ?? ((params as any).cloud = {
      coverage: 0.45, height: 1500, thickness: 1200,
      sigmaT: 0.85, phaseG: 0.6, steps: 48, maxDistance: 12000,
      fadeStart: 8000, fadeEnd: 12000,
      windX: 6.0, windZ: 3.0, ambientK: 0.06, opacity: 1.0, enabled: true
    });

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
        uGroundRoughness: { value: params.ground.mirrorRoughness },
        uGroundNoiseScale:{ value: params.ground.mirrorNoiseScale },
        uGroundRippleAmp:  { value: params.ground.rippleAmplitude },
        uGroundRippleFreq: { value: params.ground.rippleFrequency },
        uGroundRippleSpeed:{ value: params.ground.rippleSpeed },

        uSunAngularRadius: { value: (params.sun.angularDiameterDeg * Math.PI/180) * 0.5 },
        uSunIntensity:     { value: params.sun.intensity },
        uHaloStrength:     { value: params.sun.haloStrength },
        uHaloFalloff:      { value: params.sun.haloFalloff },

        uMultiScatterBoost: { value: params.sky2.multiScatterBoost },
        uAerialStrength:    { value: params.sky2.aerialStrength },
        uAerialDistance:    { value: params.sky2.aerialDistance },
        uSkySunIntensity:   { value: params.sky2.skySunIntensity },

        uMS_Steps:        { value: 5 },
        uMS_Strength:     { value: 1.0 },

        uMieG:            { value: 0.60 },

        uExposure:        { value: defaultExposure },

        uPerlinTex:       { value: null as any as THREE.Texture },
        uCloudCoverage:   { value: pCloud.coverage },
        uCloudHeight:     { value: pCloud.height },
        uCloudThickness:  { value: pCloud.thickness },
        uCloudSigmaT:     { value: pCloud.sigmaT },
        uCloudPhaseG:     { value: pCloud.phaseG },
        uCloudSteps:      { value: pCloud.steps },
        uCloudMaxDistance:{ value: pCloud.maxDistance },
        uCloudFadeStart:  { value: pCloud.fadeStart },
        uCloudFadeEnd:    { value: pCloud.fadeEnd },
        uCloudWind:       { value: new THREE.Vector2(pCloud.windX, pCloud.windZ) },
        uCloudTime:       { value: 0.0 },
        uCloudAmbientK:   { value: pCloud.ambientK },
        uCloudOpacity:    { value: pCloud.opacity },
        uCloudEnabled:    { value: pCloud.enabled ? 1 : 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
      `,
      fragmentShader: drawSkyFrag,
      depthWrite: false,
      depthTest: false
    });

    // Param hooks (two-way binding between GUI params and uniforms)
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
    Object.defineProperty(params.ground, 'mirrorRoughness', {
      set: (v: number)=>{ this.mat.uniforms.uGroundRoughness.value = v; },
      get: ()=> this.mat.uniforms.uGroundRoughness.value
    });
    Object.defineProperty(params.ground, 'mirrorNoiseScale', {
      set: (v: number)=>{ this.mat.uniforms.uGroundNoiseScale.value = v; },
      get: ()=> this.mat.uniforms.uGroundNoiseScale.value
    });
    Object.defineProperty(params.ground, 'rippleAmplitude', {
      set: (v: number)=>{ this.mat.uniforms.uGroundRippleAmp.value = v; },
      get: ()=> this.mat.uniforms.uGroundRippleAmp.value
    });
    Object.defineProperty(params.ground, 'rippleFrequency', {
      set: (v: number)=>{ this.mat.uniforms.uGroundRippleFreq.value = v; },
      get: ()=> this.mat.uniforms.uGroundRippleFreq.value
    });
    Object.defineProperty(params.ground, 'rippleSpeed', {
      set: (v: number)=>{ this.mat.uniforms.uGroundRippleSpeed.value = v; },
      get: ()=> this.mat.uniforms.uGroundRippleSpeed.value
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

    if (!(params as any).sky2.exposure) { (params as any).sky2.exposure = defaultExposure; }
    Object.defineProperty((params as any).sky2, 'exposure', {
      set: (v: number)=>{ this.mat.uniforms.uExposure.value = v; },
      get: ()=> this.mat.uniforms.uExposure.value
    });

    // Clouds hooks
    Object.defineProperty((params as any).cloud, 'coverage', {
      set: (v: number)=>{ this.mat.uniforms.uCloudCoverage.value = v; },
      get: ()=> this.mat.uniforms.uCloudCoverage.value
    });
    Object.defineProperty((params as any).cloud, 'height', {
      set: (v: number)=>{ this.mat.uniforms.uCloudHeight.value = v; },
      get: ()=> this.mat.uniforms.uCloudHeight.value
    });
    Object.defineProperty((params as any).cloud, 'thickness', {
      set: (v: number)=>{ this.mat.uniforms.uCloudThickness.value = v; },
      get: ()=> this.mat.uniforms.uCloudThickness.value
    });
    Object.defineProperty((params as any).cloud, 'sigmaT', {
      set: (v: number)=>{ this.mat.uniforms.uCloudSigmaT.value = v; },
      get: ()=> this.mat.uniforms.uCloudSigmaT.value
    });
    Object.defineProperty((params as any).cloud, 'phaseG', {
      set: (v: number)=>{ this.mat.uniforms.uCloudPhaseG.value = v; },
      get: ()=> this.mat.uniforms.uCloudPhaseG.value
    });
    Object.defineProperty((params as any).cloud, 'steps', {
      set: (v: number)=>{ this.mat.uniforms.uCloudSteps.value = v|0; },
      get: ()=> this.mat.uniforms.uCloudSteps.value
    });
    Object.defineProperty((params as any).cloud, 'maxDistance', {
      set: (v: number)=>{ this.mat.uniforms.uCloudMaxDistance.value = v; },
      get: ()=> this.mat.uniforms.uCloudMaxDistance.value
    });
    Object.defineProperty((params as any).cloud, 'fadeStart', {
      set: (v: number)=>{ this.mat.uniforms.uCloudFadeStart.value = v; },
      get: ()=> this.mat.uniforms.uCloudFadeStart.value
    });
    Object.defineProperty((params as any).cloud, 'fadeEnd', {
      set: (v: number)=>{ this.mat.uniforms.uCloudFadeEnd.value = v; },
      get: ()=> this.mat.uniforms.uCloudFadeEnd.value
    });
    Object.defineProperty((params as any).cloud, 'windX', {
      set: (v: number)=>{ this.mat.uniforms.uCloudWind.value.x = v; },
      get: ()=> this.mat.uniforms.uCloudWind.value.x
    });
    Object.defineProperty((params as any).cloud, 'windZ', {
      set: (v: number)=>{ this.mat.uniforms.uCloudWind.value.y = v; },
      get: ()=> this.mat.uniforms.uCloudWind.value.y
    });
    Object.defineProperty((params as any).cloud, 'ambientK', {
      set: (v: number)=>{ this.mat.uniforms.uCloudAmbientK.value = v; },
      get: ()=> this.mat.uniforms.uCloudAmbientK.value
    });
    Object.defineProperty((params as any).cloud, 'opacity', {
      set: (v: number)=>{ this.mat.uniforms.uCloudOpacity.value = v; },
      get: ()=> this.mat.uniforms.uCloudOpacity.value
    });
    Object.defineProperty((params as any).cloud, 'enabled', {
      set: (v: boolean)=>{ this.mat.uniforms.uCloudEnabled.value = v ? 1 : 0; },
      get: ()=> this.mat.uniforms.uCloudEnabled.value === 1
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

  setPerlinTexture(tex: THREE.Texture) { this.mat.uniforms.uPerlinTex.value = tex; }
  setCloudTime(t: number) { this.mat.uniforms.uCloudTime.value = t; }

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

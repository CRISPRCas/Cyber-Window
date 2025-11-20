import * as THREE from 'three';
import transFrag from '../shaders/sky/transmittance.frag?raw';


export class TransmittancePass {
  private rt: THREE.WebGLRenderTarget;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private quad: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private renderer: THREE.WebGLRenderer;

  constructor(renderer: THREE.WebGLRenderer, params: AtmosphereParams) {
    this.renderer = renderer;

    this.rt = new THREE.WebGLRenderTarget(256, 64, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false
    });

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geo = new THREE.PlaneGeometry(2, 2);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uRayleighScale: { value: params.rayleighScale },
        uMieScale:      { value: params.mieScale },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
      `,
      fragmentShader: transFrag
    });
    this.quad = new THREE.Mesh(geo, this.material);
    this.scene.add(this.quad);
  }

  get texture() { return this.rt.texture; }

  updateAtmosphere(params: AtmosphereParams) {
    this.material.uniforms.uRayleighScale.value = params.rayleighScale;
    this.material.uniforms.uMieScale.value = params.mieScale;
  }

  render() {
    const old = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(old);
  }
}

export type AtmosphereParams = {
  rayleighScale: number;
  mieScale: number;
  groundAlbedo: number;
};

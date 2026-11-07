import * as THREE from "three";

export interface ParticlesWasmInstance {
  memory: WebAssembly.Memory;
  get_particle_count: () => number;
  get_positions_ptr: () => number;
  init_particles: () => void;
  step_simulation: (dt: number) => void;
}

export async function createSimdParticleSystem(
  wasmUrl: string
): Promise<{
  points: THREE.Points;
  update: (dt: number) => void;
  dispose: () => void;
}> {
  const response = await fetch(wasmUrl);
  const { instance } = await WebAssembly.instantiate(await response.arrayBuffer());
  const wasm = instance.exports as unknown as ParticlesWasmInstance;

  wasm.init_particles();

  const count = wasm.get_particle_count();
  const ptr = wasm.get_positions_ptr();

  // Zero-copy typed array pointing directly at C linear memory
  const positionsView = new Float32Array(wasm.memory.buffer, ptr, count * 3);

  const geometry = new THREE.BufferGeometry();
  const positionAttr = new THREE.BufferAttribute(positionsView, 3);
  geometry.setAttribute("position", positionAttr);

  const material = new THREE.PointsMaterial({
    size: 0.15,
    color: 0x60a5fa,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);

  return {
    points,
    update(dt: number) {
      // Step simulation in C - SIMD processes 32k particles in ~0.2ms
      wasm.step_simulation(dt);
      positionAttr.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

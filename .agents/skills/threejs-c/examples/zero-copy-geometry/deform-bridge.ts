import * as THREE from "three";

export interface DeformWasmInstance {
  memory: WebAssembly.Memory;
  get_positions: () => number;
  get_normals: () => number;
  get_vertex_count: () => number;
  init_grid: (width: number, depth: number) => void;
  step_simulation: (time: number, freq: number, amp: number) => void;
}

export async function createDeformMesh(
  wasmUrl: string,
  width = 10,
  depth = 10
): Promise<{
  mesh: THREE.Mesh;
  update: (time: number) => void;
  dispose: () => void;
}> {
  // 1. Fetch and instantiate WebAssembly binary
  const response = await fetch(wasmUrl);
  const { instance } = await WebAssembly.instantiate(await response.arrayBuffer());
  const wasm = instance.exports as unknown as DeformWasmInstance;

  // 2. Initialize grid coordinates in C
  wasm.init_grid(width, depth);

  const vertexCount = wasm.get_vertex_count();
  const posPtr = wasm.get_positions();
  const normPtr = wasm.get_normals();

  // 3. ZERO-COPY BINDING: Wrap WASM linear memory directly in typed arrays
  const positionsView = new Float32Array(wasm.memory.buffer, posPtr, vertexCount * 3);
  const normalsView = new Float32Array(wasm.memory.buffer, normPtr, vertexCount * 3);

  const geometry = new THREE.BufferGeometry();
  const positionAttr = new THREE.BufferAttribute(positionsView, 3);
  const normalAttr = new THREE.BufferAttribute(normalsView, 3);

  geometry.setAttribute("position", positionAttr);
  geometry.setAttribute("normal", normalAttr);

  // 4. Generate triangle index buffer (128x128 grid)
  const grid = 128;
  const indices: number[] = [];
  for (let z = 0; z < grid - 1; z++) {
    for (let x = 0; x < grid - 1; x++) {
      const a = z * grid + x;
      const b = (z + 1) * grid + x;
      const c = (z + 1) * grid + (x + 1);
      const d = z * grid + (x + 1);

      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }
  geometry.setIndex(indices);

  // 5. Material and Mesh setup
  const material = new THREE.MeshStandardMaterial({
    color: 0x3b82f6,
    roughness: 0.2,
    metalness: 0.1,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);

  return {
    mesh,
    update(time: number) {
      // Step simulation in C - single FFI call
      wasm.step_simulation(time, 0.8, 0.7);

      // Signal WebGL to upload mutated memory to GPU
      positionAttr.needsUpdate = true;
      normalAttr.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

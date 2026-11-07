---
name: threejs-c
description: Accelerate and extend Three.js applications using C compiled to WebAssembly (WASM). Use when optimizing computationally intensive 3D math, physics simulations, dynamic mesh deformation, procedural geometry generation, massive particle systems, spatial indexing (BVH/octree) for raycasting, or implementing zero-copy buffer sharing between C linear memory and Three.js BufferGeometry.
---

# Accelerating Three.js with C and WebAssembly

Integrating C into a Three.js pipeline allows you to eliminate JavaScript garbage collection (GC) pauses, bypass dynamic runtime deoptimizations, leverage 128-bit SIMD vector instructions, and stream procedural vertex data straight into WebGL/WebGPU buffers via zero-copy linear memory views.

## When to Use C with Three.js

Evaluate where your computational bottleneck lies before introducing C:

| Task Type | Best Tool | Why |
| :--- | :--- | :--- |
| **High-vertex CPU deformation** (cloth, wave equations, soft body) | **C (WASM)** | Continuous array writes with no GC, SIMD-vectorized float math, direct WebGL attribute updates. |
| **Complex procedural generation** (Marching Cubes, Voronoi, Delaunay) | **C (WASM)** | Cache-friendly pointer math, zero runtime allocations, fast topology indexing. |
| **Large-scale spatial queries & picking** (BVH, KD-Tree, Octree) | **C (WASM)** | Traverses hundreds of thousands of bounding boxes in microseconds without allocating JS objects. |
| **Physics & constraints** (XPBD, rigid bodies, ragdolls) | **C (WASM)** | Deterministic floating-point arithmetic, tight inner solve loops, SIMD quaternion/vector ops. |
| **Shading, post-processing, screen-space effects** | **GPU Shaders (GLSL / TSL)** | Parallel per-pixel/per-fragment execution belongs on the GPU. |
| **Scene graph orchestration & UI controls** | **JavaScript / TypeScript** | High-level DOM binding, asset loading, and Three.js object management are ergonomic in JS. |

---

## Core Architectural Principles

### 1. Zero-Copy Memory Bridge
Never serialize data across the JavaScript <-> WebAssembly boundary (avoid JSON or byte-by-byte copying). Instead:
- Allocate vertex, normal, color, or instance transform buffers in C linear memory.
- Export the pointer (byte offset) from C.
- Instantiate a typed array view directly on WebAssembly linear memory (`wasm.memory.buffer`):
  ```ts
  const ptr = wasm.get_positions_ptr();
  const count = wasm.get_vertex_count();
  // Direct zero-copy view into WASM linear memory:
  const positionsView = new Float32Array(wasm.memory.buffer, ptr, count * 3);
  const positionAttribute = new THREE.BufferAttribute(positionsView, 3);
  geometry.setAttribute('position', positionAttribute);
  ```
- After C updates the values in the simulation step, mark the attribute dirty:
  ```ts
  wasm.step_simulation(dt);
  geometry.attributes.position.needsUpdate = true;
  ```

### 2. Coarse-Grained FFI Boundary
Boundary crossing between JS and WebAssembly incurs function call overhead.
- **Antipattern**: Calling `wasm.update_particle(i, x, y, z)` 50,000 times per frame from JavaScript.
- **Correct Pattern**: Call `wasm.step_particles(dt)` **once** per frame. Let the C loop process all 50,000 particles in contiguous linear memory.

### 3. Static Buffers or Arena Allocators (No Dynamic `malloc`/`free` Churn)
- Prefer static fixed-size arrays or simple bump/arena allocators in C.
- Dynamic heap resizing in WebAssembly can cause `wasm.memory.buffer` to detach, which invalidates all existing typed array views in JavaScript.
- If dynamic memory growth is required, inspect `geometry.attributes.position.array.buffer.byteLength === 0` (or `buffer.detached`) and re-bind the `BufferAttribute` views.

### 4. Compute Analytic Normals in C
Three.js's `geometry.computeVertexNormals()` is written in JavaScript and traverses triangle indices with JS overhead. When deforming meshes in C, compute normal vectors simultaneously in C (either analytically or via neighbor cross products) and write them directly into a shared normal buffer:
```ts
geometry.setAttribute('normal', new THREE.BufferAttribute(
  new Float32Array(wasm.memory.buffer, wasm.get_normals_ptr(), count * 3), 3
));
```

---

## Step-by-Step Implementation Runbook

### Step 1: Write the C Kernel
Define your state and computations in C. Export functions using `__attribute__((export_name("function_name")))` or linker flags.

```c
// wasm/simulation.c
#define NUM_VERTICES 10000

static float positions[NUM_VERTICES * 3];
static float normals[NUM_VERTICES * 3];

__attribute__((export_name("get_positions"))) float* get_positions(void) {
    return positions;
}

__attribute__((export_name("get_normals"))) float* get_normals(void) {
    return normals;
}

__attribute__((export_name("step_simulation"))) void step_simulation(float dt, float time) {
    for (int i = 0; i < NUM_VERTICES; i++) {
        int idx = i * 3;
        // Compute new coordinates and write directly to contiguous buffer
        positions[idx + 1] = sinf(positions[idx] * 0.5f + time) * cosf(positions[idx + 2] * 0.5f + time);
        // Compute corresponding normal vectors...
    }
}
```

### Step 2: Compile C to WebAssembly
Use standalone Clang (minimal footprint, zero runtime bloat) or Emscripten (for existing C libraries).

#### Standalone Clang (Recommended for performance kernels):
```bash
clang --target=wasm32 -O3 -flto -nostdlib \
  -Wl,--no-entry \
  -Wl,--export-memory \
  -Wl,--initial-memory=2097152 \
  -o public/simulation.wasm wasm/simulation.c
```
- `-target wasm32`: Target WebAssembly 32-bit linear address space.
- `-O3 -flto`: Maximum optimization and Link Time Optimization.
- `-nostdlib`: Strips the standard C library runtime to produce binaries often under 2 KB.
- `-Wl,--no-entry`: Suppresses default `main()` requirement.
- `-Wl,--export-memory`: Exports `memory` object to JavaScript.
- Optional: add `-msimd128` to enable 128-bit SIMD vector instructions.

*(See [toolchains-and-compilation.md](./references/toolchains-and-compilation.md) for full toolchain configuration and helper scripts).*

### Step 3: Instantiate and Bind to Three.js
In your TypeScript module:

```ts
interface SimulationWasm extends WebAssembly.Instance {
  exports: {
    memory: WebAssembly.Memory;
    get_positions: () => number;
    get_normals: () => number;
    step_simulation: (dt: number, time: number) => void;
  };
}

export async function createSimulation(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
  const response = await fetch(`${import.meta.env.BASE_URL}simulation.wasm`);
  const { instance } = await WebAssembly.instantiate(await response.arrayBuffer());
  const wasm = instance as SimulationWasm;

  const count = 10000;
  const posPtr = wasm.exports.get_positions();
  const normPtr = wasm.exports.get_normals();

  // Attach zero-copy typed arrays to BufferGeometry
  const geometry = new THREE.BufferGeometry();
  const posArray = new Float32Array(wasm.exports.memory.buffer, posPtr, count * 3);
  const normArray = new Float32Array(wasm.exports.memory.buffer, normPtr, count * 3);

  geometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normArray, 3));

  const material = new THREE.MeshStandardMaterial({ roughness: 0.4 });
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  return {
    update(dt: number, time: number) {
      wasm.exports.step_simulation(dt, time);
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.normal.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    }
  };
}
```

### Step 4: Hook into the Animation Loop
Drive updates through elapsed clock time:

```ts
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  const elapsedTime = clock.getElapsedTime();
  sim.update(dt, elapsedTime);
  renderer.render(scene, camera);
});
```

---

## Key Performance Patterns

### Pattern A: Dynamic Vertex Deformation (Cloth / Water / Waves)
- Keep vertices in a single contiguous buffer in C.
- Calculate position displacement and analytical surface derivatives (tangent / binormal / normal) in the same pass.
- Mark `needsUpdate = true` on the Three.js attributes.
- Avoid calling `geometry.computeVertexNormals()` in JavaScript every frame.

### Pattern B: Instanced Rendering with SIMD Particle Dynamics
- Use `THREE.InstancedMesh`.
- Store instance transform matrices (`4x4` floats) or position/scale/quaternions in C linear memory.
- Use `#include <wasm_simd128.h>` in C to update 4 particles simultaneously per CPU cycle.
- Bind `instancedMesh.instanceMatrix = new THREE.InstancedBufferAttribute(new Float32Array(wasm.memory.buffer, matrixPtr, count * 16), 16)`.
- Mark `instancedMesh.instanceMatrix.needsUpdate = true`.

### Pattern C: Spatial Indexing & Sub-Millisecond Raycasting (BVH)
- Construct an Axis-Aligned Bounding Box (AABB) hierarchy or Uniform Spatial Grid in C.
- Pass the ray origin `(ox, oy, oz)` and direction `(dx, dy, dz)` from Three.js `raycaster.ray` into a single exported C function `query_ray(ox, oy, oz, dx, dy, dz)`.
- Return the hit entity ID, hit distance, and surface normal packed into a flat struct or integer ID.
- Avoids creating thousands of temporary JS `THREE.Vector3` or `Intersection` objects during user pointer interaction.

### Pattern D: Decoupled Web Worker Physics
- Run the C simulation loop inside a Web Worker.
- Use `SharedArrayBuffer` with `Atomics` or double-buffered `ArrayBuffer` transfer to deliver positions to the main Three.js rendering thread.
- Ensures the 60/120 FPS render thread never hitches, even under extreme simulation workloads.

---

## Detailed References & Examples

Explore specialized manuals and ready-to-run reference implementations:

- [Memory Bridge & Zero-Copy Architecture](./references/memory-bridge.md): Linear memory management, pointer arithmetic, memory growth handling, and struct alignment.
- [Toolchains & Build Workflows](./references/toolchains-and-compilation.md): Standalone Clang vs Emscripten, compiler optimization flags, and bundler integration.
- [SIMD & Low-Level Optimization](./references/optimization-and-simd.md): Using `wasm_simd128.h`, Struct-of-Arrays (SoA) layout, and loop vectorization.
- [Spatial Query & Physics Engines](./references/spatial-and-physics.md): BVH acceleration structures, fast collision detection, and XPBD solvers.
- [Example: Zero-Copy Geometry Deformation](./examples/zero-copy-geometry/): Complete C kernel and TypeScript bridge for dynamic mesh displacement.
- [Example: SIMD Particle System](./examples/simd-particles/): 100k particle physics using WASM SIMD128 and `THREE.InstancedMesh`.
- [Example: Fast Spatial Raycaster](./examples/fast-raycaster/): C spatial hash grid for instantaneous 3D raycasting.
- [Compilation Helper Script](./scripts/compile-wasm.sh): Portable script to build `.wasm` modules with clang.

---

## Verification & Diagnostics Checklist

Before deploying Three.js + C WASM features, verify:

1. **Zero Allocations in Render Loop**:
   - Inspect Chrome DevTools / Performance tab. Verify JS heap memory graph is flat during animation (no sawtooth pattern from GC collection).
2. **Buffer Detachment Resilience**:
   - Test whether WASM memory growth triggers `ArrayBuffer detached` errors. If memory grows, ensure typed array views are re-instantiated.
3. **Correct Byte Alignment**:
   - Ensure `Float32Array` pointers passed to Three.js are 4-byte aligned (i.e. `pointer % 4 === 0`).
4. **Drawing Range & Normal Synchronization**:
   - If generating procedural topology dynamically, verify `geometry.setDrawRange(0, count)` matches the vertex count exported by C.
5. **Proper Lifecycle Teardown**:
   - On scene unmount, dispose of Three.js geometries, materials, and instanced meshes. Clear references to the WASM instance to allow browser garbage collection of WASM memory modules.

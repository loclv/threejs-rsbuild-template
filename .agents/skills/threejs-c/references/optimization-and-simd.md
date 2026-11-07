# SIMD & Low-Level Optimization in C for Three.js

Modern WebAssembly supports 128-bit SIMD (Single Instruction, Multiple Data) operations across all modern desktop and mobile browsers (Chrome, Safari, Firefox, Edge). By utilizing SIMD in C, you can compute four 32-bit floats simultaneously in a single CPU clock cycle, accelerating vector transformations, particle systems, physics integrators, and geometry updates.

---

## 1. WebAssembly SIMD128 Architecture

WebAssembly SIMD defines a `v128` 128-bit vector type. For 3D graphics in Three.js, this maps to:
- **`f32x4`**: Four single-precision 32-bit floats (e.g. `[x, y, z, w]` or four parallel scalar coordinates).
- **`i32x4`**: Four 32-bit signed/unsigned integers.

### Enabling SIMD:
Compile with `-msimd128`:
```bash
clang --target=wasm32 -O3 -msimd128 -nostdlib -Wl,--no-entry -Wl,--export-memory -o module.wasm source.c
```

---

## 2. Using `<wasm_simd128.h>`

Clang includes `<wasm_simd128.h>` which provides intrinsic C functions mapped directly to native WebAssembly SIMD instructions.

### Essential Intrinsics:

| Intrinsic | Operation |
| :--- | :--- |
| `wasm_v128_load(ptr)` | Load 128 bits (4 floats) from memory |
| `wasm_v128_store(ptr, v)` | Store 128 bits (4 floats) to memory |
| `wasm_f32x4_splat(f)` | Broadcast single float to all 4 lanes `[f, f, f, f]` |
| `wasm_f32x4_make(a,b,c,d)`| Create vector from 4 separate floats |
| `wasm_f32x4_add(a, b)` | Vector addition `a + b` |
| `wasm_f32x4_sub(a, b)` | Vector subtraction `a - b` |
| `wasm_f32x4_mul(a, b)` | Vector multiplication `a * b` |
| `wasm_f32x4_div(a, b)` | Vector division `a / b` |
| `wasm_f32x4_sqrt(a)` | Square root across all 4 lanes |
| `wasm_f32x4_pmin(a, b)` | Pseudo-minimum |
| `wasm_f32x4_pmax(a, b)` | Pseudo-maximum |

---

## 3. Struct-of-Arrays (SoA) for 4-Wide Particle Integration

When simulating thousands of particles, storing them as **Struct-of-Arrays** enables 100% SIMD lane utilization:

```c
// wasm/particles.c
#include <wasm_simd128.h>

#define PARTICLE_COUNT 65536

// Struct-of-Arrays: contiguous memory for each coordinate
__attribute__((aligned(16))) static float pos_x[PARTICLE_COUNT];
__attribute__((aligned(16))) static float pos_y[PARTICLE_COUNT];
__attribute__((aligned(16))) static float pos_z[PARTICLE_COUNT];

__attribute__((aligned(16))) static float vel_x[PARTICLE_COUNT];
__attribute__((aligned(16))) static float vel_y[PARTICLE_COUNT];
__attribute__((aligned(16))) static float vel_z[PARTICLE_COUNT];

__attribute__((export_name("update_particles")))
void update_particles(float dt) {
    v128_t v_dt = wasm_f32x4_splat(dt);
    v128_t v_gravity = wasm_f32x4_splat(-9.81f * dt);
    v128_t v_damping = wasm_f32x4_splat(0.995f);

    // Process 4 particles per iteration
    for (int i = 0; i < PARTICLE_COUNT; i += 4) {
        // Load positions
        v128_t px = wasm_v128_load(&pos_x[i]);
        v128_t py = wasm_v128_load(&pos_y[i]);
        v128_t pz = wasm_v128_load(&pos_z[i]);

        // Load velocities
        v128_t vx = wasm_v128_load(&vel_x[i]);
        v128_t vy = wasm_v128_load(&vel_y[i]);
        v128_t vz = wasm_v128_load(&vel_z[i]);

        // Apply gravity to Y velocity
        vy = wasm_f32x4_add(vy, v_gravity);

        // Apply damping
        vx = wasm_f32x4_mul(vx, v_damping);
        vy = wasm_f32x4_mul(vy, v_damping);
        vz = wasm_f32x4_mul(vz, v_damping);

        // Update positions: pos += vel * dt
        px = wasm_f32x4_add(px, wasm_f32x4_mul(vx, v_dt));
        py = wasm_f32x4_add(py, wasm_f32x4_mul(vy, v_dt));
        pz = wasm_f32x4_add(pz, wasm_f32x4_mul(vz, v_dt));

        // Store back
        wasm_v128_store(&pos_x[i], px);
        wasm_v128_store(&pos_y[i], py);
        wasm_v128_store(&pos_z[i], pz);

        wasm_v128_store(&vel_x[i], vx);
        wasm_v128_store(&vel_y[i], vy);
        wasm_v128_store(&vel_z[i], vz);
    }
}
```

---

## 4. Packing SoA to Three.js Instanced / Interleaved Buffers

WebGL vertex shaders or `THREE.InstancedMesh` often expect coordinates interleaved (`[x0, y0, z0, x1, y1, z1, ...]`).

You can pack SoA buffers into interleaved buffers directly in C before passing to Three.js:

```c
__attribute__((aligned(16))) static float interleaved_positions[PARTICLE_COUNT * 3];

__attribute__((export_name("pack_to_interleaved")))
float* pack_to_interleaved(void) {
    for (int i = 0; i < PARTICLE_COUNT; i++) {
        interleaved_positions[i * 3 + 0] = pos_x[i];
        interleaved_positions[i * 3 + 1] = pos_y[i];
        interleaved_positions[i * 3 + 2] = pos_z[i];
    }
    return interleaved_positions;
}
```

---

## 5. Loop Unrolling and Branchless Coding

To achieve 60+ FPS on heavy calculations (e.g. 100,000+ physics particles):
1. **Eliminate Branches in Tight Loops**: Replace `if (pos_y < 0.0f)` with clamp or min/max operations:
   ```c
   // Branchless bounce:
   // If py < 0, vy = -vy * bounce_factor
   py = wasm_f32x4_pmax(py, wasm_f32x4_splat(0.0f));
   ```
2. **Use Clang Pragmas**:
   ```c
   #pragma clang loop unroll_count(4)
   #pragma clang loop vectorize(enable)
   for (int i = 0; i < N; i++) { ... }
   ```
3. **Data Alignment**: Ensure 16-byte alignment using `__attribute__((aligned(16)))` so that SIMD loads execute via single-cycle aligned vector instructions without penalty.

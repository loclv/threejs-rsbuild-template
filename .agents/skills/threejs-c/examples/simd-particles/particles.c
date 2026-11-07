// 32,768-particle physics simulation using WebAssembly 128-bit SIMD intrinsics.
#include <wasm_simd128.h>

#define PARTICLE_COUNT 32768
#define BOUNDS_RADIUS 15.0f

// Struct-of-Arrays (SoA) aligned to 16 bytes for fast SIMD loads
__attribute__((aligned(16))) static float px[PARTICLE_COUNT];
__attribute__((aligned(16))) static float py[PARTICLE_COUNT];
__attribute__((aligned(16))) static float pz[PARTICLE_COUNT];

__attribute__((aligned(16))) static float vx[PARTICLE_COUNT];
__attribute__((aligned(16))) static float vy[PARTICLE_COUNT];
__attribute__((aligned(16))) static float vz[PARTICLE_COUNT];

// Output buffer packed for Three.js (interleaved [x, y, z])
__attribute__((aligned(16))) static float output_positions[PARTICLE_COUNT * 3];

// Simple LCG pseudo-random number generator
static unsigned int seed = 123456789;
static float rand_float(float min, float max) {
    seed = (seed * 1664525u + 1013904223u);
    float t = (float)(seed & 0x00FFFFFF) / (float)0x00FFFFFF;
    return min + t * (max - min);
}

__attribute__((export_name("get_particle_count")))
unsigned int get_particle_count(void) {
    return PARTICLE_COUNT;
}

__attribute__((export_name("get_positions_ptr")))
float* get_positions_ptr(void) {
    return output_positions;
}

__attribute__((export_name("init_particles")))
void init_particles(void) {
    for (int i = 0; i < PARTICLE_COUNT; i++) {
        px[i] = rand_float(-5.0f, 5.0f);
        py[i] = rand_float(5.0f, 15.0f);
        pz[i] = rand_float(-5.0f, 5.0f);

        vx[i] = rand_float(-1.5f, 1.5f);
        vy[i] = rand_float(-0.5f, 0.5f);
        vz[i] = rand_float(-1.5f, 1.5f);
    }
}

__attribute__((export_name("step_simulation")))
void step_simulation(float dt) {
    v128_t v_dt = wasm_f32x4_splat(dt);
    v128_t v_gravity = wasm_f32x4_splat(-9.8f * dt);
    v128_t v_damping = wasm_f32x4_splat(0.998f);
    v128_t v_floor = wasm_f32x4_splat(0.0f);
    v128_t v_bounce = wasm_f32x4_splat(-0.75f);

    // 4-wide SIMD vector loop: processes 4 particles per cycle
    for (int i = 0; i < PARTICLE_COUNT; i += 4) {
        v128_t x = wasm_v128_load(&px[i]);
        v128_t y = wasm_v128_load(&py[i]);
        v128_t z = wasm_v128_load(&pz[i]);

        v128_t dx = wasm_v128_load(&vx[i]);
        v128_t dy = wasm_v128_load(&vy[i]);
        v128_t dz = wasm_v128_load(&vz[i]);

        // Apply gravity to Y velocity
        dy = wasm_f32x4_add(dy, v_gravity);

        // Apply air resistance
        dx = wasm_f32x4_mul(dx, v_damping);
        dy = wasm_f32x4_mul(dy, v_damping);
        dz = wasm_f32x4_mul(dz, v_damping);

        // Integrate positions: p += v * dt
        x = wasm_f32x4_add(x, wasm_f32x4_mul(dx, v_dt));
        y = wasm_f32x4_add(y, wasm_f32x4_mul(dy, v_dt));
        z = wasm_f32x4_add(z, wasm_f32x4_mul(dz, v_dt));

        // Ground collision: if (y < 0) { y = 0; vy = -vy * bounce; }
        v128_t hit_floor = wasm_f32x4_lt(y, v_floor);
        y = wasm_f32x4_pmax(y, v_floor);
        v128_t bounced_dy = wasm_f32x4_mul(dy, v_bounce);
        dy = wasm_v128_bitselect(bounced_dy, dy, hit_floor);

        // Store updated state back to SoA arrays
        wasm_v128_store(&px[i], x);
        wasm_v128_store(&py[i], y);
        wasm_v128_store(&pz[i], z);

        wasm_v128_store(&vx[i], dx);
        wasm_v128_store(&vy[i], dy);
        wasm_v128_store(&vz[i], dz);
    }

    // Pack into contiguous interleaved output array for Three.js
    for (int i = 0; i < PARTICLE_COUNT; i++) {
        int idx = i * 3;
        output_positions[idx + 0] = px[i];
        output_positions[idx + 1] = py[i];
        output_positions[idx + 2] = pz[i];
    }
}

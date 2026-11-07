// Dynamic deformable wave mesh kernel with analytical normal generation in C.
// Demonstrates zero-copy sharing with Three.js BufferGeometry.

#define GRID_SIZE 128
#define VERTEX_COUNT (GRID_SIZE * GRID_SIZE)

// 4-byte aligned contiguous vertex attributes
__attribute__((aligned(16))) static float positions[VERTEX_COUNT * 3];
__attribute__((aligned(16))) static float normals[VERTEX_COUNT * 3];

#define sqrtf(x) __builtin_sqrtf(x)

// Standalone fast sin approximation (no libc required)
static inline float fast_sin(float x) {
    const float PI = 3.14159265358979323846f;
    const float TWO_PI = 6.28318530717958647692f;
    float k = (float)((int)(x * (1.0f / TWO_PI)));
    x -= k * TWO_PI;
    if (x > PI) x -= TWO_PI;
    if (x < -PI) x += TWO_PI;

    float x2 = x * x;
    return x * (1.0f - x2 * (0.166666667f - x2 * (0.008333333f - x2 * 0.000198412f)));
}

static inline float fast_cos(float x) {
    return fast_sin(x + 1.57079632679f);
}

__attribute__((export_name("get_positions")))
float* get_positions(void) {
    return positions;
}

__attribute__((export_name("get_normals")))
float* get_normals(void) {
    return normals;
}

__attribute__((export_name("get_vertex_count")))
unsigned int get_vertex_count(void) {
    return VERTEX_COUNT;
}

__attribute__((export_name("init_grid")))
void init_grid(float width, float depth) {
    float dx = width / (float)(GRID_SIZE - 1);
    float dz = depth / (float)(GRID_SIZE - 1);
    float start_x = -width * 0.5f;
    float start_z = -depth * 0.5f;

    for (int z = 0; z < GRID_SIZE; z++) {
        for (int x = 0; x < GRID_SIZE; x++) {
            int idx = (z * GRID_SIZE + x) * 3;
            positions[idx + 0] = start_x + x * dx;
            positions[idx + 1] = 0.0f;
            positions[idx + 2] = start_z + z * dz;

            normals[idx + 0] = 0.0f;
            normals[idx + 1] = 1.0f;
            normals[idx + 2] = 0.0f;
        }
    }
}

__attribute__((export_name("step_simulation")))
void step_simulation(float time, float wave_freq, float wave_amp) {
    for (int z = 0; z < GRID_SIZE; z++) {
        for (int x = 0; x < GRID_SIZE; x++) {
            int idx = (z * GRID_SIZE + x) * 3;
            float px = positions[idx + 0];
            float pz = positions[idx + 2];

            // Wave height equation: Y = amp * sin(px * freq + time) * cos(pz * freq + time)
            float arg_x = px * wave_freq + time;
            float arg_z = pz * wave_freq + time;
            float s_x = fast_sin(arg_x);
            float c_x = fast_cos(arg_x);
            float s_z = fast_sin(arg_z);
            float c_z = fast_cos(arg_z);

            positions[idx + 1] = wave_amp * s_x * c_z;

            // Compute analytical partial derivatives for normal vector
            // dY/dx = wave_amp * wave_freq * cos(arg_x) * cos(arg_z)
            // dY/dz = -wave_amp * wave_freq * sin(arg_x) * sin(arg_z)
            float dydx = wave_amp * wave_freq * c_x * c_z;
            float dydz = -wave_amp * wave_freq * s_x * s_z;

            // Surface normal N = normalize(-dY/dx, 1.0, -dY/dz)
            float nx = -dydx;
            float ny = 1.0f;
            float nz = -dydz;

            float inv_len = 1.0f / sqrtf(nx * nx + ny * ny + nz * nz);
            normals[idx + 0] = nx * inv_len;
            normals[idx + 1] = ny * inv_len;
            normals[idx + 2] = nz * inv_len;
        }
    }
}

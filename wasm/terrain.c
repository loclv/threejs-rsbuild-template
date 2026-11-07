#define SIDE 129
static float heights[SIDE * SIDE];
__attribute__((export_name("generate"))) unsigned generate(float detail) {
  for (int z = 0; z < SIDE; z++) for (int x = 0; x < SIDE; x++) {
    float a = (x - 64) / 24.0f, b = (z - 64) / 24.0f;
    float d = a*a + b*b;
    float ridge = 1.0f / (1.0f + d * 0.32f);
    float waves = ((x * 17 + z * 31) % 97) / 97.0f;
    heights[z * SIDE + x] = ridge * 3.5f + waves * detail * ridge;
  }
  return (unsigned)heights;
}

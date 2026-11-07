# Toolchains & Compilation Workflows for Three.js + C

This guide covers compiling C code into WebAssembly modules optimized for high-performance Three.js rendering pipelines.

---

## 1. Toolchain Selection: Standalone Clang vs. Emscripten

| Feature | Standalone Clang (`clang`) | Emscripten (`emcc`) |
| :--- | :--- | :--- |
| **Primary Use Case** | Custom 3D math kernels, procedural geometry, particle physics, spatial query structures. | Existing C/C++ libraries (Bullet Physics, Draco, libigl, cglm). |
| **Runtime Overhead** | **0 KB** (no JavaScript runtime glue required). | ~10 KB – 100+ KB of JS loader and POSIX emulation. |
| **Binary Output Size** | Typically **500 bytes – 10 KB**. | 50 KB – several MBs depending on runtime inclusions. |
| **Standard Library** | `nostdlib` (compiler builtins for math & memory). | Full POSIX libc / musl emulation. |
| **Startup / Instantiation** | Near-instantaneous (`WebAssembly.instantiate`). | Asynchronous module wrapper instantiation. |

---

## 2. Standalone Clang Compilation (Recommended for Math & Geometry Kernels)

Standalone Clang compiles pure C directly to a standalone `.wasm` file using LLVM's WebAssembly backend (`wasm-ld`).

### Minimal Compilation Command:

```bash
clang --target=wasm32 -O3 -flto -nostdlib \
  -Wl,--no-entry \
  -Wl,--export-memory \
  -Wl,--export-all \
  -Wl,--initial-memory=4194304 \
  -o public/simulation.wasm \
  wasm/simulation.c
```

### Key Flags Explained:
- `--target=wasm32`: Emits 32-bit WebAssembly bytecode.
- `-O3`: Maximum loop unrolling, vectorization, and dead code elimination.
- `-flto`: Link-Time Optimization across translation units.
- `-nostdlib`: Disables standard C library headers and startup code (eliminates bloat).
- `-Wl,--no-entry`: Informs the linker there is no `main()` entry point.
- `-Wl,--export-memory`: Exports the module's linear memory as `exports.memory`.
- `-Wl,--initial-memory=4194304`: Sets initial memory size (here 4 MB = 64 pages).
- `-Wl,--max-memory=4194304`: (Optional) Prevents dynamic memory growth, guaranteeing that typed array views never detach.

### Enabling 128-bit SIMD:
Add `-msimd128` to unlock SIMD vector operations:
```bash
clang --target=wasm32 -O3 -msimd128 -nostdlib \
  -Wl,--no-entry -Wl,--export-memory -Wl,--export-all \
  -o public/simulation.wasm wasm/simulation.c
```

---

## 3. Working Without `libc` (`-nostdlib`)

When compiling with `-nostdlib`, standard C library headers like `<math.h>` or `<string.h>` may not be available. Use compiler built-ins or lightweight implementations:

### Built-in Math Functions:
Clang provides built-in math instructions that compile directly into WebAssembly instructions:

```c
// Builtins map to native WebAssembly hardware instructions:
#define fabsf(x)   __builtin_fabsf(x)   // maps to f32.abs
#define sqrtf(x)   __builtin_sqrtf(x)   // maps to f32.sqrt
#define ceilf(x)   __builtin_ceilf(x)   // maps to f32.ceil
#define floorf(x)  __builtin_floorf(x)  // maps to f32.floor
#define truncf(x)  __builtin_truncf(x)  // maps to f32.trunc
#define fminf(a,b) __builtin_fminf(a,b) // maps to f32.min
#define fmaxf(a,b) __builtin_fmaxf(a,b) // maps to f32.max

// Memory operations:
#define memcpy(d,s,n) __builtin_memcpy(d,s,n)
#define memset(d,v,n) __builtin_memset(d,v,n)
```

For transcendental functions like `sinf` and `cosf`, you can implement fast polynomial approximations (e.g. Taylor series or Bhaskara I) or pass a small lookup table (LUT) from JavaScript if exact precision is required.

---

## 4. Emscripten Compilation (For Full Libraries)

When compiling larger C/C++ libraries with complex dependencies, use Emscripten (`emcc`).

### Optimal Production Flags for Three.js:

```bash
emcc wasm/physics.c \
  -O3 -flto \
  -msimd128 \
  -s WASM=1 \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s ENVIRONMENT='web,worker' \
  -s ALLOW_MEMORY_GROWTH=0 \
  -s INITIAL_MEMORY=33554432 \
  -s EXPORTED_FUNCTIONS='["_init_world","_step_world","_get_positions"]' \
  -s EXPORTED_RUNTIME_METHODS='["HEAPF32","HEAPU32"]' \
  -o src/wasm/physics.js
```

### Why These Flags Matter:
- `-s EXPORT_ES6=1`: Emits a standard ES module that can be imported via `import createPhysicsModule from './physics.js'`.
- `-s ALLOW_MEMORY_GROWTH=0`: Prevents memory buffer detachment, ensuring your Three.js `BufferAttribute` arrays stay valid.
- `-s INITIAL_MEMORY=33554432`: Allocates 32 MB upfront.

---

## 5. Loading in Three.js (Rsbuild / Vite / Modern Bundlers)

### Method 1: Streaming Fetch from Public Directory (Cleanest & Recommended)
Place the compiled `.wasm` in `public/` and load via standard browser APIs:

```ts
async function loadWasmKernel() {
  const url = `${import.meta.env.BASE_URL}simulation.wasm`;
  
  // WebAssembly.instantiateStreaming compiles while downloading:
  let instance: WebAssembly.Instance;
  if ('instantiateStreaming' in WebAssembly) {
    const result = await WebAssembly.instantiateStreaming(fetch(url));
    instance = result.instance;
  } else {
    const res = await fetch(url);
    const bytes = await res.arrayBuffer();
    const result = await WebAssembly.instantiate(bytes);
    instance = result.instance;
  }
  
  return instance.exports as unknown as SimulationExports;
}
```

### Method 2: Inline Base64 (For Zero-Network Distribution)
For small kernels (< 5 KB), the `.wasm` file can be base64-encoded directly into TypeScript:

```ts
const WASM_BASE64 = "AGFzbQEAAAABBgFgAX8Bf2AD...";
const binaryString = atob(WASM_BASE64);
const bytes = new Uint8Array(binaryString.length);
for (let i = 0; i < binaryString.length; i++) {
  bytes[i] = binaryString.charCodeAt(i);
}
const { instance } = await WebAssembly.instantiate(bytes.buffer);
```

---

## 6. Automating with Bun

You can define a build script in `package.json` to compile C kernels before running tests or bundling:

```json
{
  "scripts": {
    "build:wasm": "bun run ./scripts/compile.ts",
    "dev": "bun run build:wasm && rsbuild",
    "build": "bun run build:wasm && rsbuild build"
  }
}
```

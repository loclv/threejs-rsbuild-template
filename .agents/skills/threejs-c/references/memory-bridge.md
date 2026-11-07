# WebAssembly Linear Memory Bridge & Zero-Copy Architecture

A primary performance advantage of combining C with Three.js is the ability to manipulate geometric data in WebAssembly linear memory and expose that memory directly to WebGL without copying.

---

## 1. WebAssembly Linear Memory Basics

WebAssembly linear memory is represented in JavaScript as an instance of `WebAssembly.Memory`. Its underlying storage is an `ArrayBuffer` accessible via `wasmInstance.exports.memory.buffer`.

In C, variables, arrays, and heap allocations reside inside this contiguous address space starting from byte index `0` up to `memory_size - 1`.

```text
+-------------------------------------------------------------------------+
| WebAssembly Linear Memory (ArrayBuffer)                                 |
| 0x00000000                                                   0x00FFFFFF |
| [ Stack ] [ Static Data / Buffers ] [ Arena / Dynamic Heap           ]  |
|                 ^                                                       |
|                 |                                                       |
|                 +--- TypedArray View in JavaScript                      |
|                      new Float32Array(wasm.memory.buffer, byteOffset, N)|
+-------------------------------------------------------------------------+
```

---

## 2. Zero-Copy `BufferAttribute` Binding

In standard JavaScript Three.js workflows, updating geometry often involves allocating arrays or modifying existing arrays and calling `attribute.needsUpdate = true`.

With C and WebAssembly:
1. C declares or allocates the memory.
2. C exports a function returning the address pointer (which is an unsigned 32-bit integer representing the byte offset in memory).
3. JavaScript wraps this byte offset directly in a typed array view.
4. Three.js uploads the data from this typed array straight to the GPU via WebGL `gl.bufferSubData()` or `gl.bufferData()`.

### Implementation Example:

```c
// kernel.c
#define VERTEX_COUNT 65536

// 65536 * 3 floats = 786,432 bytes
static float positions[VERTEX_COUNT * 3];

__attribute__((export_name("get_positions_offset")))
float* get_positions_offset(void) {
    return positions;
}
```

```ts
// bridge.ts
const ptr = wasm.exports.get_positions_offset();
const vertexCount = 65536;

// Create a typed array view directly on WASM linear memory:
// Note: byte offset must be a multiple of 4 for Float32Array!
const positionView = new Float32Array(wasm.exports.memory.buffer, ptr, vertexCount * 3);

// Bind to Three.js BufferGeometry:
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(positionView, 3));
```

Every frame, after C mutates `positions`:
```ts
wasm.exports.update_geometry(dt);
geometry.attributes.position.needsUpdate = true;
```

---

## 3. The Memory Growth & Detached Buffer Trap

When WebAssembly memory grows (either via `memory.grow()` in JS or `sbrk`/`malloc` in C requiring extra pages):
- The browser allocates a **new** `ArrayBuffer` with the expanded size.
- The previous `ArrayBuffer` becomes **detached** (`buffer.byteLength === 0`).
- Any existing `Float32Array` or `Uint16Array` pointing to the old buffer will immediately throw:
  `TypeError: Cannot perform %TypedArray%.prototype... on a detached ArrayBuffer`

### Prevention Strategies:

#### Strategy A: Fixed Preallocated Memory (Recommended for 3D Graphics)
If your maximum dataset size is known (e.g. up to 1,000,000 vertices), allocate enough memory upfront at link time so memory never needs to grow.

In Clang:
```bash
-Wl,--initial-memory=67108864 -Wl,--max-memory=67108864
```
(1 WebAssembly page = 64 KB = 65,536 bytes. 67,108,864 bytes = 1,024 pages = 64 MB).

#### Strategy B: Dynamic Re-binding on Detachment
If your memory must grow dynamically, detect detachment and re-bind the attributes:

```ts
function ensureValidBufferViews() {
  const currentAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
  const currentBuffer = currentAttr.array.buffer as ArrayBuffer;

  // Check if detached
  if (currentBuffer.byteLength === 0 || (currentBuffer as any).detached) {
    const ptr = wasm.exports.get_positions_offset();
    const count = wasm.exports.get_vertex_count();
    
    // Recreate view on new wasm.memory.buffer
    const freshView = new Float32Array(wasm.exports.memory.buffer, ptr, count * 3);
    currentAttr.array = freshView;
    currentAttr.needsUpdate = true;
  }
}
```

---

## 4. Alignment and Byte Offsets

JavaScript typed arrays enforce strict alignment constraints:
- `Float32Array`: `byteOffset` must be a multiple of **4**.
- `Uint32Array`: `byteOffset` must be a multiple of **4**.
- `Uint16Array`: `byteOffset` must be a multiple of **2**.
- `Uint8Array`: can start at any byte offset.

In C, ensure all exported buffers or struct arrays are aligned to 4 or 16 bytes:

```c
// Align to 16 bytes (ideal for SIMD and GPU buffer alignment)
__attribute__((aligned(16))) static float positions[MAX_VERTICES * 3];
```

---

## 5. Struct-of-Arrays (SoA) vs Array-of-Structs (AoS)

WebGL and Three.js typically expect separate non-interleaved vertex attributes (`position`, `normal`, `uv`), though interleaved attributes are supported via `THREE.InterleavedBuffer`.

### Separate Buffers (Struct-of-Arrays - SoA):
Ideal for standard Three.js `BufferAttribute`:
```c
typedef struct {
    float x[MAX_VERTICES];
    float y[MAX_VERTICES];
    float z[MAX_VERTICES];
} MeshPositions;
```
Or simply contiguous 3-float vectors:
```c
static float positions[MAX_VERTICES * 3]; // [x0, y0, z0, x1, y1, z1, ...]
static float normals[MAX_VERTICES * 3];   // [nx0, ny0, nz0, nx1, ny1, nz1, ...]
static float uvs[MAX_VERTICES * 2];       // [u0, v0, u1, v1, ...]
```
In Three.js:
```ts
geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(wasm.memory.buffer, posPtr, count * 3), 3));
geom.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(wasm.memory.buffer, normPtr, count * 3), 3));
geom.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(wasm.memory.buffer, uvPtr, count * 2), 2));
```

### Interleaved Buffers (Array-of-Structs - AoS):
If your simulation naturally calculates interleaved vertices:
```c
typedef struct {
    float px, py, pz;
    float nx, ny, nz;
    float u, v;
} Vertex; // 32 bytes per vertex

static Vertex vertices[MAX_VERTICES];
```
In Three.js:
```ts
const stride = 8; // 8 floats = 32 bytes
const interleavedBuffer = new THREE.InterleavedBuffer(
  new Float32Array(wasm.memory.buffer, vertPtr, count * stride),
  stride
);

geom.setAttribute('position', new THREE.InterleavedBufferAttribute(interleavedBuffer, 3, 0));
geom.setAttribute('normal', new THREE.InterleavedBufferAttribute(interleavedBuffer, 3, 3));
geom.setAttribute('uv', new THREE.InterleavedBufferAttribute(interleavedBuffer, 2, 6));
```

---

## 6. Arena Allocators in C (Zero Fragmentation)

Avoid standard `malloc` and `free` inside tight rendering loops. Instead, use a linear bump/arena allocator:

```c
#define ARENA_CAPACITY (16 * 1024 * 1024) // 16 MB

static char arena_memory[ARENA_CAPACITY];
static unsigned int arena_offset = 0;

void* arena_alloc(unsigned int size) {
    // 16-byte alignment
    unsigned int aligned = (arena_offset + 15) & ~15;
    if (aligned + size > ARENA_CAPACITY) return (void*)0; // Out of memory
    arena_offset = aligned + size;
    return &arena_memory[aligned];
}

void arena_reset(void) {
    arena_offset = 0;
}
```
At the start of each frame or procedural generation run, simply call `arena_reset()`. Allocation becomes virtually instant (`O(1)` pointer addition) with zero memory leaks.

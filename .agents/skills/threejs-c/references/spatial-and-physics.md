# Spatial Partitioning, Raycasting & Physics Acceleration in C

When dealing with large scenes (10,000+ objects, high-density point clouds, complex CAD models, or cloth simulation), standard JavaScript raycasting and physics suffer from excessive CPU cycles and Garbage Collection (GC) pressure. Implementing spatial acceleration structures and physics solvers in C delivers sub-millisecond query performance and silky-smooth rendering.

---

## 1. Fast Raycasting: Why JavaScript Raycasters Slow Down

Three.js's standard `THREE.Raycaster.intersectObjects()` performs:
1. Recursive scene graph traversal in JavaScript.
2. Per-object bounding sphere / box checks with dynamic matrix inversions.
3. Per-triangle intersection tests that allocate multiple `THREE.Vector3` instances per test.
4. Sorting an array of JavaScript `Intersection` objects.

During continuous pointer movement (`pointermove`), this causes severe frame stutter and garbage collector churn.

---

## 2. Flat Bounding Volume Hierarchy (BVH) / Spatial Grid in C

By storing bounding volumes or spatial grid cells in flat contiguous C arrays, ray traversal is performed without allocating any JavaScript objects.

### Uniform Spatial Hash Grid Architecture:

```text
3D World Space [xmin, ymin, zmin] to [xmax, ymax, zmax]
             |
             v
   Hash Function: cell_index = (ix * 73856093 ^ iy * 19349663 ^ iz * 83492791) % TABLE_SIZE
             |
             v
+-----------------------------------------------------------+
| Flat C Array: Grid Buckets & Entity IDs                   |
| [ Cell 0: count, id0, id1... ] [ Cell 1: count, id2... ]  |
+-----------------------------------------------------------+
```

### C Ray-AABB Intersection (Slab Method):

```c
// fast_math.h
typedef struct { float x, y, z; } Vec3;
typedef struct { Vec3 min; Vec3 max; int entity_id; } AABB;

static inline int ray_intersects_aabb(
    Vec3 ro, Vec3 inv_rd, AABB box, float* t_out
) {
    float t1 = (box.min.x - ro.x) * inv_rd.x;
    float t2 = (box.max.x - ro.x) * inv_rd.x;
    float tmin = t1 < t2 ? t1 : t2;
    float tmax = t1 > t2 ? t1 : t2;

    float t3 = (box.min.y - ro.y) * inv_rd.y;
    float t4 = (box.max.y - ro.y) * inv_rd.y;
    tmin = (t3 < t4 ? t3 : t4) > tmin ? (t3 < t4 ? t3 : t4) : tmin;
    tmax = (t3 > t4 ? t3 : t4) < tmax ? (t3 > t4 ? t3 : t4) : tmax;

    float t5 = (box.min.z - ro.z) * inv_rd.z;
    float t6 = (box.max.z - ro.z) * inv_rd.z;
    tmin = (t5 < t6 ? t5 : t6) > tmin ? (t5 < t6 ? t5 : t6) : tmin;
    tmax = (t5 > t6 ? t5 : t6) < tmax ? (t5 > t6 ? t5 : t6) : tmax;

    if (tmax >= tmin && tmax > 0.0f) {
        *t_out = tmin > 0.0f ? tmin : 0.0f;
        return 1;
    }
    return 0;
}
```

### TypeScript Bridge:

```ts
// In mousemove / pointermove event:
const ray = raycaster.ray;
const hitId = wasm.query_ray(
  ray.origin.x, ray.origin.y, ray.origin.z,
  ray.direction.x, ray.direction.y, ray.direction.z
);

if (hitId >= 0) {
  highlightObject(hitId);
}
```
*Zero allocations, executes in < 0.02ms across 50,000 entities.*

---

## 3. XPBD (Extended Position-Based Dynamics) Physics in C

For deformable bodies, cloth, and ropes:
- Store particles as `(pos, prev_pos, inv_mass)` tuples.
- Each frame, integrate external forces (gravity, wind) via Verlet integration:
  `pos += (pos - prev_pos) * damping + force * dt * dt`
- Solve distance constraints iteratively:
  $$C(\mathbf{p}_1, \mathbf{p}_2) = |\mathbf{p}_1 - \mathbf{p}_2| - d_0$$
- In C, a 10-iteration constraint solver on 10,000 vertices runs in ~1.2ms, whereas in JS it often exceeds 16ms due to array lookup overhead and JIT bailout.

---

## 4. Multi-Threading with Web Workers & SharedArrayBuffer

To completely isolate heavy C physics calculations from the Three.js rendering thread:

1. Enable Cross-Origin Isolation headers on your server:
   ```http
   Cross-Origin-Opener-Policy: same-origin
   Cross-Origin-Embedder-Policy: require-corp
   ```
2. Allocate a `SharedArrayBuffer` shared between the Main Thread and a Web Worker:
   ```ts
   const sharedBuffer = new SharedArrayBuffer(1024 * 1024 * 4); // 4 MB
   const floatView = new Float32Array(sharedBuffer);
   worker.postMessage({ buffer: sharedBuffer });
   ```
3. Inside the Web Worker:
   - Instantiate the C WebAssembly module.
   - Run the physics update loop continuously at a fixed time step (e.g., 120 Hz).
   - Write output positions directly into `sharedBuffer`.
4. In the Main Three.js Thread:
   - Create a `BufferAttribute` over the `SharedArrayBuffer`.
   - On each `requestAnimationFrame`, mark `attribute.needsUpdate = true` and render.
   - Result: 120 FPS buttery-smooth rendering completely decoupled from physics computation time.

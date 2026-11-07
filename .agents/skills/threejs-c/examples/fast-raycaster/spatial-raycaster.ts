import * as THREE from "three";

export interface SpatialRaycasterWasm {
  memory: WebAssembly.Memory;
  clear_boxes: () => void;
  add_box: (minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, id: number) => number;
  query_ray: (roX: number, roY: number, roZ: number, rdX: number, rdY: number, rdZ: number) => number;
  get_hit_result: () => number;
}

export async function createFastRaycaster(wasmUrl: string) {
  const response = await fetch(wasmUrl);
  const { instance } = await WebAssembly.instantiate(await response.arrayBuffer());
  const wasm = instance.exports as unknown as SpatialRaycasterWasm;

  const hitResultPtr = wasm.get_hit_result();
  const hitResultView = new Float32Array(wasm.memory.buffer, hitResultPtr, 2);

  return {
    syncObjects(objects: THREE.Mesh[]) {
      wasm.clear_boxes();
      const box = new THREE.Box3();

      for (let i = 0; i < objects.length; i++) {
        const obj = objects[i]!;
        if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
        box.copy(obj.geometry.boundingBox!).applyMatrix4(obj.matrixWorld);

        wasm.add_box(
          box.min.x, box.min.y, box.min.z,
          box.max.x, box.max.y, box.max.z,
          i
        );
      }
    },

    raycast(raycaster: THREE.Raycaster): { hitIndex: number; distance: number } | null {
      const ray = raycaster.ray;

      // Pass ray origin and normalized direction directly to C
      const hitId = wasm.query_ray(
        ray.origin.x, ray.origin.y, ray.origin.z,
        ray.direction.x, ray.direction.y, ray.direction.z
      );

      if (hitId < 0) return null;

      return {
        hitIndex: Math.floor(hitResultView[0]!),
        distance: hitResultView[1]!,
      };
    },
  };
}

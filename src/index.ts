import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { PwaManager } from "./pwa";
import "./index.css";

const root = document.querySelector<HTMLDivElement>("#root")!;
root.innerHTML = `
<main>
  <header>
    <div class="header-left">
      <span>FIELD NOTES / 01</span>
      <span id="pwa-status" class="pwa-badge" role="status" style="display: none;"></span>
    </div>
    <div class="header-right">
      <button id="pwa-install-btn" class="pwa-install-btn" type="button" style="display: none;" aria-label="Install App">Install App ⇣</button>
      <span>C + WEBASSEMBLY + THREE.JS</span>
    </div>
  </header>
  <section class="intro">
    <div>
      <p class="eyebrow">A STUDY IN COMPUTATION</p>
      <h1>Terrain,<br><em>from first principles.</em></h1>
    </div>
    <p class="description">A landscape shaped by C, rendered in your browser. Adjust the surface detail and explore the geometry.</p>
  </section>
  <section class="viewport" aria-label="Interactive procedural terrain">
    <div id="scene"></div>
    <div class="overlay">
      <span>PROCEDURAL STUDY</span>
      <span>129 × 129 VERTICES</span>
    </div>
    <p class="hint">DRAG TO ORBIT · SCROLL TO ZOOM</p>
    <p id="status" role="status">Preparing landscape…</p>
  </section>
  <section class="controls">
    <div>
      <p class="eyebrow">01 / SURFACE</p>
      <h2>Shape the landscape</h2>
      <p>Height values are generated in one WebAssembly call, then passed to a Three.js buffer geometry.</p>
    </div>
    <div class="control">
      <label for="detail">Surface detail <output id="value">0.6</output></label>
      <input id="detail" type="range" min="0" max="2" step="0.1" value="0.6">
      <div class="range-labels">
        <span>SMOOTH</span>
        <span>TEXTURED</span>
      </div>
    </div>
  </section>
  <footer>
    <span>BUILT WITH C &amp; WEBASSEMBLY · PWA READY</span>
    <span>AN INTERACTIVE EXPERIMENT ↗</span>
  </footer>
</main>
`;

// Initialize PWA Manager for install prompt and network awareness
new PwaManager({
  installButtonId: "pwa-install-btn",
  networkStatusId: "pwa-status",
});

async function start() {
  const response = await fetch(`${import.meta.env.BASE_URL}terrain.wasm`);
  if (!response.ok) throw new Error("Could not load the WebAssembly module.");
  const { instance } = await WebAssembly.instantiate(await response.arrayBuffer());
  const wasm = instance.exports as unknown as {
    memory: WebAssembly.Memory;
    generate: (detail: number) => number;
  };

  const host = document.querySelector<HTMLDivElement>("#scene")!;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0xd8dfd4);
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("aria-label", "Three-dimensional terrain visualization");

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(8, 8, 11);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1, 0);
  controls.enablePan = false;
  controls.maxPolarAngle = Math.PI / 2.05;
  controls.update();

  scene.add(new THREE.HemisphereLight(0xf6f8e9, 0x556b55, 2));
  const light = new THREE.DirectionalLight(0xffffff, 2);
  light.position.set(-4, 8, 5);
  scene.add(light);

  const geometry = new THREE.PlaneGeometry(10, 10, 128, 128);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({
    color: 0x708b70,
    roughness: 0.85,
    flatShading: true,
  });
  scene.add(new THREE.Mesh(geometry, material));

  const render = () => renderer.render(scene, camera);

  const update = () => {
    const input = document.querySelector<HTMLInputElement>("#detail")!;
    document.querySelector<HTMLOutputElement>("#value")!.value = Number(input.value).toFixed(1);
    const offset = wasm.generate(Number(input.value));
    const heights = new Float32Array(wasm.memory.buffer, offset, 129 * 129);
    const position = geometry.getAttribute("position");
    for (let i = 0; i < position.count; i++) position.setY(i, heights[i]!);
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    render();
  };

  const resize = () => {
    const { clientWidth, clientHeight } = host;
    if (!clientWidth || !clientHeight) return;
    renderer.setSize(clientWidth, clientHeight);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
    render();
  };

  const observer = new ResizeObserver(resize);
  observer.observe(host);

  controls.addEventListener("change", render);
  document.querySelector("#detail")!.addEventListener("input", update);
  document.querySelector<HTMLElement>("#status")!.textContent = "";
  update();
  resize();

  window.addEventListener(
    "pagehide",
    () => {
      observer.disconnect();
      controls.dispose();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    },
    { once: true }
  );
}

start().catch(() => {
  document.querySelector<HTMLElement>("#status")!.textContent =
    "Unable to load the landscape. WebGL and WebAssembly are required.";
});

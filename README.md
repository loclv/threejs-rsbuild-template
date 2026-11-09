# Rsbuild project

## C and WebAssembly terrain example

The sample generates a 129 × 129 height field in `wasm/terrain.c` and reads it from WebAssembly memory into a Three.js geometry. The detail slider recalculates the field in one call. This illustrates batching work across the boundary; it is not a benchmark or a claim that this calculation is faster than JavaScript.

The compiled `public/terrain.wasm` is included. To rebuild it, install Clang and wasm-ld with WebAssembly target support, then run:

```sh
clang --target=wasm32 -O3 -nostdlib -Wl,--no-entry -Wl,--export-memory -o public/terrain.wasm wasm/terrain.c
```

## Progressive Web App (PWA) Support

This application is configured as a fully installable Progressive Web App with offline caching:

- Web App Manifest: Configured in `rsbuild.config.ts` (`manifest.webmanifest`) with standalone display mode, orientation, theme colors, and icons.
- Offline & Service Worker: Automated via `rsbuild-plugin-pwa` and Workbox. Pre-caches application assets and crucially `terrain.wasm`, allowing the 3D terrain simulation to run without an active internet connection.
- Install Experience: Native `beforeinstallprompt` handling with a non-intrusive "Install App" button and standalone detection.
- Adaptive Icons: Includes 192×192 and 512×512 standard icons, 512×512 maskable icon for Android adaptive launchers, SVG vector icon, and 180×180 Apple touch icon.
- Mobile Polish: Safe area insets (`env(safe-area-inset-*)`) and viewport fit configuration for notch displays and standalone window frames.

## Setup

Install the dependencies:

```bash
bun install
```

## Get started

Start the dev server, and the app will be available at [http://localhost:3000](http://localhost:3000).

```bash
bun run dev
```

Build the app for production:

```bash
bun run build
```

Preview the production build locally:

```bash
bun run preview
```

## Learn more

To learn more about Rsbuild, check out the following resources:

- [Rsbuild documentation](https://rsbuild.rs) - explore Rsbuild features and APIs.
- [Rsbuild GitHub repository](https://github.com/web-infra-dev/rsbuild) - your feedback and contributions are welcome!

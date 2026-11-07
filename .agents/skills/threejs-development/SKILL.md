---
name: threejs-development
description: Build, modify, and debug Three.js scenes and interactive 3D experiences in web applications.
---

# Three.js development

Build scenes that meet the requested visual and interaction goals while respecting the existing application architecture and supported devices. Inspect the installed Three.js version, rendering setup, dependencies, and asset pipeline before choosing APIs. This Rsbuild template may not yet have Three.js installed; add the necessary dependencies only when implementing a feature that needs them. Follow the project's TypeScript and Bun conventions.

## Scene implementation

- Choose a camera, lighting, materials, and scale for the intended composition. Keep world units and coordinate conventions consistent. Use imported assets when requested or already provided; do not add large assets without a reason.
- Import addons from the installed version's `three/addons/` paths when needed. Check the matching official documentation for version-specific APIs. Avoid mixing Three.js versions or introducing a framework such as React Three Fiber unless the project uses it or the user requests it.
- Size the renderer from its actual container, update the camera projection on resize, and cap pixel ratio when appropriate for device performance. Use `ResizeObserver` for independently sized containers and disconnect it on cleanup. Avoid relying on window dimensions for embedded canvases.
- Use one animation loop per renderer. Base movement on elapsed time rather than frame count, and stop the loop when the scene is removed. Render on demand for static scenes where practical.
- Load assets asynchronously with meaningful loading and error states. Consider asset size, compression, browser support, and color space; mark color textures appropriately and leave non-color data textures in the appropriate data color space. Use current Three.js color management and output settings for the installed version.

## Interaction and accessibility

- Translate pointer coordinates relative to the canvas bounds before raycasting. Handle pointer cancellation and cleanup; avoid intercepting ordinary page gestures unnecessarily. Configure controls and their limits to suit the experience.
- Provide keyboard-accessible alternatives and semantic DOM controls for essential actions. Give the canvas an appropriate accessible name or description, and avoid relying on 3D visuals alone to convey essential information.
- Respect reduced-motion preferences, offer an understandable static or reduced-motion experience, and avoid unnecessary continuous animation. Ensure the experience remains usable at narrow widths and with touch input.
- Handle unsupported WebGL or initialization failures with a useful fallback. Consider context loss and restoration where the application requires long-lived or resource-intensive rendering.

## Performance and lifecycle

- Profile before optimizing. Limit expensive draw calls, geometry, texture sizes, shadows, post-processing, and high pixel ratios according to the target devices. Reuse resources and use instancing for large sets of similar objects when justified.
- Track ownership of geometries, materials, textures, render targets, controls, observers, and event listeners. Dispose owned GPU resources and renderer-related resources on teardown, without disposing shared resources still in use. Remove listeners and cancel outstanding work where possible.
- Avoid per-frame allocations and state updates when they create measured pressure. Pause or reduce work when the scene is not visible when this suits the experience.

## Verify

Run the relevant TypeScript, lint, test, and build checks supported by the project. Inspect the running scene in a browser when feasible: check composition, loading and failure states, resizing, interaction, touch and keyboard access, reduced motion, and teardown or remount behavior. Check performance on representative devices for demanding scenes. Report what was actually verified and any remaining limitations.

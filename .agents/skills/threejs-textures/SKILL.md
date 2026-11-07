---
name: threejs-textures
description: Create, apply, optimize, and debug textures and material maps in Three.js scenes.
---

# Three.js textures

Inspect the installed Three.js version, renderer, materials, asset pipeline, and existing scene conventions before editing. Use the matching official Three.js documentation for version-specific APIs. Preserve existing assets and visual intent; add dependencies or assets only when the task needs them.

## Choose and prepare maps

- Choose maps for the material and desired effect: color (albedo), normal, roughness, metalness, ambient occlusion, emissive, alpha, or displacement. Check the material's supported maps and expected channels. Avoid adding maps that have no visible purpose.
- Treat color maps such as albedo and emissive as sRGB, and non-color data maps such as normal, roughness, metalness, and ambient occlusion as non-color data. Check loader and asset-format behavior before assigning color space: glTF loaders generally configure textures from the asset. Do not apply gamma correction twice.
- Check UV coordinates, seams, scale, orientation, and tiling on the actual geometry. Set wrapping before using repeated UVs, and use offset, repeat, rotation, or a UV transform when appropriate. glTF textures have different flip conventions from typical manually loaded images; follow the loader's behavior rather than changing `flipY` blindly.
- For packed maps, verify the expected channel layout and UV set. Confirm normal-map convention and adjust the normal scale or source as needed. Check transparency, alpha mode, depth behavior, and material side settings against the intended result.
- Use image generation for new raster texture assets when appropriate and authorized; otherwise use supplied or existing assets. Ensure texture usage rights and avoid replacing original sources unnecessarily.

## Load and integrate

- Use the project's asset pipeline and version-compatible loaders; handle asynchronous loading and errors. Set texture properties before first render where practical, and mark the texture or material for update when a changed property requires it.
- For glTF assets, preserve loader-provided material settings unless the requested change requires an override. When replacing a map, match its color space, UV channel, transform, and orientation as appropriate.
- Use appropriate lighting and environment maps to assess physically based materials. Diagnose dark, washed-out, mirrored, stretched, or missing textures by checking lighting, color space, UVs, loading errors, material maps, and renderer settings before changing unrelated code.

## Performance and ownership

- Match resolution to visible detail and target hardware. Consider mipmaps, filtering, anisotropy, and GPU memory; test from both near and far. Use GPU-compressed textures such as KTX2 when the asset pipeline and target devices justify their complexity, configuring the loader for the active renderer.
- Reuse texture instances where settings permit. If shared instances need different transforms or sampling settings, manage separate instances deliberately. Dispose textures when their owner no longer needs them, and do not dispose shared resources still in use. Disposing a material does not dispose its textures.
- For dynamically updated canvas, video, or data textures, use the appropriate texture type, update only when needed, and release associated resources and event listeners during teardown.

## Verify

Run relevant project checks and inspect the result in a browser when feasible. Test loading and failure states, UV seams and orientation, lighting and color, near and distant views, resizing, and representative devices. Check the console and resource lifecycle when changing loaders or dynamically created textures. Report the checks actually performed and any remaining limitations.

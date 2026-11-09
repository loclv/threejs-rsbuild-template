import { defineConfig } from "@rsbuild/core";
import { pluginTailwindcss } from "@rsbuild/plugin-tailwindcss";
import { pluginPWA } from "rsbuild-plugin-pwa";

// Docs: https://rsbuild.rs/config/
export default defineConfig({
  html: {
    title: "Terrain 3D – C & Three.js Study",
    meta: {
      description:
        "Interactive 3D procedural terrain generated in C WebAssembly and rendered in Three.js.",
      viewport:
        "width=device-width, initial-scale=1.0, maximum-scale=5.0, viewport-fit=cover",
      "apple-mobile-web-app-capable": "yes",
      "apple-mobile-web-app-status-bar-style": "black-translucent",
      "apple-mobile-web-app-title": "Terrain 3D",
    },
  },
  plugins: [
    pluginTailwindcss(),
    pluginPWA({
      htmlTags: {
        themeColor: "#d8dfd4",
        appleTouchIcon: {
          href: "/apple-touch-icon.png",
          sizes: "180x180",
        },
        icon: [
          { href: "/favicon.png", type: "image/png" },
          { href: "/icon.svg", type: "image/svg+xml" },
        ],
      },
      webAppManifest: {
        filename: "manifest.webmanifest",
        content: {
          name: "Terrain 3D – C & Three.js",
          short_name: "Terrain 3D",
          description:
            "Interactive 3D procedural terrain generated in C WebAssembly and rendered with Three.js.",
          start_url: "/",
          scope: "/",
          display: "standalone",
          background_color: "#d8dfd4",
          theme_color: "#2c3b2d",
          orientation: "any",
          categories: ["graphics", "entertainment", "utilities"],
          icons: [
            {
              src: "/icon-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "/icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "/icon-maskable.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
      },
      sw: {
        mode: "generateSw",
        include: (assets) => [
          ...assets,
          "**/*.wasm",
          "**/*.png",
          "**/*.svg",
          "manifest.webmanifest",
        ],
        workboxOptions: {
          skipWaiting: true,
          clientsClaim: true,
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.endsWith(".wasm"),
              handler: "CacheFirst",
              options: {
                cacheName: "wasm-cache-v1",
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                },
              },
            },
            {
              urlPattern: ({ request }) => request.destination === "image",
              handler: "CacheFirst",
              options: {
                cacheName: "images-cache-v1",
                expiration: {
                  maxEntries: 30,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
              },
            },
          ],
        },
      },
    }),
  ],
});

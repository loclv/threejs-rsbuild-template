---
name: pwa
description: Design, implement, audit, and troubleshoot Progressive Web Apps (PWAs). Use when adding or configuring Web App Manifests, Service Workers, offline caching strategies, background sync, web push, install prompts and display modes, iOS Safari PWA compatibility, update flows, or auditing Lighthouse PWA metrics.
---

# Progressive Web Apps (PWA)

A comprehensive guide for building production-ready, installable Progressive Web Apps with offline resilience, predictable service worker lifecycles, and native operating system integration.

## Initial Response

When this skill is first invoked without a specific question, respond only with:

>I'm ready to help you design, build, and optimize Progressive Web Apps (PWAs) with modern service workers, offline-first architectures, install flows, and platform integrations.

Do not provide any other information until the user asks a question or presents a task.

## 1. Core Architecture & Requirements

To qualify as an installable PWA with reliable offline capabilities, an application must satisfy:

1. Secure Context: Served over HTTPS (or `localhost` during development).
2. Web App Manifest: A valid JSON manifest linked via `<link rel="manifest" href="/manifest.webmanifest">` containing identity, icons, start URL, and display mode.
3. Service Worker: An active worker registered with a fetch handler that provides offline fallback or precached shell loading.
4. Responsive & Mobile-Ready: Configured viewport meta tag (`viewport-fit=cover`) and touch-friendly interface accommodating safe-area insets.
5. Cache-Control Architecture: Correct server headers preventing stale service worker files (`no-cache` on `/sw.js`) while leveraging long-term immutable caches for hashed assets.

## 2. Web App Manifest Specification

Use the standard extension `.webmanifest` (or `.json`) served with MIME type `application/manifest+json`.

### Production Manifest Template

```json
{
  "id": "/?source=pwa",
  "name": "Full Application Name",
  "short_name": "App",
  "description": "High-performance offline-first web application.",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "display_override": ["window-controls-overlay", "standalone", "minimal-ui"],
  "orientation": "any",
  "background_color": "#0c0a20",
  "theme_color": "#0c0a20",
  "categories": ["utilities", "games", "productivity"],
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/maskable-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ],
  "screenshots": [
    {
      "src": "/screenshots/gameplay-wide.jpg",
      "sizes": "1920x1080",
      "type": "image/jpeg",
      "form_factor": "wide",
      "label": "Desktop view"
    },
    {
      "src": "/screenshots/home-mobile.jpg",
      "sizes": "750x1334",
      "type": "image/jpeg",
      "form_factor": "narrow",
      "label": "Mobile screen"
    }
  ],
  "shortcuts": [
    {
      "name": "Play Now",
      "short_name": "Play",
      "description": "Start a run immediately",
      "url": "/?autostart=1",
      "icons": [{ "src": "/icons/icon-192.png", "sizes": "192x192" }]
    }
  ]
}
```

### Manifest Critical Rules

- Icon Masking: Always provide both `any` and `maskable` icons. For maskable icons, scale artwork so important graphics stay within the central 80% safe zone circle (radius 40% of canvas dimension) with the theme background color filling the edges.
- Short Name Length: Keep `short_name` at or below 12 characters to prevent truncation on mobile home screens.
- Rich Install UI: Providing both `description` and `screenshots` (at least one `wide` and one `narrow`) enables the rich install dialog on Chrome desktop and Android instead of a minimal banner.
- Stable ID: Provide an explicit `id` (e.g. `/?source=pwa`) so that query parameter variations do not cause the browser to treat the app as a separate installation.

## 3. Server HTTP Headers & Caching Strategy

The service worker file itself must never be cached permanently by the browser, or updates will fail to reach users.

### Cloudflare Pages / Static Hosting (`public/_headers`)

```http
/sw.js
  Cache-Control: no-cache

/manifest.webmanifest
  Content-Type: application/manifest+json
  Cache-Control: public, max-age=3600

/icons/*
  Cache-Control: public, max-age=604800

/screenshots/*
  Cache-Control: public, max-age=604800

/assets/*.js
  Cache-Control: public, max-age=31536000, immutable

/assets/*.css
  Cache-Control: public, max-age=31536000, immutable
```

## 4. Build-Time Precache Injection (Custom Vite Plugin)

While third-party libraries (e.g. Workbox plugins) exist, a zero-dependency Vite build plugin provides absolute control over the precached asset manifest, content hashing, and dev-mode isolation.

### `vite.config.ts` Plugin Implementation

```typescript
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const PRECACHE_EXCLUDE = [
  /^sw\.js$/,
  /^_headers$/,
  /^screenshots\//,
  /\.map$/,
  /(^|\/)\.DS_Store$/,
];

function listFiles(dir: string, base = ''): string[] {
  return fs
    .readdirSync(path.join(dir, base), { withFileTypes: true })
    .flatMap((entry) => {
      const relative = base ? `${base}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return listFiles(dir, relative);
      return relative;
    });
}

function pwaServiceWorker(): Plugin {
  let root = process.cwd();
  let outDir = 'dist';

  return {
    name: 'pwa-service-worker',
    apply: 'build', // Only run during production build
    configResolved(config) {
      root = config.root;
      outDir = config.build.outDir;
    },
    closeBundle() {
      const buildDir = path.resolve(root, outDir);
      const templatePath = path.resolve(root, 'public/sw.js');
      const template = fs.readFileSync(templatePath, 'utf8');

      const files = listFiles(buildDir)
        .filter((file) => !PRECACHE_EXCLUDE.some((pattern) => pattern.test(file)))
        .sort();

      // Hash both template code and bundled assets so strategy changes or asset changes update the build ID
      const hash = createHash('sha256');
      hash.update(template);
      for (const file of files) {
        hash.update(file);
        hash.update(fs.readFileSync(path.join(buildDir, file)));
      }
      const buildId = hash.digest('hex').slice(0, 12);

      const precache = files.map((file) => `/${file}`);
      const serviceWorker = template
        .replaceAll('__PRECACHE_MANIFEST__', JSON.stringify(precache))
        .replaceAll('__BUILD_ID__', buildId);

      fs.writeFileSync(path.join(buildDir, 'sw.js'), serviceWorker);
    },
  };
}
```

## 5. Production Service Worker Architecture (`public/sw.js`)

A bulletproof service worker must distinguish between first install (which should activate immediately) and subsequent updates (which must wait so active user tasks or game sessions are not disrupted).

```javascript
/* public/sw.js - Template injected at build time */
const BUILD_ID = '__BUILD_ID__';
const PRECACHE_URLS = __PRECACHE_MANIFEST__;

const CACHE_PREFIX = 'app-cache';
const SHELL_CACHE = `${CACHE_PREFIX}-shell-${BUILD_ID}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime`;
const MAX_RUNTIME_ENTRIES = 100;
const NAVIGATION_TIMEOUT_MS = 3500;
const OFFLINE_FALLBACK = '/index.html';

const CACHEABLE_CROSS_ORIGIN_HOSTS = new Set([
  'www.gstatic.com',
  'cdn.jsdelivr.net',
]);

// 1. Install: Precache shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          const response = await fetch(new Request(url, { cache: 'reload' }));
          if (!response.ok) throw new Error(`Precache failed: ${url} (HTTP ${response.status})`);
          await cache.put(url, response);
        }),
      );

      // First install takes over immediately; updates wait for user confirmation
      if (!self.registration.active) {
        await self.skipWaiting();
      }
    })(),
  );
});

// 2. Activate: Clean up older shell caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(`${CACHE_PREFIX}-shell-`) && key !== SHELL_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

// 3. User update message listener
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 4. Fetch routing
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Navigations: Network-first with timeout, fallback to precached shell
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  // Same-origin hashed assets: Cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Whitelisted cross-origin resources (e.g. 3D decoders, fonts)
  if (CACHEABLE_CROSS_ORIGIN_HOSTS.has(url.hostname)) {
    event.respondWith(cacheFirst(request));
  }
});

async function handleNavigation(request) {
  const cachedShell = (await caches.match(OFFLINE_FALLBACK)) || (await caches.match('/'));
  try {
    const response = await withTimeout(fetch(request), NAVIGATION_TIMEOUT_MS);
    if (response && response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(OFFLINE_FALLBACK, response.clone()).catch(() => {});
      return response;
    }
    return cachedShell || response;
  } catch {
    return cachedShell || offlineFallbackResponse();
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && (response.ok || response.type === 'opaque')) {
      const cache = await caches.open(RUNTIME_CACHE);
      await cache.put(request, response.clone());
      trimCache(RUNTIME_CACHE, MAX_RUNTIME_ENTRIES).catch(() => {});
    }
    return response;
  } catch {
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key)));
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

function offlineFallbackResponse() {
  return new Response(
    '<!doctype html><html><body style="font-family:system-ui;text-align:center;padding:3rem">' +
    '<h1>Offline</h1><p>Please reconnect once to load the app.</p></body></html>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
```

## 6. Runtime Store & Early Lifecycle (`src/pwa/store.ts`)

Early binding is essential: attach `beforeinstallprompt` listeners in `initPwa()` before React mounts in `main.tsx` so early browser events are never missed. Use `useSyncExternalStore` for React reactivity without tearing.

```typescript
// src/pwa/store.ts
import { useSyncExternalStore } from 'react';
import { isIosPlatform, isStandaloneMode } from './platform.ts';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface PwaState {
  canInstall: boolean;
  isInstalled: boolean;
  isIos: boolean;
  isOnline: boolean;
  updateReady: boolean;
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

const isBrowser = typeof window !== 'undefined';
const listeners = new Set<() => void>();

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let registration: ServiceWorkerRegistration | null = null;
let registering: Promise<void> | null = null;
let updateRequested = false;
let lastUpdateCheck = 0;
let initialized = false;

function readStandalone(): boolean {
  if (!isBrowser) return false;
  const matchesDisplayMode =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  const navStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
  return isStandaloneMode(matchesDisplayMode, navStandalone);
}

function readIsIos(): boolean {
  if (!isBrowser || readStandalone()) return false;
  return isIosPlatform(navigator.userAgent, navigator.maxTouchPoints);
}

let state: PwaState = {
  canInstall: false,
  isInstalled: isBrowser ? readStandalone() : false,
  isIos: readIsIos(),
  isOnline: isBrowser ? navigator.onLine : true,
  updateReady: false,
};

function updateState(patch: Partial<PwaState>): void {
  let changed = false;
  for (const key of Object.keys(patch) as (keyof PwaState)[]) {
    if (state[key] !== patch[key]) {
      changed = true;
      break;
    }
  }
  if (!changed) return;
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): PwaState {
  return state;
}

async function registerServiceWorker(): Promise<void> {
  if (registering || !('serviceWorker' in navigator) || !import.meta.env.PROD) return;

  registering = (async () => {
    try {
      registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

      if (registration.waiting && navigator.serviceWorker.controller) {
        updateState({ updateReady: true });
      }

      registration.addEventListener('updatefound', () => {
        const installing = registration?.installing;
        if (!installing) return;

        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            updateState({ updateReady: true });
          }
        });
      });

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // Guard: Never reload on first install, only when the user explicitly confirmed an update
        if (updateRequested) {
          updateRequested = false;
          window.location.reload();
        }
      });

      // Periodically check for updates when returning to the tab
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || !registration) return;
        if (Date.now() - lastUpdateCheck < 30 * 60 * 1000) return; // 30 min throttle
        lastUpdateCheck = Date.now();
        registration.update().catch(() => {});
      });
    } catch (error) {
      console.warn('[pwa] Registration failed:', error);
    }
  })();

  await registering;
}

export function initPwa(): void {
  if (!isBrowser || initialized) return;
  initialized = true;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    updateState({ canInstall: true });
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    updateState({ canInstall: false, isInstalled: true });
  });

  window.addEventListener('online', () => updateState({ isOnline: true }));
  window.addEventListener('offline', () => updateState({ isOnline: false }));

  if (typeof window.matchMedia === 'function') {
    window.matchMedia('(display-mode: standalone)').addEventListener?.('change', () => {
      updateState({ isInstalled: readStandalone() });
    });
  }

  if (import.meta.env.PROD) {
    if (document.readyState === 'complete') {
      void registerServiceWorker();
    } else {
      window.addEventListener('load', () => void registerServiceWorker(), { once: true });
    }
  }

  // Best-effort storage persistence
  navigator.storage?.persist?.().catch(() => {});
}

export async function promptPwaInstall(): Promise<InstallOutcome> {
  if (!deferredPrompt) return 'unavailable';
  const prompt = deferredPrompt;
  deferredPrompt = null;

  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    updateState({ canInstall: false, isInstalled: choice.outcome === 'accepted' });
    return choice.outcome;
  } catch {
    updateState({ canInstall: false });
    return 'unavailable';
  }
}

export function applyPwaUpdate(): void {
  if (!registration) {
    window.location.reload();
    return;
  }
  updateRequested = true;
  updateState({ updateReady: false });

  if (registration.waiting) {
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  } else {
    window.location.reload();
  }
}

export function usePwa() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    ...snapshot,
    install: promptPwaInstall,
    applyUpdate: applyPwaUpdate,
  };
}
```

## 7. Platform Detection Helpers (`src/pwa/platform.ts`)

Keep platform helpers pure and DOM-free for straightforward Node/browser unit testing:

```typescript
// src/pwa/platform.ts

/**
 * iOS/iPadOS detection.
 * iPadOS 13+ reports 'Macintosh' in userAgent, so touch support (maxTouchPoints > 1)
 * distinguishes an iPad from a desktop Mac.
 */
export function isIosPlatform(userAgent: string, maxTouchPoints = 0): boolean {
  if (/iphone|ipad|ipod/i.test(userAgent)) return true;
  return maxTouchPoints > 1 && /macintosh/i.test(userAgent);
}

/**
 * Checks if the application is running in standalone mode (installed PWA)
 * vs a standard browser tab.
 */
export function isStandaloneMode(
  matchesStandaloneDisplayMode: boolean,
  navigatorStandalone = false,
): boolean {
  return matchesStandaloneDisplayMode || navigatorStandalone;
}
```

## 8. UI Components (Install, Update, & Offline Status)

### Install Button with iOS Instructions Fallback

```tsx
// src/components/PwaInstallButton.tsx
import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';
import { usePwa } from '../pwa/store.ts';

export const PwaInstallButton = () => {
  const { canInstall, isInstalled, isIos, install } = usePwa();
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if (!showIosHint) return;
    const timer = window.setTimeout(() => setShowIosHint(false), 12000);
    return () => window.clearTimeout(timer);
  }, [showIosHint]);

  if (isInstalled || (!canInstall && !isIos)) return null;

  const handleClick = async () => {
    if (canInstall) {
      const outcome = await install();
      if (outcome === 'accepted') return;
    }
    if (isIos) setShowIosHint(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl min-h-[44px] min-w-[44px] text-xs font-bold"
        aria-label="Install App"
      >
        <Download className="w-4 h-4" />
        <span>Install</span>
      </button>

      {showIosHint && (
        <div role="status" className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 p-3 rounded-2xl bg-slate-900 border border-amber-400 text-xs">
          <button type="button" onClick={() => setShowIosHint(false)} className="absolute right-2 top-2">
            <X className="w-3.5 h-3.5" />
          </button>
          <p>📲 Tap Share (square with arrow) then select <strong>Add to Home Screen</strong>.</p>
        </div>
      )}
    </>
  );
};
```

### Non-Intrusive In-Game Update Banner

```tsx
// src/components/PwaUpdatePrompt.tsx
import { RefreshCw } from 'lucide-react';
import { usePwa } from '../pwa/store.ts';

export const PwaUpdatePrompt = () => {
  const { updateReady, applyUpdate } = usePwa();
  if (!updateReady) return null;

  return (
    <aside className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 border border-amber-400 text-amber-200 text-xs font-semibold shadow-lg">
      <span>A new update is available.</span>
      <button
        type="button"
        onClick={applyUpdate}
        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-400 text-slate-950 font-bold hover:bg-amber-300"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        <span>Update</span>
      </button>
    </aside>
  );
};
```

## 9. Icon Generation Script (`scripts/generate-pwa-icons.sh`)

Automate icon generation to guarantee correct dimensions and the maskable safe zone (scaled to 78–80% canvas width centered on background):

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/public/icons"
mkdir -p "$OUT"

# 1. Any icon: 92% scale of base art
# 2. Maskable icon: 78% scale centered inside 80% safe zone circle with theme background
# Render using sips/qlmanage (macOS) or ImageMagick/sharp
```

## 10. Automated Testing & Verification

Unit test manifest files and platform helpers before shipping:

```typescript
// src/pwa/manifest.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));

function pngSize(filePath: string): { width: number; height: number } {
  const buffer = readFileSync(filePath);
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG');
  // IHDR chunk offsets in PNG format
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test('manifest has valid identity and standalone display', () => {
  assert.ok(manifest.name.length > 0);
  assert.ok(manifest.short_name.length > 0 && manifest.short_name.length <= 12);
  assert.equal(manifest.display, 'standalone');
  assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i);
});

test('manifest icons exist on disk with declared pixel dimensions', () => {
  for (const icon of manifest.icons) {
    const filePath = `public${icon.src}`;
    assert.ok(existsSync(filePath), `Missing icon: ${icon.src}`);
    if (icon.type === 'image/png') {
      const [w, h] = icon.sizes.split('x').map(Number);
      assert.deepEqual(pngSize(filePath), { width: w, height: h });
    }
  }
});
```

### Verification Commands

```bash
bun run test # Runs unit tests (manifest + platform detection)
bun run build # Compiles production bundle & emits dist/sw.js
bun run preview # Serves production build for offline & install testing
```

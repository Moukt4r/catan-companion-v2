import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";

const base = process.env.VITE_BASE_PATH ?? "/";
const contentSecurityPolicy =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'";

export default defineConfig({
  base,
  plugins: [
    {
      name: "production-content-security-policy",
      apply: "build",
      transformIndexHtml() {
        return [
          {
            tag: "meta",
            attrs: {
              "http-equiv": "Content-Security-Policy",
              content: contentSecurityPolicy,
            },
            injectTo: "head-prepend",
          },
        ];
      },
    },
    react(),
    VitePWA({
      base,
      registerType: "prompt",
      includeAssets: ["favicon.svg", "pwa-192x192.png", "pwa-512x512.png"],
      manifest: {
        name: "Catan Table Companion",
        short_name: "Catan Companion",
        description:
          "A local-first shared-screen companion for CATAN with Cities & Knights.",
        start_url: base,
        scope: base,
        display: "standalone",
        orientation: "any",
        background_color: "#f7f2e8",
        theme_color: "#17324d",
        icons: [
          {
            src: `${base}pwa-192x192.png`,
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: `${base}pwa-512x512.png`,
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: `${base}pwa-512x512.png`,
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
        // Sound-pack assets are precached deliberately. The whole Hearth pack is
        // ~143 KB, and the app promises to work offline after the first load,
        // so leaving the cues to the HTTP cache made the pack silently fall
        // back to synthesized audio once that cache expired.
        globPatterns: ["**/*.{js,css,html,svg,png,webp,webmanifest,opus}"],
        globIgnores: ["**/world-events/*.webp"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.pathname.includes("/world-events/") &&
              url.pathname.endsWith(".webp"),
            handler: "CacheFirst",
            options: {
              cacheName: "world-event-art-v1",
              cacheableResponse: { statuses: [0, 200] },
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
          {
            // A safety net for packs added after this service worker was built,
            // and for any cue the precache misses.
            urlPattern: ({ url }) =>
              url.pathname.includes("/sfx/") && url.pathname.endsWith(".opus"),
            handler: "CacheFirst",
            options: {
              cacheName: "sound-pack-v1",
              cacheableResponse: { statuses: [0, 200] },
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  test: {
    environment: "jsdom",
    // Hosted CI runners are several times slower than a dev machine, and v8
    // coverage instrumentation slows things further. Board generation runs a
    // repair pass and a polish pass over many boards, so the generation-heavy
    // suites sit well past the five-second default there while finishing in
    // seconds locally. Give every test the same headroom rather than sprinkling
    // per-test overrides that only get noticed after CI fails.
    testTimeout: 30_000,
    exclude: [...configDefaults.exclude, "e2e/**"],
    setupFiles: ["./src/test/setup.ts"],
    css: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/main.tsx",
        "src/vite-env.d.ts",
        "src/test/**",
        "src/**/index.ts",
        "src/domain/types.ts",
        "src/application/control.ts",
        "src/application/storage.ts",
        "src/app/App.tsx",
        "src/app/AppErrorBoundary.tsx",
        "src/app/gameController.ts",
        "src/app/useDevicePreferences.ts",
        "src/app/useGameController.ts",
        "src/app/useOnlineStatus.ts",
      ],
      thresholds: {
        statements: 85,
        branches: 85,
        functions: 85,
        lines: 85,
        "src/domain/**": {
          statements: 95,
          branches: 95,
        },
        "src/application/**": {
          branches: 90,
        },
      },
    },
  },
});

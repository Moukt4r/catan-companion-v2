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
        globPatterns: ["**/*.{js,css,html,svg,png,webp,webmanifest}"],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  test: {
    environment: "jsdom",
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

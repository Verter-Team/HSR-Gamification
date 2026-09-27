// Сборка Vite + PWA: service worker кеширует оболочку приложения, чтобы тренажёр открывался без сети
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const engine = fileURLToPath(new URL('../../packages/scenario-engine/src/index.ts', import.meta.url));
const apiTarget = process.env.API_PROXY ?? 'http://127.0.0.1:3000';

export default defineConfig({
  resolve: { alias: { '@vsm/scenario-engine': engine } },
  server: {
    host: true,
    fs: { allow: ['../..'] },
    proxy: { '/api': { target: apiTarget, changeOrigin: true, rewrite: (path) => path.replace(/^\/api/, '') } },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'Тренажёр проводника ВСМ',
        short_name: 'ВСМ Тренажёр',
        description: 'Рабочие ситуации проводника высокоскоростной магистрали: решения на время, разбор, уровни и взаимная проверка',
        lang: 'ru',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0B1026',
        theme_color: '#0B1026',
        icons: [
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: { cacheName: 'fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
});

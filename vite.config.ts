import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: process.env.GITHUB_ACTIONS === 'true' ? '/closet-index/' : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Closet Index',
        short_name: 'Closet',
        description: '과거에 검증한 착장을 오늘의 조건에 맞춰 다시 찾는 개인용 Lookbook',
        theme_color: '#ffffff',
        background_color: '#f6f6f4',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        lang: 'ko',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
          {
            src: 'apple-touch-icon.png',
            sizes: '1254x1254',
            type: 'image/png',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/auth\//],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
})

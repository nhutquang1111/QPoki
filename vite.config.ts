import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,wav,ogg,oga,mp3}']
      },
      manifest: {
        name: 'TinyExplorers - Khu vườn khám phá',
        short_name: 'TinyExplorers',
        description: 'Trò chơi phản xạ và nhận biết dành cho trẻ mầm non',
        lang: 'vi',
        start_url: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#faf7ef',
        theme_color: '#faf7ef',
        icons: [
          { src: '/pwa-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: '/pwa-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      }
    })
  ]
})

import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => ({
  plugins: [vue(), mode !== 'production' && vueDevTools(), tailwindcss()].filter(Boolean),
  resolve: {
    preserveSymlinks: true,
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@core': fileURLToPath(new URL('./core', import.meta.url)),
      '@widgets-core': fileURLToPath(new URL('../widgets/core', import.meta.url)),
      '@pulse': fileURLToPath(new URL('./pulse', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    allowedHosts: ['nucleus.home', 'server.tail874d1f.ts.net'],

    watch: {
      usePolling: true,
      interval: 100,
    },
  },
}))

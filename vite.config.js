import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'
import svgLoader from 'vite-svg-loader'

export default defineConfig(({ mode }) => ({
  plugins: [vue(), mode !== 'production' && vueDevTools(), tailwindcss(), svgLoader({
    defaultImport: 'url',
    svgo: true,
    svgoConfig: {
      plugins: [{ name: 'preset-default', params: { overrides: { removeViewBox: false, convertColors: false } } }],
    },
  })].filter(Boolean),
  css: {
    transformer: 'lightningcss',
    lightningcss: {
      // Concrete versions so Lightning CSS actually vendor-prefixes (e.g. adds
      // -webkit-backdrop-filter for Safari while keeping the standard property
      // for Firefox/Chrome). Open-ended "safari >= 15" ranges resolve to an
      // empty target set, which silently disables prefixing.
      targets: {
        safari: (15 << 16) | (4 << 8),
        ios_saf: (15 << 16) | (4 << 8),
        firefox: 103 << 16,
        chrome: 90 << 16,
        edge: 90 << 16,
      },
    },
  },
  build: {
    cssMinify: 'lightningcss',
    // three.js (~500kB, pulled in by the particle logo) is the one genuinely
    // large dep and changes rarely; nudge the size warning above it so a clean
    // build isn't noisy about an intentional vendor chunk.
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        // Give three.js its own chunk so it caches independently of hub app
        // code instead of bloating (and invalidating) the main bundle on every
        // edit. Drops index from ~634kB to ~133kB.
        codeSplitting: {
          groups: [
            { name: 'three', test: /[\\/]node_modules[\\/]three[\\/]/ },
          ],
        },
      },
    },
  },
  resolve: {
    preserveSymlinks: true,
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@core': fileURLToPath(new URL('./core', import.meta.url)),
      // Via the ./widgets symlink (→ repo /widgets) so it resolves both locally
      // and in the container, where widgets is mounted at /app/widgets. The
      // widget package is optional: it's only ever reached through
      // import.meta.glob, so the hub builds without it. Hub libraries (apps
      // linked at ./libs/<id>) are likewise discovered by glob — see
      // src/composables/useDashboardProvider.js.
      '@widgets-core': fileURLToPath(new URL('./widgets/core', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    allowedHosts: [process.env.NUCLEUS_HOST || 'nucleus.olm-altair.ts.net'],

    watch: {
      usePolling: true,
      interval: 100,
    },
  },
}))

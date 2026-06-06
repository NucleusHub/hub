import { defineAsyncComponent } from 'vue'

// Resolved at build time — Vite discovers all Widget.vue files automatically.
// Adding a new widget package automatically includes it here.
const widgetModules = import.meta.glob('../../widgets/*/Widget.vue')

const cache = {}

export function resolveWidget(id) {
  if (cache[id]) return cache[id]
  const key = `../../widgets/${id}/Widget.vue`
  if (!widgetModules[key]) return null
  cache[id] = defineAsyncComponent(widgetModules[key])
  return cache[id]
}

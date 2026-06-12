import { defineAsyncComponent } from 'vue'

// Resolved at build time — Vite discovers all Widget.vue files automatically.
// Adding a new widget package automatically includes it here.
const widgetModules = import.meta.glob('../../widgets/*/Widget.vue')
// Optional per-widget settings UI. A widget that sets "configurable": true in
// its manifest should ship a Config.vue alongside its Widget.vue.
const configModules = import.meta.glob('../../widgets/*/Config.vue')

const cache = {}
const configCache = {}

export function resolveWidget(id) {
  if (cache[id]) return cache[id]
  const key = `../../widgets/${id}/Widget.vue`
  if (!widgetModules[key]) return null
  cache[id] = defineAsyncComponent(widgetModules[key])
  return cache[id]
}

export function resolveWidgetConfig(id) {
  if (configCache[id]) return configCache[id]
  const key = `../../widgets/${id}/Config.vue`
  if (!configModules[key]) return null
  configCache[id] = defineAsyncComponent(configModules[key])
  return configCache[id]
}

<script setup>
import { ref, computed, watch } from 'vue'
import { usePulse } from '@pulse/composables/usePulse.js'
import { useDashboard } from '@pulse/composables/useDashboard.js'
import { useRegistry } from '@core/useRegistry.js'
import { resolveWidgetConfig } from '@/composables/useWidgets.js'
import WidgetConfigModal from '@widgets-core/components/WidgetConfigModal.vue'

// Hub wiring for the shared widget settings modal. Pulse's gear button opens it
// via usePulse().openConfig(id); this resolves the widget's Config.vue and binds
// its saved Pulse state (config + cross-app visibility) to the shared modal,
// committing on Save. The modal chrome + the "Show in" toggle live in the shared
// widget package (@widgets-core) so every app renders widgets the same way.
const { configWidgetId, closeConfig } = usePulse()
const { widgets: manifests } = useRegistry()
const { getWidgetState, setWidgetState, saveState } = useDashboard()

const manifest = computed(() => manifests.value.find(m => m.id === configWidgetId.value) || null)
const ConfigComp = computed(() => configWidgetId.value ? resolveWidgetConfig(configWidgetId.value) : null)

// Draft copies so edits aren't committed until "Save".
const config = ref({})
const visibility = ref({ scope: 'dashboard', apps: [] })

watch(configWidgetId, (id) => {
  if (!id) return
  const saved = getWidgetState(id) ?? {}
  config.value = JSON.parse(JSON.stringify(saved.config ?? {}))
  const v = saved.visibility ?? {}
  visibility.value = { scope: v.scope === 'apps' ? 'apps' : 'dashboard', apps: Array.isArray(v.apps) ? [...v.apps] : [] }
}, { immediate: true })

function save() {
  const id = configWidgetId.value
  if (id) {
    setWidgetState(id, {
      config: JSON.parse(JSON.stringify(config.value)),
      visibility: JSON.parse(JSON.stringify(visibility.value)),
    })
    saveState()
  }
  closeConfig()
}
</script>

<template>
  <WidgetConfigModal
    :show="!!configWidgetId"
    :title="manifest?.name || 'Widget'"
    :description="manifest?.description || ''"
    :config-component="ConfigComp"
    :cross-app="!!manifest?.crossApp"
    :blacklist="manifest?.crossAppBlacklist || []"
    v-model:config="config"
    v-model:visibility="visibility"
    @save="save"
    @cancel="closeConfig"
  />
</template>

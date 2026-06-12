<script setup>
import { ref, computed, watch } from 'vue'
import { usePulse } from '@pulse/composables/usePulse.js'
import { useDashboard } from '@pulse/composables/useDashboard.js'
import { useRegistry } from '@core/useRegistry.js'
import { resolveWidgetConfig } from '@/composables/useWidgets.js'

// Generic settings modal for any widget that declares `configurable: true` and
// ships a Config.vue. Pulse's gear button opens it via usePulse().openConfig(id);
// this lives in the hub because it resolves per-widget Config components.
const { configWidgetId, closeConfig } = usePulse()
const { widgets: manifests } = useRegistry()
const { getWidgetState, setWidgetState, saveState } = useDashboard()

const manifest = computed(() => manifests.value.find(m => m.id === configWidgetId.value) || null)
const ConfigComp = computed(() => configWidgetId.value ? resolveWidgetConfig(configWidgetId.value) : null)

// A draft copy so edits aren't committed until "Save".
const draft = ref({})
watch(configWidgetId, (id) => {
  if (!id) return
  const saved = getWidgetState(id)?.config ?? {}
  draft.value = JSON.parse(JSON.stringify(saved))
}, { immediate: true })

function save() {
  const id = configWidgetId.value
  if (id) {
    setWidgetState(id, { config: JSON.parse(JSON.stringify(draft.value)) })
    saveState()
  }
  closeConfig()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="cfg-fade">
      <div v-if="configWidgetId" class="fixed inset-0 z-[200] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/20 backdrop-blur-xl" @pointerdown.prevent="closeConfig" />
        <div class="relative bg-white/25 dark:bg-white/8 border border-white/50 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden" style="max-height: 85vh">
          <!-- Header -->
          <div class="px-5 pt-5 pb-4 border-b border-white/30 dark:border-white/10 shrink-0">
            <h2 class="text-base font-semibold text-slate-900 dark:text-white">{{ manifest?.name || 'Widget' }} settings</h2>
            <p v-if="manifest?.description" class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{{ manifest.description }}</p>
          </div>

          <!-- Body — the widget's own Config.vue -->
          <div class="flex-1 overflow-y-auto px-5 py-4 min-h-0">
            <component :is="ConfigComp" v-if="ConfigComp" v-model="draft" />
            <p v-else class="text-sm text-slate-500 dark:text-slate-400">This widget has no settings.</p>
          </div>

          <!-- Footer -->
          <div class="px-5 py-4 border-t border-white/30 dark:border-white/10 flex gap-2 justify-end shrink-0">
            <button
              @click="closeConfig"
              class="cursor-pointer px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
            >Cancel</button>
            <button
              @click="save"
              class="cursor-pointer px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors"
            >Save</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cfg-fade-enter-active, .cfg-fade-leave-active { transition: opacity 0.15s ease; }
.cfg-fade-enter-from, .cfg-fade-leave-to { opacity: 0; }
</style>

import { ref, computed } from 'vue'
import { useRegistry } from '@core/useRegistry.js'

const providers = import.meta.glob('../../libs/*/hub.js', { eager: true, import: 'default' })
const [providerFile, provider] = Object.entries(providers)[0] ?? []
const providerAppId = providerFile?.match(/\/([^/]+)\/hub\.js$/)?.[1] ?? null

const inertEditor = {
  active: ref(false),
  toggle() {},
  tempHidden: ref(new Set()),
  isTempHidden: () => false,
}
const inertDashboard = {
  widgets: computed(() => []),
  loading: ref(false),
  fetchState() {},
  ensureWidgets() {},
  getWidgetState: () => null,
  setWidgetState() {},
  saveState() {},
}
const SIZE_DIMS = { small: 280, medium: 360, large: 480 }
const inertWidth = (widget, size) => {
  const s = size ?? widget.size ?? 'medium'
  return widget.sizeDims?.[s] ?? SIZE_DIMS[s] ?? 360
}

export function useDashboardProvider() {
  const { disabledAppIds } = useRegistry()
  return {
    installed: !!provider,
    enabled: computed(() => !!provider && !disabledAppIds.value.has(providerAppId)),
    editor: provider ? provider.useEditor() : inertEditor,
    dashboard: provider ? provider.useDashboard() : inertDashboard,
    widgetWidth: provider?.widgetWidth ?? inertWidth,
    Overlay: provider?.Overlay ?? null,
    WidgetControls: provider?.WidgetControls ?? null,
    ConfigModal: provider?.ConfigModal ?? null,
  }
}

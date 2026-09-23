import { ref, computed } from 'vue'
import { useRegistry } from '@core/useRegistry.js'

// The hub's widget dashboard (editable layout, dashboard + orbit widgets, the
// edit overlay) is optional. A hub library — an app whose client/ has no
// vite.config, exposed to the hub as hub/libs/<appId> by infra/tool — owns it
// by shipping `client/hub.js`, default-exporting:
//
//   {
//     useEditor()    → { active, toggle, tempHidden, isTempHidden }
//     useDashboard() → { widgets, loading, fetchState, ensureWidgets,
//                        getWidgetState, setWidgetState, saveState }
//     widgetWidth(widget, size) → px
//     Overlay         component, props { manifests } — the edit-mode overlay
//     WidgetControls  component, props { widget }, emits movestart
//     ConfigModal     component — the widget settings modal (self-contained)
//   }
//
// Pulse is the reference provider (apps/pulse/client/hub.js). Only that fixed
// filename is globbed, so a missing provider costs nothing: the hub then renders
// its core UI (app buttons, account, theme) at static default positions.
const providers = import.meta.glob('../../libs/*/hub.js', { eager: true, import: 'default' })
const [providerFile, provider] = Object.entries(providers)[0] ?? []
// hub/libs/<appId>/hub.js — the link name is the provider's app id.
const providerAppId = providerFile?.match(/\/([^/]+)\/hub\.js$/)?.[1] ?? null

// Inert stand-ins used when no provider is installed — module singletons so
// every caller shares the same (empty) state.
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
    // Disabling the provider app globally (Admin) turns the whole widget system
    // off — button, overlay, dashboard + orbit widgets — while its saved layout
    // for the hub's own elements still applies.
    enabled: computed(() => !!provider && !disabledAppIds.value.has(providerAppId)),
    editor: provider ? provider.useEditor() : inertEditor,
    dashboard: provider ? provider.useDashboard() : inertDashboard,
    widgetWidth: provider?.widgetWidth ?? inertWidth,
    Overlay: provider?.Overlay ?? null,
    WidgetControls: provider?.WidgetControls ?? null,
    ConfigModal: provider?.ConfigModal ?? null,
  }
}

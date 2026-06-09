<script setup>
import { shallowRef, watch, computed, reactive, ref, defineAsyncComponent, onMounted } from 'vue'
import { APP_NAME } from '@/config.js'
import logoDark from '@/assets/nucleus-logo-transparent.png'
import logoLight from '@/assets/nucleus-logo-light-1.png'
import { LiquidGlass } from '@zaosoula/liquid-glass-vue/components'
import { useRegistry } from '@core/useRegistry.js'
import { useTheme } from '@core/useTheme.js'
import { resolveWidget } from '@/composables/useWidgets.js'
import BackgroundBlobs from '@core/BackgroundBlobs.vue'
import { usePulse } from '@pulse/composables/usePulse.js'
import { useDashboard, HUB_MANIFESTS, getWidgetWidth } from '@pulse/composables/useDashboard.js'

const PulseOverlay = defineAsyncComponent(() => import('@pulse/PulseOverlay.vue'))

const { apps, widgets: manifests, loading } = useRegistry()
const { pulseActive, togglePulse } = usePulse()
const { widgets: states, loading: dashboardLoading, fetchState, ensureWidgets, getWidgetState, setWidgetState, saveState } = useDashboard()

// All manifests passed to Pulse: registry widgets + hub pseudo-widgets
const allManifests = computed(() => [...manifests.value, ...HUB_MANIFESTS])

watch([allManifests, dashboardLoading], ([ms, dl]) => {
  if (!dl && ms.length) ensureWidgets(ms)
})

onMounted(fetchState)

const dashboardApps = computed(() =>
  apps.value.filter(a => a.hub?.showOnDashboard !== false)
)

// Regular dashboard widgets (not hub system elements)
const widgetData = computed(() => {
  const ms = manifests.value.filter(m => m.slot !== 'system' && m.slot !== 'system-hub')
  return ms.map(m => {
    const s = states.value.find(s => s.id === m.id)
    return s
      ? { ...m, ...s }
      : { ...m, enabled: m.enabled !== false, locked: false, position: { x: 20, y: 20 }, size: m.defaultSize ?? m.sizes?.[0] ?? 'medium', config: {} }
  })
})

const enabledWidgets = computed(() => widgetData.value.filter(w => w.enabled))

// Hub UI states — with sensible viewport-relative defaults before DB loads
function hubDefault(id) {
  const vw = typeof window !== 'undefined' ? window.innerWidth  : 1280
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768
  if (id === 'hub-theme') return { position: { x: Math.max(0, vw - 130), y: 16 }, size: 'small', locked: false }
  return { position: { x: Math.max(16, Math.round((vw - 340) / 2)), y: Math.max(60, Math.round((vh - 280) / 2)) }, size: 'medium', locked: false }
}

const hubTheme = computed(() => states.value.find(s => s.id === 'hub-theme') ?? hubDefault('hub-theme'))
const hubApps  = computed(() => states.value.find(s => s.id === 'hub-apps')  ?? hubDefault('hub-apps'))

// Dimensions derived from hub widget sizes
const THEME_DIMS = { small: { w: 114, h: 46 }, large: { w: 210, h: 46 } }
const APPS_DIMS  = {
  small:  { cardH: 60, padding: '10px 14px',  iconBox: 32, iconSvg: 14, innerW: 240 },
  medium: { cardH: 80, padding: '16px 20px',  iconBox: 36, iconSvg: 16, innerW: 300 },
  large:  { cardH: 90, padding: '18px 24px',  iconBox: 40, iconSvg: 18, innerW: 380 },
}

const themeDims = computed(() => THEME_DIMS[hubTheme.value.size] ?? THEME_DIMS.small)
const appsDims  = computed(() => APPS_DIMS[hubApps.value.size]   ?? APPS_DIMS.medium)
const appsCardW = computed(() => HUB_MANIFESTS.find(m => m.id === 'hub-apps').sizeDims[hubApps.value.size] ?? 340)

// LiquidGlass card refs for mouse-tracking
let cardRefs = []
const hovered = reactive({})

watch(dashboardApps, (items) => {
  cardRefs = items.map(() => shallowRef(null))
  items.forEach(item => { if (!(item.id in hovered)) hovered[item.id] = false })
}, { immediate: true })

const THEMES = [
  { key: 'light',  label: 'Light',  icon: 'M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0z' },
  { key: 'system', label: 'System', icon: 'M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0H3' },
  { key: 'dark',   label: 'Dark',   icon: 'M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998z' },
]

const { theme, isDark, setTheme } = useTheme()
const logoUrl = computed(() => isDark.value ? logoDark : logoLight)

const hubAppsSizes = HUB_MANIFESTS.find(m => m.id === 'hub-apps').sizes

function setHubAppsSize(size) {
  const ws = getWidgetState('hub-apps')
  if (ws) ws.size = size
  else setWidgetState('hub-apps', { size })
  saveState()
}
</script>

<template>
  <div class="relative min-h-screen bg-slate-100 dark:bg-[#0d0d1a] flex flex-col items-center justify-center p-4 sm:p-8 overflow-hidden">

    <BackgroundBlobs />

    <!-- Fixed widget canvas — all freely-positioned elements live here -->
    <div class="fixed inset-0 z-30 pointer-events-none">

      <!-- Regular dashboard widgets -->
      <div
        v-for="w in enabledWidgets"
        :key="w.id"
        class="pointer-events-auto"
        :style="{
          position: 'absolute',
          left:  w.position.x + 'px',
          top:   w.position.y + 'px',
          width: getWidgetWidth(w, w.size) + 'px',
        }"
      >
        <component :is="resolveWidget(w.id)" v-if="resolveWidget(w.id)" />
      </div>

      <!-- ── Theme Changer ── -->
      <div
        class="pointer-events-auto"
        :style="{
          position: 'absolute',
          left: hubTheme.position.x + 'px',
          top:  hubTheme.position.y + 'px',
          width:  themeDims.w + 'px',
          height: themeDims.h + 'px',
        }"
      >
        <LiquidGlass
          :style="{ position: 'absolute', top: '50%', left: '50%' }"
          :corner-radius="14"
          padding="5px"
          :displacement-scale="55"
          :blur-amount="0.1"
          :saturation="160"
          :elasticity="0"
        >
          <!-- Small: icons only -->
          <div v-if="hubTheme.size === 'small'" class="flex gap-0.5">
            <button
              v-for="t in THEMES"
              :key="t.key"
              @click="setTheme(t.key)"
              :title="t.label"
              :class="['cursor-pointer flex items-center justify-center w-8 h-8 rounded-lg transition-all',
                theme === t.key
                  ? 'bg-white/40 text-slate-800 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-white/55 hover:text-slate-900 dark:hover:text-white hover:bg-white/20']"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" :d="t.icon" />
              </svg>
            </button>
          </div>

          <!-- Large: icons + labels -->
          <div v-else class="flex gap-0.5">
            <button
              v-for="t in THEMES"
              :key="t.key"
              @click="setTheme(t.key)"
              :title="t.label"
              :class="['cursor-pointer flex items-center justify-center gap-1.5 px-2.5 h-8 rounded-lg transition-all text-xs font-medium',
                theme === t.key
                  ? 'bg-white/40 text-slate-800 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-white/55 hover:text-slate-900 dark:hover:text-white hover:bg-white/20']"
            >
              <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" :d="t.icon" />
              </svg>
              {{ t.label }}
            </button>
          </div>
        </LiquidGlass>
      </div>

    </div><!-- /widget canvas -->

    <!-- Pulse toggle — always fixed, outside the movable canvas -->
    <button
      class="fixed bottom-4 right-4 z-40 w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-200"
      :class="pulseActive
        ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30'
        : 'bg-black/30 dark:bg-white/8 text-white/50 hover:text-white hover:bg-black/50 backdrop-blur'"
      title="Pulse — edit dashboard"
      @click="togglePulse"
    >
      <svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round"
          d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z"
        />
      </svg>
    </button>

    <!-- Logo + title — centered in page flow -->
    <div class="relative flex flex-col items-center gap-4 text-center z-10">
      <img :src="logoUrl" alt="Nucleus" class="w-24 h-24 sm:w-28 sm:h-28 object-contain" />
      <h1 class="text-5xl sm:text-6xl font-bold tracking-tight text-slate-900 dark:text-white">{{ APP_NAME }}</h1>
      <p class="text-slate-500 dark:text-slate-400 text-sm">Your personal productivity hub</p>
    </div>

    <!-- App Buttons — page flow, resize-only in Pulse mode -->
    <div class="relative z-10 mt-6" :style="{ width: appsCardW + 'px' }">
      <!-- Pulse size toolbar — absolute so it doesn't shift the cards -->
      <Transition name="pulse-fade">
        <div v-if="pulseActive" class="absolute inset-x-0 flex justify-center" style="top: -42px;">
          <div class="hub-ctrl-bar">
            <span class="hub-ctrl-label">App Buttons</span>
            <div class="hub-ctrl-divider" />
            <button
              v-for="s in hubAppsSizes"
              :key="s"
              class="hub-ctrl-btn"
              :class="{ active: hubApps.size === s }"
              @click="setHubAppsSize(s)"
            >{{ s.charAt(0).toUpperCase() }}</button>
          </div>
        </div>
      </Transition>

      <!-- Loading skeleton -->
      <template v-if="loading">
        <div
          v-for="n in 3"
          :key="n"
          class="animate-pulse rounded-[20px] bg-white/20 dark:bg-white/5 mb-3"
          :style="{ height: appsDims.cardH + 'px' }"
        />
      </template>

      <!-- App cards -->
      <div v-else class="flex flex-col gap-3">
        <a
          v-for="(item, i) in dashboardApps"
          :key="item.id"
          :ref="el => { if (el) cardRefs[i].value = el }"
          :href="item.route + '/'"
          @mouseenter="hovered[item.id] = true"
          @mouseleave="hovered[item.id] = false"
          class="relative block cursor-pointer"
          :style="{
            height: appsDims.cardH + 'px',
            overflow: 'hidden',
            transition: 'transform 0.25s ease, box-shadow 0.25s ease',
            transform: hovered[item.id] ? 'translateY(-5px)' : 'translateY(0)',
            boxShadow: hovered[item.id] ? '0 16px 48px rgba(99,102,241,0.55)' : '0 0 0 rgba(0,0,0,0)',
            borderRadius: '20px',
          }"
        >
          <LiquidGlass
            :style="{ position: 'absolute', top: '50%', left: '50%' }"
            :corner-radius="20"
            :padding="appsDims.padding"
            :displacement-scale="70"
            :blur-amount="0.12"
            :saturation="160"
            :aberration-intensity="3"
            :elasticity="0"
            :mouse-container="cardRefs[i]"
            class="cursor-pointer"
            @click="() => {}"
          >
            <div :style="{ width: appsDims.innerW + 'px' }" class="flex items-center justify-between gap-4">
              <div class="flex items-center gap-3">
                <div
                  class="rounded-xl flex items-center justify-center shrink-0"
                  :style="{
                    width: appsDims.iconBox + 'px',
                    height: appsDims.iconBox + 'px',
                    background: hovered[item.id] ? 'rgb(99,102,241)' : 'rgba(99,102,241,0.75)',
                    transition: 'background 0.25s ease',
                  }"
                >
                  <svg
                    :style="{ width: appsDims.iconSvg + 'px', height: appsDims.iconSvg + 'px' }"
                    class="text-white" fill="none" stroke="currentColor" stroke-width="2.25" viewBox="0 0 24 24"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" :d="item.icon" />
                  </svg>
                </div>
                <div>
                  <p class="font-semibold text-slate-900 dark:text-white leading-tight"
                     :class="hubApps.size === 'small' ? 'text-sm' : ''">
                    {{ item.name }}
                  </p>
                  <p v-if="hubApps.size !== 'small'"
                     class="text-xs text-slate-500 dark:text-white/60 mt-0.5">
                    {{ item.description }}
                  </p>
                </div>
              </div>
              <svg
                class="w-4 h-4 shrink-0"
                :style="{ color: hovered[item.id] ? 'rgba(99,102,241,0.8)' : '', transition: 'color 0.25s ease' }"
                :class="hovered[item.id] ? '' : 'text-slate-400 dark:text-white/40'"
                fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          </LiquidGlass>
        </a>
      </div>
    </div>

    <!-- Pulse overlay -->
    <Teleport to="body">
      <Transition name="pulse-fade">
        <PulseOverlay v-if="pulseActive" :manifests="allManifests" />
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.pulse-fade-enter-active,
.pulse-fade-leave-active { transition: opacity 0.18s ease; }
.pulse-fade-enter-from,
.pulse-fade-leave-to     { opacity: 0; }

.hub-ctrl-bar {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  background: rgba(10, 10, 22, 0.88);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(99, 102, 241, 0.25);
}

.hub-ctrl-label {
  padding: 0 6px;
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.4);
  white-space: nowrap;
}

.hub-ctrl-divider {
  width: 1px;
  height: 16px;
  background: rgba(255, 255, 255, 0.1);
  margin: 0 2px;
  flex-shrink: 0;
}

.hub-ctrl-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.5);
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  transition: background 0.12s, color 0.12s;
}

.hub-ctrl-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
}

.hub-ctrl-btn.active {
  background: rgba(99, 102, 241, 0.5);
  color: #fff;
}
</style>

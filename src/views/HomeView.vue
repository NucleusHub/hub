<script setup>
import { shallowRef, watch, computed, reactive, ref, defineAsyncComponent, onMounted } from 'vue'
import { APP_NAME } from '@/config.js'
import { LiquidGlass } from '@zaosoula/liquid-glass-vue/components'
import { useRegistry } from '@core/useRegistry.js'
import { useTheme } from '@core/useTheme.js'
import { useI18n } from '@core/useI18n.js'
import { useAuth, getRecentProfileIds } from '@core/auth/useAuth.js'
import { resolveWidget } from '@/composables/useWidgets.js'
import BackgroundBlobs from '@core/BackgroundBlobs.vue'
import NucleusOrbit from '@/components/NucleusOrbit.vue'
import WidgetConfigModal from '@/components/WidgetConfigModal.vue'
import AppIcon from '@core/AppIcon.vue'
import AvatarCircle from '@core/auth/AvatarCircle.vue'
import ProfileSelector from '@core/auth/ProfileSelector.vue'
import { usePulse } from '@pulse/composables/usePulse.js'
import { useDashboard, HUB_MANIFESTS, getWidgetWidth } from '@pulse/composables/useDashboard.js'

const PulseOverlay = defineAsyncComponent(() => import('@pulse/PulseOverlay.vue'))

const { profile, login } = useAuth()
const showSwitch = ref(false)
// True while the Nucleus core is spread by hover (emitted by NucleusOrbit) —
// drives the background blur, which must live inside #app to blur the page.
const orbitSpread = ref(false)
const switchPreselect = ref(null)

const { apps, widgets: manifests, disabledAppIds, loading } = useRegistry()
// Pulse is the widget launcher/manager. Disabling it globally turns off the
// whole widget system (button, overlay, dashboard + orbit widgets); only the
// core hub UI (app buttons, account, theme) remains.
const pulseDisabled = computed(() => disabledAppIds.value.has('pulse'))
const { pulseActive, togglePulse, tempHidden } = usePulse()
const { widgets: states, loading: dashboardLoading, fetchState, ensureWidgets, getWidgetState, setWidgetState, saveState } = useDashboard()

// All manifests passed to Pulse: registry widgets + hub pseudo-widgets
const allManifests = computed(() => [...manifests.value, ...HUB_MANIFESTS])

watch([allManifests, dashboardLoading], ([ms, dl]) => {
  if (!dl && ms.length) ensureWidgets(ms)
})

onMounted(() => { fetchState(); loadAccountProfiles() })

// Persist a widget's self-managed config (e.g. the Echo widget remembering which
// chat is open). Debounced so rapid changes coalesce into one save.
let _widgetConfigTimer = null
function onWidgetConfig(id, config) {
  setWidgetState(id, { config })
  clearTimeout(_widgetConfigTimer)
  _widgetConfigTimer = setTimeout(saveState, 600)
}

const dashboardApps = computed(() =>
  apps.value.filter(a => a.hub?.showOnDashboard !== false)
)

// Regular dashboard widgets (not hub system elements)
const widgetData = computed(() => {
  const ms = manifests.value.filter(m => m.slot !== 'system' && m.slot !== 'system-hub' && m.slot !== 'nucleus')
  return ms.map(m => {
    const s = states.value.find(s => s.id === m.id)
    return s
      ? { ...m, ...s }
      : { ...m, enabled: m.enabled !== false, locked: false, position: { x: 20, y: 20 }, size: m.defaultSize ?? m.sizes?.[0] ?? 'medium', config: {} }
  })
})

// Temp-hidden widgets vanish from the canvas while Pulse is open; the set is
// cleared on close, so they reappear the moment edit mode ends. When Pulse is
// globally disabled, no dashboard widgets render at all.
const enabledWidgets = computed(() =>
  pulseDisabled.value ? [] : widgetData.value.filter(w => w.enabled && !tempHidden.value.has(w.id))
)

// Hub UI states — with sensible viewport-relative defaults before DB loads
function hubDefault(id) {
  const vw = typeof window !== 'undefined' ? window.innerWidth  : 1280
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768
  if (id === 'hub-account') return { position: { x: 16, y: 16 }, size: 'small', locked: false }
  if (id === 'hub-theme') return { position: { x: Math.max(0, vw - 130), y: 16 }, size: 'small', locked: false }
  return { position: { x: Math.max(16, Math.round((vw - 340) / 2)), y: Math.max(60, Math.round((vh - 280) / 2)) }, size: 'large', locked: false }
}

const hubTheme   = computed(() => states.value.find(s => s.id === 'hub-theme')   ?? hubDefault('hub-theme'))
const hubApps    = computed(() => states.value.find(s => s.id === 'hub-apps')    ?? hubDefault('hub-apps'))
const hubAccount = computed(() => states.value.find(s => s.id === 'hub-account') ?? hubDefault('hub-account'))

const effectiveAccountSize = computed(() => isMobile.value ? 'small' : (hubAccount.value.size ?? 'small'))
const effectiveAccountPos  = computed(() =>
  isMobile.value ? { x: 16, y: 8 } : hubAccount.value.position
)

// Profiles loaded for the large account widget
const accountProfiles = ref([])
async function loadAccountProfiles() {
  // picker=1: account switcher widget — guests may see the list here.
  const res = await fetch('/api/auth/profiles?picker=1', { credentials: 'include' })
  accountProfiles.value = res.ok ? await res.json() : []
}

const recentProfiles = computed(() => {
  if (!profile.value) return []
  const ids = getRecentProfileIds()
  const others = accountProfiles.value.filter(p => p._id !== profile.value._id)
  return [
    ...ids.map(id => others.find(p => p._id === id)).filter(Boolean),
    ...others.filter(p => !ids.includes(p._id)),
  ].slice(0, 2)
})

async function switchToProfile(p) {
  if (p.hasPin) {
    switchPreselect.value = p._id
    showSwitch.value = true
  } else {
    try { await login(p._id, null) } catch {}
    window.location.reload()
  }
}

// Dimensions derived from hub widget sizes
const THEME_DIMS = { small: { w: 114, h: 46 }, large: { w: null, h: 46 } }
// small/medium = icon grid; large = horizontal card list (current default)
const APPS_DIMS  = {
  small:  { iconSvg: 30 },
  medium: { iconSvg: 30 },
  large:  { cardH: 80, padding: '16px 20px', iconBox: 36, iconSvg: 16 },
}

const vw           = ref(typeof window !== 'undefined' ? window.innerWidth : 1280)
const isMobile     = computed(() => vw.value < 768)
onMounted(() => { window.addEventListener('resize', () => { vw.value = window.innerWidth }) })

// On mobile: theme changer is always small and always pinned top-right
const effectiveThemeSize = computed(() => isMobile.value ? 'small' : (hubTheme.value.size ?? 'small'))
const effectiveThemePos  = computed(() =>
  isMobile.value
    ? { x: Math.max(0, vw.value - 122), y: 8 }
    : hubTheme.value.position
)

const themeDims    = computed(() => THEME_DIMS[effectiveThemeSize.value] ?? THEME_DIMS.small)
const appsDims     = computed(() => APPS_DIMS[hubApps.value.size]   ?? APPS_DIMS.large)
// Clamp card width to viewport with some breathing room
const appsCardW    = computed(() => {
  const raw = HUB_MANIFESTS.find(m => m.id === 'hub-apps').sizeDims[hubApps.value.size] ?? 420
  return Math.min(raw, vw.value - 32)
})
// Grid layout computeds (used for small/medium — individual glass card per app)
// itemW ≈ appsCardW/4 - 10 (slightly smaller than flex slot so cards breathe)
const gridItemW    = computed(() => Math.floor(appsCardW.value / 4) - 10)
// LiquidGlass padding so icon fills card: (cardSize - iconSvg) / 2
const gridIconPad  = computed(() => Math.max(8, Math.floor((gridItemW.value - 30) / 2)) + 'px')
// medium adds label below the card: card + 4px gap + ~13px text + 3px = 20px
const gridItemH    = computed(() => hubApps.value.size === 'medium' ? gridItemW.value + 20 : gridItemW.value)
const gridRows     = computed(() => Math.ceil(Math.max(1, dashboardApps.value.length) / 4))
const gridHeight   = computed(() =>
  gridRows.value * gridItemH.value + Math.max(0, gridRows.value - 1) * 8
)

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
const { t } = useI18n()

const logoSize = ref(window.innerWidth < 640 ? 170 : 220)
const onLogoResize = () => { logoSize.value = window.innerWidth < 640 ? 170 : 220 }
onMounted(() => window.addEventListener('resize', onLogoResize))

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

    <!-- Pulse edit dim — sits at z-[5], below every widget (app buttons z-10,
         canvas z-30) but above the background + logo, so the widgets you're
         editing stay bright while the page behind them is dimmed. -->
    <div
      v-if="pulseActive && !pulseDisabled"
      class="fixed inset-0 z-[5] bg-black/20 dark:bg-black/35 pointer-events-none transition-opacity"
    />

    <!-- Backdrop blur behind the spread Nucleus core. Lives inside #app (not
         teleported) so it shares the page's backdrop root and actually blurs
         the content. z-60: above the page (canvas 30, pulse 50), below the
         lifted particle logo (70) and the orbit nodes (100). -->
    <div class="dash-blur" :class="{ on: orbitSpread }" />

    <!-- Fixed widget canvas — all freely-positioned elements live here -->
    <div class="fixed inset-0 z-30 pointer-events-none">

      <!-- Regular dashboard widgets — hidden on mobile -->
      <template v-if="!isMobile">
        <div
          v-for="w in enabledWidgets"
          :key="w.id"
          :data-pulse-id="w.id"
          class="pointer-events-auto"
          :style="{
            position: 'absolute',
            left:  w.position.x + 'px',
            top:   w.position.y + 'px',
            width: getWidgetWidth(w, w.size) + 'px',
          }"
        >
          <component :is="resolveWidget(w.id)" v-if="resolveWidget(w.id)" :size="w.size" :dark="isDark" :config="w.config" @update:config="onWidgetConfig(w.id, $event)" />
        </div>
      </template>

      <!-- ── Account Widget ── -->
      <div v-if="profile && !tempHidden.has('hub-account')"
        data-pulse-id="hub-account"
        class="pointer-events-auto"
        :style="{
          position: 'absolute',
          left: effectiveAccountPos.x + 'px',
          top:  effectiveAccountPos.y + 'px',
          width: effectiveAccountSize === 'large' ? '220px' : '40px',
        }">
        <!-- Small: avatar circle -->
        <button v-if="effectiveAccountSize === 'small'"
          @click="showSwitch = true"
          class="w-10 h-10 rounded-full opacity-75 hover:opacity-100 transition-opacity cursor-pointer"
          :title="t('core.sidebar.switchAccount')">
          <AvatarCircle :profile="profile" :size="40" />
        </button>

        <!-- Large: name + recents + manage -->
        <div v-else class="rounded-[14px] bg-white/20 dark:bg-white/[0.08] backdrop-blur-md border border-slate-300/80 dark:border-white/[0.15] overflow-hidden">
          <!-- Current profile -->
          <button @click="showSwitch = true"
            class="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/15 dark:hover:bg-white/[0.06] transition-colors cursor-pointer">
            <AvatarCircle :profile="profile" :size="32" />
            <span class="text-sm font-semibold text-slate-800 dark:text-white flex-1 text-left truncate">{{ profile.name }}</span>
            <svg class="w-3.5 h-3.5 text-slate-400 dark:text-white/40 shrink-0" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>

          <!-- Recent profiles -->
          <template v-if="recentProfiles.length">
            <div class="h-px bg-white/25 dark:bg-white/10 mx-3" />
            <button v-for="p in recentProfiles" :key="p._id"
              @click="switchToProfile(p)"
              class="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/15 dark:hover:bg-white/[0.06] transition-colors cursor-pointer">
              <AvatarCircle :profile="p" :size="26" />
              <span class="text-xs font-medium text-slate-700 dark:text-white/75 flex-1 text-left truncate">{{ p.name }}</span>
              <svg v-if="p.hasPin" class="w-2.5 h-2.5 text-violet-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 1a5 5 0 0 1 5 5v3h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h1V6a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v3h6V6a3 3 0 0 0-3-3z"/>
              </svg>
            </button>
          </template>

          <div class="h-px bg-white/25 dark:bg-white/10 mx-3" />
          <!-- Manage profiles -->
          <button @click="showSwitch = true"
            class="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-white/15 dark:hover:bg-white/[0.06] transition-colors cursor-pointer text-slate-500 dark:text-white/50 hover:text-slate-800 dark:hover:text-white">
            <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"/>
            </svg>
            <span class="text-xs font-medium">{{ t('hub.account.manageProfiles') }}</span>
          </button>
        </div>
      </div>

      <!-- ── Theme Changer ── -->
      <div
        v-if="!tempHidden.has('hub-theme')"
        data-pulse-id="hub-theme"
        class="pointer-events-auto"
        :style="{
          position: 'absolute',
          left: effectiveThemePos.x + 'px',
          top:  effectiveThemePos.y + 'px',
          width:  themeDims.w != null ? themeDims.w + 'px' : 'max-content',
          height: themeDims.h + 'px',
        }"
      >
        <div class="w-full h-full rounded-[14px] flex items-center px-[5px] gap-0.5
                    bg-white/20 dark:bg-white/[0.08] backdrop-blur-md
                    border border-slate-300/80 dark:border-white/[0.15]">
          <!-- Small: icons only -->
          <template v-if="effectiveThemeSize === 'small'">
            <button
              v-for="themeOpt in THEMES"
              :key="themeOpt.key"
              @click="setTheme(themeOpt.key)"
              :title="t(`core.theme.${themeOpt.key}`)"
              :class="['cursor-pointer flex items-center justify-center w-8 h-8 rounded-lg transition-all',
                theme === themeOpt.key
                  ? 'bg-white shadow-sm dark:bg-white/20 dark:shadow-none text-slate-800 dark:text-white'
                  : 'text-slate-600 dark:text-white/55 hover:text-slate-900 dark:hover:text-white hover:bg-white/20']"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" :d="themeOpt.icon" />
              </svg>
            </button>
          </template>
          <!-- Large: icons + labels -->
          <template v-else>
            <button
              v-for="themeOpt in THEMES"
              :key="themeOpt.key"
              @click="setTheme(themeOpt.key)"
              :title="t(`core.theme.${themeOpt.key}`)"
              :class="['cursor-pointer flex items-center justify-center gap-1.5 px-2.5 h-8 rounded-lg transition-all text-xs font-medium',
                theme === themeOpt.key
                  ? 'bg-white shadow-sm dark:bg-white/20 dark:shadow-none text-slate-800 dark:text-white'
                  : 'text-slate-600 dark:text-white/55 hover:text-slate-900 dark:hover:text-white hover:bg-white/20']"
            >
              <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" :d="themeOpt.icon" />
              </svg>
              {{ t(`core.theme.${themeOpt.key}`) }}
            </button>
          </template>
        </div>
      </div>

    </div><!-- /widget canvas -->

    <ProfileSelector v-if="showSwitch" :closeable="true" :preselected-id="switchPreselect"
      @close="showSwitch = false; switchPreselect = null" />

    <!-- Pulse toggle — always fixed, outside the movable canvas. Hidden when
         Pulse is globally disabled. -->
    <button
      v-if="!pulseDisabled"
      class="fixed bottom-4 right-4 z-40 w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-200"
      :class="pulseActive
        ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30'
        : 'bg-slate-900/10 text-slate-500 hover:text-slate-800 hover:bg-slate-900/20 dark:bg-white/8 dark:text-white/50 dark:hover:text-white dark:hover:bg-black/50 backdrop-blur'"
      :title="t('hub.pulse.editDashboard')"
      @click="togglePulse"
    >
      <svg width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round"
          d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z"
        />
      </svg>
    </button>

    <!-- Logo + title — centered in page flow. No z-index here (no stacking
         context) so the particle logo can lift itself above the orbit blur
         while the title stays behind it. -->
    <div class="relative flex flex-col items-center gap-4 text-center">
      <NucleusOrbit :size="logoSize" :dark="isDark" @spread="orbitSpread = $event" />
      <h1 class="text-5xl sm:text-6xl font-bold tracking-tight text-slate-900 dark:text-white">{{ APP_NAME }}</h1>
      <p class="text-slate-500 dark:text-slate-400 text-sm">{{ t('hub.tagline') }}</p>
    </div>

    <!-- App Buttons — page flow, resize-only in Pulse mode. z-10 keeps it above
         the pulse dim (z-[5]) so it isn't dimmed while editing. Opacity-only
         fade-in (no transform) so the per-card hover lifts stay intact. -->
    <div class="relative z-10 mt-6 nuc-in-fade" :style="{ width: appsCardW + 'px' }">
      <!-- Pulse size toolbar — absolute so it doesn't shift the cards -->
      <Transition name="pulse-fade">
        <div v-if="pulseActive && !isMobile" class="absolute inset-x-0 flex justify-center" style="top: -42px;">
          <div class="hub-ctrl-bar" :class="{ 'theme-light': !isDark }">
            <span class="hub-ctrl-label">{{ t('hub.controls.appButtons') }}</span>
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
          v-if="hubApps.size !== 'large'"
          class="animate-pulse rounded-[20px] bg-white/20 dark:bg-white/5"
          :style="{ height: gridHeight + 'px' }"
        />
        <template v-else>
          <div
            v-for="n in 3" :key="n"
            class="animate-pulse rounded-[20px] bg-white/20 dark:bg-white/5 mb-3"
            :style="{ height: appsDims.cardH + 'px' }"
          />
        </template>
      </template>

      <!-- SMALL / MEDIUM — per-item glass cards in a flex grid -->
      <template v-else-if="hubApps.size !== 'large'">
        <div
          class="flex flex-wrap justify-center"
          :style="{ width: appsCardW + 'px', gap: '8px' }"
        >
          <a
            v-for="item in dashboardApps"
            :key="item.id"
            :href="item.route + '/'"
            class="flex flex-col items-center no-underline"
            :style="{ width: gridItemW + 'px' }"
            @mouseenter="hovered[item.id] = true"
            @mouseleave="hovered[item.id] = false"
          >
            <div
              class="relative overflow-hidden"
              :class="hubApps.size === 'small' && 'border border-slate-300/80 dark:border-white/[0.15]'"
              :style="{ width: gridItemW + 'px', height: gridItemW + 'px', borderRadius: '16px' }"
            >
              <LiquidGlass
                :style="{ position: 'absolute', top: '50%', left: '50%' }"
                :corner-radius="16"
                :padding="gridIconPad"
                :displacement-scale="65"
                :blur-amount="0.12"
                :saturation="160"
                :elasticity="0"
              >
                <AppIcon
                  :svg="item.iconSvg"
                  :style="{ width: appsDims.iconSvg + 'px', height: appsDims.iconSvg + 'px' }"
                  class="transition-all duration-200 shrink-0"
                  :class="hovered[item.id]
                    ? 'text-indigo-500 dark:text-indigo-400 scale-110'
                    : 'text-slate-600 dark:text-white/70'"
                />
              </LiquidGlass>
            </div>
            <span
              v-if="hubApps.size === 'medium'"
              class="mt-1 text-[11px] font-medium text-center leading-tight truncate
                     text-slate-700/80 dark:text-white/75"
              :style="{ width: gridItemW + 'px' }"
            >{{ item.name }}</span>
          </a>
        </div>
      </template>

      <!-- LARGE — horizontal card list (one LiquidGlass per app) -->
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
            <div :style="{ width: (appsCardW - 40) + 'px' }" class="flex items-center justify-between gap-4">
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
                  <AppIcon
                    :svg="item.iconSvg"
                    :style="{ width: appsDims.iconSvg + 'px', height: appsDims.iconSvg + 'px' }"
                    class="text-white"
                  />
                </div>
                <div>
                  <p class="font-semibold text-slate-900 dark:text-white leading-tight">{{ item.name }}</p>
                  <p class="text-xs text-slate-500 dark:text-white/60 mt-0.5">{{ item.description }}</p>
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
        <PulseOverlay v-if="pulseActive && !pulseDisabled" :manifests="allManifests" />
      </Transition>
    </Teleport>

    <!-- Widget settings modal (opened from a widget's Pulse gear button) -->
    <WidgetConfigModal />
  </div>
</template>

<style scoped>
.dash-blur {
  position: fixed;
  inset: 0;
  z-index: 60;
  pointer-events: none;
  opacity: 0;
  background: rgba(8, 8, 16, 0.06);
  backdrop-filter: blur(6px);
  transition: opacity 0.3s ease;
}
.dash-blur.on { opacity: 1; }

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

/* Light mode (theme-light class set from useTheme / !isDark) */
.hub-ctrl-bar.theme-light {
  background: rgba(255, 255, 255, 0.9);
  border-color: rgba(15, 23, 42, 0.12);
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.15), 0 0 0 1px rgba(99, 102, 241, 0.3);
}
.theme-light .hub-ctrl-label { color: rgba(15, 23, 42, 0.5); }
.theme-light .hub-ctrl-divider { background: rgba(15, 23, 42, 0.12); }
.theme-light .hub-ctrl-btn { color: rgba(15, 23, 42, 0.5); }
.theme-light .hub-ctrl-btn:hover { background: rgba(15, 23, 42, 0.08); color: rgba(15, 23, 42, 0.9); }

</style>

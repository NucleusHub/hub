<script setup>
import { ref, shallowRef, watch } from 'vue'
import { APP_NAME, NAV_ITEMS } from '@/config.js'
import logoUrl from '@/assets/nucleus-logo-transparent.png'
import { LiquidGlass } from '@zaosoula/liquid-glass-vue/components'

const cardRefs = NAV_ITEMS.map(() => shallowRef(null))
const cardHovered = ref(NAV_ITEMS.map(() => false))

const THEMES = [
  { key: 'light',  label: 'Light',  icon: 'M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0z' },
  { key: 'system', label: 'System', icon: 'M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0H3' },
  { key: 'dark',   label: 'Dark',   icon: 'M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998z' },
]

const THEME_KEY = 'nucleus-theme'

function getCookie(name) {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  return m ? decodeURIComponent(m[1]) : null
}
function setCookie(name, value) {
  document.cookie = name + '=' + encodeURIComponent(value) + '; path=/; max-age=31536000; SameSite=Lax'
}

const theme = ref(getCookie(THEME_KEY) || 'system')

function applyTheme(t) {
  const dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}

watch(theme, (val) => {
  setCookie(THEME_KEY, val)
  applyTheme(val)
}, { immediate: true })

const sysMq = window.matchMedia('(prefers-color-scheme: dark)')
sysMq.addEventListener('change', () => { if (theme.value === 'system') applyTheme('system') })
</script>

<template>
  <div class="relative min-h-screen bg-slate-100 dark:bg-[#0d0d1a] flex flex-col items-center justify-center p-4 sm:p-8 gap-8 sm:gap-12 overflow-hidden">

    <!-- Colorful background blobs — give the glass something to refract -->
    <div class="pointer-events-none absolute inset-0 overflow-hidden">
      <div class="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-violet-400/35 dark:bg-violet-700/50 blur-[120px]" />
      <div class="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-indigo-400/35 dark:bg-indigo-700/50 blur-[120px]" />
      <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-blue-400/25 dark:bg-blue-600/35 blur-[80px]" />
      <div class="absolute top-1/4 right-1/4 w-56 h-56 rounded-full bg-pink-400/20 dark:bg-purple-700/30 blur-[80px]" />
    </div>

    <!-- Theme toggle — top right (LiquidGlass pill) -->
    <div class="fixed top-4 right-4 z-50" style="width: 114px; height: 46px;">
      <LiquidGlass
        :style="{ position: 'absolute', top: '50%', left: '50%' }"
        :corner-radius="14"
        padding="5px"
        :displacement-scale="55"
        :blur-amount="0.1"
        :saturation="160"
      >
        <div class="flex gap-0.5">
          <button
            v-for="t in THEMES"
            :key="t.key"
            @click="theme = t.key"
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
      </LiquidGlass>
    </div>

    <!-- Logo + title -->
    <div class="relative flex flex-col items-center gap-4 text-center z-10">
      <img :src="logoUrl" alt="Nucleus" class="w-24 h-24 sm:w-28 sm:h-28 object-contain" />
      <h1 class="text-5xl sm:text-6xl font-bold tracking-tight text-slate-900 dark:text-white">{{ APP_NAME }}</h1>
      <p class="text-slate-500 dark:text-slate-400 text-sm">Your personal productivity hub</p>
    </div>

    <!-- Nav cards — LiquidGlass -->
    <div class="relative z-10 flex flex-col gap-4 items-center w-full">
      <a
        v-for="(item, i) in NAV_ITEMS"
        :key="item.to"
        :ref="el => { if (el) cardRefs[i].value = el }"
        :href="item.to"
        @mouseenter="cardHovered[i] = true"
        @mouseleave="cardHovered[i] = false"
        class="relative block cursor-pointer"
        :style="{
          height: '80px',
          width: 'min(340px, 90vw)',
          transition: 'transform 0.25s ease, box-shadow 0.25s ease',
          transform: cardHovered[i] ? 'translateY(-5px)' : 'translateY(0)',
          boxShadow: cardHovered[i] ? '0 16px 48px rgba(99,102,241,0.55)' : '0 0 0 rgba(0,0,0,0)',
          borderRadius: '20px',
        }"
      >
        <LiquidGlass
          :style="{ position: 'absolute', top: '50%', left: '50%' }"
          :corner-radius="20"
          padding="16px 20px"
          :displacement-scale="70"
          :blur-amount="0.12"
          :saturation="160"
          :aberration-intensity="3"
          :elasticity="0.4"
          :mouse-container="cardRefs[i]"
          class="cursor-pointer"
          @click="() => {}"
        >
          <div style="min-width: min(300px, 80vw);" class="flex items-center justify-between gap-4">
            <div class="flex items-center gap-4">
              <div
                class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                :style="{ background: cardHovered[i] ? 'rgb(99,102,241)' : 'rgba(99,102,241,0.75)', transition: 'background 0.25s ease' }"
              >
                <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" stroke-width="2.25" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" :d="item.icon" />
                </svg>
              </div>
              <div>
                <p class="font-semibold text-slate-900 dark:text-white leading-tight">{{ item.label }}</p>
                <p class="text-xs text-slate-500 dark:text-white/60 mt-0.5">{{ item.description }}</p>
              </div>
            </div>
            <svg
              class="w-4 h-4 shrink-0"
              :style="{ color: cardHovered[i] ? 'rgba(99,102,241,0.8)' : '', transition: 'color 0.25s ease' }"
              :class="cardHovered[i] ? '' : 'text-slate-400 dark:text-white/40'"
              fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </div>
        </LiquidGlass>
      </a>
    </div>
  </div>
</template>

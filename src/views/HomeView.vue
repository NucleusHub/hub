<script setup>
import { ref, watch } from 'vue'
import { APP_NAME, NAV_ITEMS } from '@/config.js'
import logoUrl from '@/assets/nucleus-logo-transparent.png'

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
  <div class="min-h-screen bg-slate-100 dark:bg-slate-900 flex flex-col items-center justify-center p-4 sm:p-8 gap-8 sm:gap-16">

    <!-- Theme toggle — top right -->
    <div class="fixed top-4 right-4 flex bg-slate-200 dark:bg-slate-800 rounded-lg p-0.5 gap-0.5">
      <button
        v-for="t in THEMES"
        :key="t.key"
        @click="theme = t.key"
        :title="t.label"
        :class="['cursor-pointer flex items-center justify-center w-8 h-8 rounded-md transition-colors',
          theme === t.key
            ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
            : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-white']"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" :d="t.icon" />
        </svg>
      </button>
    </div>

    <div class="flex flex-col items-center gap-3 text-center">
      <img :src="logoUrl" alt="Nucleus" class="w-20 h-20 sm:w-28 sm:h-28 object-contain" />
      <h1 class="text-4xl sm:text-6xl font-bold tracking-tight text-slate-900 dark:text-white">{{ APP_NAME }}</h1>
    </div>

    <div class="flex flex-col gap-3 w-full max-w-xs sm:max-w-sm">
      <a
        v-for="item in NAV_ITEMS"
        :key="item.to"
        :href="item.to"
        class="group flex items-center justify-between bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-500 rounded-2xl px-5 sm:px-6 py-4 transition-all"
      >
        <div class="flex items-center gap-4">
          <div class="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0">
            <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" :d="item.icon" />
            </svg>
          </div>
          <div>
            <p class="text-slate-900 dark:text-white font-medium">{{ item.label }}</p>
            <p class="text-slate-400 dark:text-slate-500 text-sm">{{ item.description }}</p>
          </div>
        </div>
        <svg class="w-4 h-4 text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300 transition-colors" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </a>
    </div>
  </div>
</template>

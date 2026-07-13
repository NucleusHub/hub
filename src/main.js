import './assets/main.css'
import { createApp } from 'vue'
import App from './App.vue'
import router from './router/index.js'
import { registerFallback } from '@core/useI18n.js'
// Hub-scope English base, bundled for static single-language mode when the
// localization plugin is disabled or not installed. hub/locales lives inside the
// hub Vite root, so a plain relative import (no symlink) reaches it.
import fallbackLocale from '../locales/en-US.json'
registerFallback(fallbackLocale)
createApp(App).use(router).mount('#app')

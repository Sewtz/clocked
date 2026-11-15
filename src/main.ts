import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { useClockStore } from '@/stores/clock'
import { installDebugApi } from '@/debug/api'
import { getAllHistory } from '@/storage/history'
import { seedDemoWeek } from '@/debug/demo'
import './assets/main.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.mount('#app')

const store = useClockStore()
installDebugApi(store)

// `pnpm demo` builds with VITE_DEMO=1: fill an empty history with an example week.
// Production builds drop this branch entirely.
if (import.meta.env.VITE_DEMO === '1') {
  void getAllHistory().then(history => {
    if (history.length === 0) return seedDemoWeek(store, new Date())
  })
}

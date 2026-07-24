import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { useClockStore } from '@/stores/clock'
import { installDebugApi } from '@/debug/api'
import './assets/main.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.mount('#app')

const store = useClockStore()
installDebugApi(store)

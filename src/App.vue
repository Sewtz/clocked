<script setup lang="ts">
import { onMounted, onBeforeUnmount, computed, ref } from 'vue'
import { useClockStore, stopTick } from '@/stores/clock'
import ClockInView from '@/components/ClockInView.vue'
import RunningView from '@/components/RunningView.vue'
import SettingsDialog from '@/components/SettingsDialog.vue'

const store = useClockStore()
const settingsOpen = ref(false)

function onVisibility() {
  if (document.visibilityState === 'visible') store.onVisible()
}

onMounted(() => {
  document.addEventListener('visibilitychange', onVisibility)
  store.init()
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibility)
  stopTick()
})

const view = computed(() => store.viewState)

const statusColor = computed(() =>
  store.breakState === 'break1' || store.breakState === 'break2' ? 'var(--color-break)'
  : store.isClockedIn ? 'var(--color-work)'
  : '#3a3a3a',
)

const todayLabel = computed(() =>
  store.now
    ? new Date(store.now).toLocaleDateString([], { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()
    : '',
)
</script>

<template>
  <div class="min-h-dvh flex flex-col bg-bg text-text font-sans">
    <SettingsDialog v-if="settingsOpen" @close="settingsOpen = false" />

    <header class="border-b border-border px-6 py-4 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <span
          class="w-2 h-2 rounded-full transition-colors duration-300"
          :style="{ backgroundColor: statusColor }"
        />
        <span class="font-mono text-xs tracking-widest text-text-dim uppercase">TIMECLOCK</span>
      </div>
      <div class="flex items-center gap-4">
        <span class="font-mono text-xs text-text-faint">{{ todayLabel }}</span>
        <button
          type="button"
          class="text-text-faint hover:text-text transition-colors"
          aria-label="Settings"
          title="Settings"
          @click="settingsOpen = true"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="8" cy="8" r="2.5" />
            <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    </header>

    <main class="flex-1 flex flex-col items-center justify-center px-6 py-12 gap-12">
      <template v-if="store.loadStatus !== 'ready'">
        <div class="font-mono text-text-faint animate-pulse text-xl">Clocked</div>
      </template>
      <template v-else>
        <ClockInView v-if="view.kind === 'clock-in' || view.kind === 'clocked-out'" />
        <RunningView v-else-if="view.kind === 'running' || view.kind === 'break'" />
      </template>
    </main>
  </div>
</template>

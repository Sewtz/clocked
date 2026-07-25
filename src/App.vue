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
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </header>

    <main class="flex-1 flex flex-col items-center justify-start px-6 pt-12 gap-12">
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

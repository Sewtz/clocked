<script setup lang="ts">
import { onMounted, onBeforeUnmount, computed } from 'vue'
import { useClockStore } from '@/stores/clock'
import { stopTick } from '@/stores/clock'
import ClockInView from '@/components/ClockInView.vue'
import RunningView from '@/components/RunningView.vue'
import BreakOverlay from '@/components/BreakOverlay.vue'

const store = useClockStore()

function onVisibility() {
  if (document.visibilityState === 'visible') {
    store.onVisible()
  }
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
</script>

<template>
  <main class="min-h-dvh flex flex-col items-center justify-center bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
    <template v-if="store.loadStatus !== 'ready'">
      <div class="text-neutral-400 animate-pulse text-xl">Clocked</div>
    </template>
    <template v-else>
      <ClockInView v-if="view.kind === 'clock-in' || view.kind === 'clocked-out'" />
      <RunningView v-else-if="view.kind === 'running'" />
      <BreakOverlay v-else-if="view.kind === 'break'" />
    </template>
  </main>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useClockStore } from '@/stores/clock'
import { formatMMSS } from '@/domain/format'

const store = useClockStore()

const durationSec = computed(() => {
  if (store.breakState === 'break1') return store.settings?.break1_duration ?? 0
  if (store.breakState === 'break2') return store.settings?.break2_duration ?? 0
  return 0
})
const remainingMs = computed(() => (store.breakEndsAt ? Math.max(0, store.breakEndsAt - store.now) : 0))
const elapsedMs = computed(() => Math.max(0, durationSec.value * 1000 - remainingMs.value))
const pctFull = computed(() =>
  durationSec.value > 0 ? Math.max(0, 100 - (elapsedMs.value / (durationSec.value * 1000)) * 100) : 0,
)
</script>

<template>
  <div
    v-if="store.isOnBreak && store.breakEndsAt"
    class="w-full max-w-xl border border-break/30 bg-break/5 px-5 py-3 flex items-center justify-between"
  >
    <span class="font-mono text-xs text-break tracking-widest uppercase">
      Mandatory break ({{ durationSec / 60 }} min)
    </span>
    <div class="flex items-center gap-4">
      <div class="h-1 w-32 bg-surface-2 overflow-hidden">
        <div class="h-full bg-break transition-all duration-1000" :style="{ width: pctFull + '%' }" />
      </div>
      <span class="font-mono text-sm text-break font-bold">{{ formatMMSS(remainingMs) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useClockStore } from '@/stores/clock'

const store = useClockStore()

const pct = computed(() => store.workPercent)
const barColor = computed(() => (store.overtimeMs > 0 ? 'var(--color-overtime)' : 'var(--color-work)'))
const targetHours = computed(() => (store.settings ? store.settings.daily_target / 3600 : 0))
const halfHours = computed(() => targetHours.value / 2)
</script>

<template>
  <div class="w-full max-w-xl">
    <div class="flex justify-between mb-2">
      <span class="font-mono text-xs text-text-faint tracking-widest uppercase">Daily target</span>
      <span class="font-mono text-xs text-text-faint">{{ Math.round(pct) }}% of {{ targetHours }}h</span>
    </div>
    <div class="h-2 bg-surface-2 w-full overflow-hidden">
      <div class="h-full transition-all duration-1000" :style="{ width: pct + '%', backgroundColor: barColor }" />
    </div>
    <div class="flex justify-between mt-1">
      <span class="font-mono text-[10px] text-text-faint/40">0h</span>
      <span class="font-mono text-[10px] text-text-faint/40">{{ halfHours }}h</span>
      <span class="font-mono text-[10px] text-text-faint/40">{{ targetHours }}h</span>
    </div>
  </div>
</template>

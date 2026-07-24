<script setup lang="ts">
import { computed } from 'vue'
import { useClockStore } from '@/stores/clock'
import { formatHHMM } from '@/domain/format'

const store = useClockStore()

const worked = computed(() => formatHHMM(store.workedMs))
const breaks = computed(() => formatHHMM(store.breakMs))
const third = computed(() =>
  store.overtimeMs > 0 ? `+${formatHHMM(store.overtimeMs)}` : formatHHMM(store.remainingMs),
)
const thirdLabel = computed(() => (store.overtimeMs > 0 ? 'Overtime' : 'Remaining'))
const thirdColor = computed(() => (store.overtimeMs > 0 ? 'var(--color-overtime)' : 'var(--color-text-faint)'))
</script>

<template>
  <div class="w-full max-w-xl grid grid-cols-3 gap-px bg-border">
    <div class="bg-bg px-5 py-4">
      <div class="font-mono text-work text-xl font-bold">{{ worked }}</div>
      <div class="font-mono text-text-faint text-xs mt-1 tracking-widest uppercase">Worked</div>
    </div>
    <div class="bg-bg px-5 py-4">
      <div class="font-mono text-break text-xl font-bold">{{ breaks }}</div>
      <div class="font-mono text-text-faint text-xs mt-1 tracking-widest uppercase">Breaks</div>
    </div>
    <div class="bg-bg px-5 py-4">
      <div class="font-mono text-xl font-bold" :style="{ color: thirdColor }">{{ third }}</div>
      <div class="font-mono text-text-faint text-xs mt-1 tracking-widest uppercase">{{ thirdLabel }}</div>
    </div>
  </div>
</template>

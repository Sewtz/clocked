<script setup lang="ts">
import { computed } from 'vue'
import { useClockStore } from '@/stores/clock'
import { formatHHMM } from '@/domain/format'

const store = useClockStore()
const m = computed(() => store.nextMilestone)
</script>

<template>
  <div
    v-if="store.viewState.kind === 'running' && m && m.remainingMs > 0"
    class="w-full max-w-xl flex items-center justify-between px-1"
  >
    <span class="font-mono text-xs text-text-faint tracking-widest uppercase">Next: {{ m.label }}</span>
    <span class="font-mono text-xs text-text-faint">in {{ formatHHMM(m.remainingMs) }}</span>
  </div>
</template>

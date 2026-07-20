<script setup lang="ts">
import { computed } from 'vue'
import { useClockStore } from '@/stores/clock'
import { formatMMSS } from '@/domain/format'

const store = useClockStore()

const remainingMs = computed(() => {
  const ends = store.breakEndsAt
  if (!ends) return 0
  return Math.max(0, ends - store.now)
})

const remaining = computed(() => formatMMSS(remainingMs.value))
</script>

<template>
  <div class="absolute inset-0 flex flex-col items-center justify-center bg-amber-100 text-amber-900">
    <div class="text-2xl font-semibold mb-4">Break</div>
    <div class="text-6xl font-mono tabular-nums">{{ remaining }}</div>
    <div class="mt-4 text-sm text-amber-700">Resumes automatically</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { lastFourWeeksRange, addDays, ymd } from '@/domain/date'
import type { Worktime } from '@/domain/types'

const props = defineProps<{
  today: Date
  history: Record<string, Worktime>
  selectedDate: string | null
}>()

const emit = defineEmits<{
  select: [ymd: string]
}>()

const headers = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const cells = computed(() => {
  const range = lastFourWeeksRange(props.today)
  const out: Array<{
    date: Date
    ymd: string
    hasData: boolean
    isToday: boolean
    isSelected: boolean
  }> = []
  for (let i = 0; i < 28; i++) {
    const d = addDays(range.start, i)
    const key = ymd(d)
    out.push({
      date: d,
      ymd: key,
      hasData: !!props.history[key]?.punches?.length,
      isToday: key === ymd(props.today),
      isSelected: key === props.selectedDate,
    })
  }
  return out
})
</script>

<template>
  <div class="grid grid-cols-7 gap-1">
    <div
      v-for="h in headers"
      :key="h"
      class="font-mono text-[10px] tracking-widest text-text-faint uppercase text-center py-1"
    >{{ h }}</div>

    <button
      v-for="cell in cells"
      :key="cell.ymd"
      type="button"
      class="aspect-square flex flex-col items-center justify-center border transition-colors"
      :class="[
        cell.isToday ? 'border-text-dim' : 'border-border',
        cell.isSelected ? 'bg-surface-2' : 'bg-surface',
      ]"
      :aria-label="cell.ymd"
      :aria-pressed="cell.isSelected"
      @click="emit('select', cell.ymd)"
    >
      <span class="font-mono text-xs text-text-dim">{{ cell.date.getDate() }}</span>
      <span
        v-if="cell.hasData"
        class="w-1.5 h-1.5 rounded-full mt-1"
        style="background-color: var(--color-work)"
        aria-hidden="true"
      />
    </button>
  </div>
</template>
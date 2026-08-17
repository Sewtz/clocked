<script setup lang="ts">
import { computed } from 'vue'
import { recompute } from '@/domain/recompute'
import { formatHHMM, secToTimeInput } from '@/domain/format'
import type { Worktime, Settings } from '@/domain/types'

const props = defineProps<{
  worktime: Worktime | null
  settings: Settings | null
  nowSec: number
}>()

const recomputed = computed(() => {
  if (!props.worktime || !props.settings) return null
  return recompute(props.worktime.punches, props.settings, props.nowSec)
})

const rows = computed(() => {
  if (!recomputed.value) return []
  return recomputed.value.segments.map(s => ({
    type: s.type,
    startLabel: secToTimeInput(s.startSec),
    endLabel: secToTimeInput(s.endSec),
    durationMs: Math.max(0, s.endSec - s.startSec) * 1000,
  }))
})

const totalMs = computed(() => (recomputed.value?.workedSeconds ?? 0) * 1000)
const breakMs = computed(() => (recomputed.value?.breakSeconds ?? 0) * 1000)
</script>

<template>
  <div v-if="!worktime || worktime.punches.length === 0" class="font-mono text-xs text-text-faint py-4 text-center">
    No events for this day.
  </div>
  <div v-else class="flex flex-col gap-2">
    <div
      v-for="(row, i) in rows"
      :key="i"
      class="flex items-center justify-between border border-border px-3 py-2"
      :class="{
        'border-l-2 border-l-work': row.type === 'work',
        'border-l-2 border-l-gap': row.type === 'gap',
        'border-l-2 border-l-break': row.type === 'mandatory-break',
      }"
    >
      <div class="flex items-center gap-3">
        <span class="font-mono text-[10px] tracking-widest uppercase text-text-faint w-12">
          {{ row.type === 'work' ? 'Work' : row.type === 'gap' ? 'Gap' : 'Break' }}
        </span>
        <span class="font-mono text-sm text-text-dim">{{ row.startLabel }} – {{ row.endLabel }}</span>
      </div>
      <span class="font-mono text-xs text-text-faint">{{ formatHHMM(row.durationMs) }}</span>
    </div>

    <div class="flex items-center justify-between mt-2 pt-2 border-t border-border">
      <span class="font-mono text-[10px] tracking-widest uppercase text-text-faint">Total worked</span>
      <span class="font-mono text-sm text-text">{{ formatHHMM(totalMs) }}</span>
    </div>
    <div class="flex items-center justify-between">
      <span class="font-mono text-[10px] tracking-widest uppercase text-text-faint">Breaks</span>
      <span class="font-mono text-xs text-text-dim">{{ formatHHMM(breakMs) }}</span>
    </div>
  </div>
</template>
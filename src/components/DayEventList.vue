<script setup lang="ts">
import { computed } from 'vue'
import { recompute } from '@/domain/recompute'
import { analyse, ISSUE_TEXT } from '@/domain/events'
import { formatHHMM, secToTimeInput } from '@/domain/format'
import type { Worktime, Settings } from '@/domain/types'

const props = withDefaults(defineProps<{
  worktime: Worktime | null
  settings: Settings | null
  nowSec: number
  /** Today may end with an open clock-in; a past day may not. */
  isToday?: boolean
}>(), { isToday: false })

const analysis = computed(() =>
  props.worktime ? analyse(props.worktime.events, { allowOpen: props.isToday }) : null,
)

const recomputed = computed(() => {
  const a = analysis.value
  if (!a || a.status === 'faulty' || !props.settings) return null
  return recompute(a.punches, props.settings, props.nowSec)
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

/** Raw events with issue hints, shown when the day is faulty. */
const faultyRows = computed(() => {
  const a = analysis.value
  if (!props.worktime || a?.status !== 'faulty') return []
  return props.worktime.events.map((e, i) => ({
    label: e.type === 'in' ? 'In' : 'Out',
    time: secToTimeInput(e.t),
    problems: a.issues.filter(x => x.index === i).map(x => ISSUE_TEXT[x.kind]),
  }))
})

const totalMs = computed(() => (recomputed.value?.workedSeconds ?? 0) * 1000)
const breakMs = computed(() => (recomputed.value?.breakSeconds ?? 0) * 1000)
</script>

<template>
  <div v-if="!worktime || worktime.events.length === 0" class="font-mono text-xs text-text-faint py-4 text-center">
    No events for this day.
  </div>

  <div v-else-if="analysis?.status === 'faulty'" class="flex flex-col gap-2" data-testid="faulty-day-list">
    <div
      v-for="(row, i) in faultyRows"
      :key="i"
      class="flex flex-col border border-border px-3 py-2 border-l-2"
      :class="row.problems.length ? 'border-l-overtime' : 'border-l-border'"
    >
      <div class="flex items-center justify-between">
        <span class="font-mono text-[10px] tracking-widest uppercase text-text-faint w-12">{{ row.label }}</span>
        <span class="font-mono text-sm text-text-dim">{{ row.time }}</span>
      </div>
      <span v-for="msg in row.problems" :key="msg" class="font-mono text-[11px] text-overtime">{{ msg }}</span>
    </div>
    <div class="font-mono text-xs text-overtime mt-2 pt-2 border-t border-border">
      Times are inconsistent — totals unavailable until fixed.
    </div>
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

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

/**
 * Day summary shown above the events: worked, breaks, and the balance against the
 * daily target. Today (still running) shows the remaining time like the main screen.
 */
const summary = computed(() => {
  if (!props.worktime || props.worktime.events.length === 0) return null
  if (!recomputed.value || !props.settings) {
    return { worked: '—', breaks: '—', balance: '—', balanceLabel: props.isToday ? 'Remaining' : 'Balance', balanceColor: 'var(--color-text-faint)' }
  }
  const workedMs = recomputed.value.workedSeconds * 1000
  const diffMs = workedMs - props.settings.daily_target * 1000
  const base = {
    worked: formatHHMM(workedMs),
    breaks: formatHHMM(recomputed.value.breakSeconds * 1000),
  }
  if (diffMs > 0) return { ...base, balance: `+${formatHHMM(diffMs)}`, balanceLabel: 'Overtime', balanceColor: 'var(--color-overtime)' }
  if (diffMs === 0) return { ...base, balance: '00:00', balanceLabel: 'On target', balanceColor: 'var(--color-work)' }
  if (props.isToday) return { ...base, balance: formatHHMM(-diffMs), balanceLabel: 'Remaining', balanceColor: 'var(--color-text-faint)' }
  return { ...base, balance: `−${formatHHMM(-diffMs)}`, balanceLabel: 'Undertime', balanceColor: 'var(--color-text-dim)' }
})
</script>

<template>
  <div v-if="!worktime || worktime.events.length === 0" class="font-mono text-xs text-text-faint py-4 text-center">
    No events for this day.
  </div>

  <div v-else class="flex flex-col gap-4">
    <div v-if="summary" class="w-full grid grid-cols-3 gap-px bg-border" data-testid="day-summary">
      <div class="bg-surface px-3 py-3">
        <div class="font-mono text-work text-lg font-bold" data-testid="day-worked">{{ summary.worked }}</div>
        <div class="font-mono text-text-faint text-[10px] mt-1 tracking-widest uppercase">Worked</div>
      </div>
      <div class="bg-surface px-3 py-3">
        <div class="font-mono text-break text-lg font-bold" data-testid="day-breaks">{{ summary.breaks }}</div>
        <div class="font-mono text-text-faint text-[10px] mt-1 tracking-widest uppercase">Breaks</div>
      </div>
      <div class="bg-surface px-3 py-3">
        <div class="font-mono text-lg font-bold" :style="{ color: summary.balanceColor }" data-testid="day-balance">{{ summary.balance }}</div>
        <div class="font-mono text-text-faint text-[10px] mt-1 tracking-widest uppercase" data-testid="day-balance-label">{{ summary.balanceLabel }}</div>
      </div>
    </div>

    <div v-if="analysis?.status === 'faulty'" class="flex flex-col gap-2" data-testid="faulty-day-list">
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useClockStore } from '@/stores/clock'
import { useScrollLock } from '@/components/ui/useScrollLock'
import { secToTimeInput, timeInputToSec } from '@/domain/format'
import { analyse, ISSUE_TEXT } from '@/domain/events'
import { now } from '@/domain/clock'
import { todayString, secondsSinceMidnight } from '@/domain/date'
import type { PunchEvent, PunchEventType } from '@/domain/types'

const props = defineProps<{
  /** Day to edit (YYYY-MM-DD). Defaults to today. */
  date?: string
}>()
const emit = defineEmits<{ close: [] }>()
const store = useClockStore()
useScrollLock()

const today = todayString(new Date(now()))
const date = props.date ?? today
const isToday = date === today

interface DraftEvent { id: number; type: PunchEventType; time: string }

let nextId = 0
// The live record may still carry yesterday's date until the rollover check runs.
const source: readonly PunchEvent[] = store.worktime?.date === date
  ? store.worktime.events
  : store.historyCache?.[date]?.events ?? []
const draft = reactive<DraftEvent[]>(
  source.map(e => ({ id: nextId++, type: e.type, time: secToTimeInput(e.t) })),
)

const TIME_RE = /^(\d{1,2}):(\d{1,2})$/

function toEvents(): PunchEvent[] {
  return draft.map(e => ({ type: e.type, t: timeInputToSec(e.time) }))
}

const analysis = computed(() => analyse(toEvents(), { allowOpen: isToday }))
const isFaulty = computed(() => analysis.value.status === 'faulty')

const issuesByIndex = computed(() => {
  const map = new Map<number, string[]>()
  if (analysis.value.status === 'faulty') {
    for (const issue of analysis.value.issues) {
      map.set(issue.index, [...(map.get(issue.index) ?? []), ISSUE_TEXT[issue.kind]])
    }
  }
  return map
})

/** Stable re-sort by time (Array.prototype.sort is stable). */
function sortDraft() {
  draft.sort((a, b) => timeInputToSec(a.time) - timeInputToSec(b.time))
}

function onTimeInput(row: DraftEvent, value: string) {
  if (!TIME_RE.test(value.trim())) return
  row.time = value
}

function remove(row: DraftEvent) {
  const i = draft.findIndex(r => r.id === row.id)
  if (i >= 0) draft.splice(i, 1)
}

// --- add row ---
function oppositeOfLast(): PunchEventType {
  return draft[draft.length - 1]?.type === 'in' ? 'out' : 'in'
}
function defaultAddTime(): string {
  if (isToday) return secToTimeInput(secondsSinceMidnight(now()))
  return draft[draft.length - 1]?.time ?? '08:00'
}
const addType = ref<PunchEventType>(oppositeOfLast())
const addTime = ref(defaultAddTime())

function onAddTimeInput(value: string) {
  if (TIME_RE.test(value.trim())) addTime.value = value
}

function add() {
  draft.push({ id: nextId++, type: addType.value, time: addTime.value })
  sortDraft()
  addType.value = oppositeOfLast()
}

async function save() {
  sortDraft()
  await store.replaceDayEvents(date, toEvents())
  emit('close')
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center"
    style="background-color: rgba(0,0,0,0.8)"
    @click.self="emit('close')"
  >
    <div class="bg-surface border border-border-2 w-full max-w-md mx-4 max-h-[85dvh] flex flex-col">
      <div class="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <span class="font-mono text-xs tracking-widest text-text-dim uppercase">
          Edit times<span v-if="!isToday" class="text-text-faint"> · {{ date }}</span>
        </span>
        <button
          type="button"
          class="font-mono text-text-faint hover:text-text text-lg leading-none transition-colors"
          aria-label="Close"
          @click="emit('close')"
        >×</button>
      </div>

      <div class="overflow-y-auto px-6 py-5 flex flex-col gap-3">
        <div v-if="draft.length === 0" class="font-mono text-xs text-text-faint text-center py-2">
          No events for this day.
        </div>

        <div
          v-for="(row, i) in draft"
          :key="row.id"
          data-testid="event-row"
          class="flex flex-col gap-1 pl-2 border-l-2"
          :class="issuesByIndex.has(i) ? 'border-l-overtime' : 'border-l-transparent'"
        >
          <div class="flex items-center justify-between gap-3">
            <span class="font-mono text-sm text-text-dim">{{ row.type === 'in' ? 'Clocked in' : 'Clocked out' }}</span>
            <div class="flex items-center gap-2">
              <input
                type="time"
                :value="row.time"
                :aria-label="`${row.type === 'in' ? 'Clocked in' : 'Clocked out'} time`"
                @input="onTimeInput(row, ($event.target as HTMLInputElement).value)"
                @change="sortDraft"
                class="font-mono text-sm w-24 bg-surface border border-border-2 text-text px-2 py-1 text-right focus:outline-none focus:border-work"
              />
              <button
                type="button"
                class="font-mono text-text-faint hover:text-overtime text-lg leading-none w-6 transition-colors"
                aria-label="Delete event"
                title="Delete event"
                @click="remove(row)"
              >×</button>
            </div>
          </div>
          <span
            v-for="msg in issuesByIndex.get(i) ?? []"
            :key="msg"
            class="font-mono text-[11px] text-overtime"
          >{{ msg }}</span>
        </div>

        <div class="flex items-center justify-between gap-3 pt-3 mt-1 border-t border-border">
          <div class="flex" role="group" aria-label="New event type">
            <button
              v-for="t in (['in', 'out'] as const)"
              :key="t"
              type="button"
              class="font-mono text-[10px] tracking-widest uppercase px-2 py-1 border transition-colors"
              :class="addType === t ? 'border-work text-work' : 'border-border-2 text-text-faint hover:text-text'"
              :aria-pressed="addType === t"
              @click="addType = t"
            >{{ t }}</button>
          </div>
          <div class="flex items-center gap-2">
            <input
              type="time"
              :value="addTime"
              aria-label="New event time"
              @input="onAddTimeInput(($event.target as HTMLInputElement).value)"
              class="font-mono text-sm w-24 bg-surface border border-border-2 text-text px-2 py-1 text-right focus:outline-none focus:border-work"
            />
            <button
              type="button"
              class="font-mono text-[10px] tracking-widest uppercase px-2 py-1 border border-border-2 text-text-dim hover:text-text hover:border-text-faint transition-colors"
              @click="add"
            >Add</button>
          </div>
        </div>
      </div>

      <div class="px-6 py-4 border-t border-border shrink-0 flex flex-col gap-3">
        <div v-if="isFaulty" class="font-mono text-xs text-overtime" role="status">
          Day will be saved as faulty. Fix the highlighted events to get totals back.
        </div>
        <div class="flex justify-end gap-3">
          <button
            type="button"
            class="font-mono text-xs tracking-widest uppercase px-5 py-2 border border-border-2 text-text-faint hover:text-text hover:border-text-faint transition-colors"
            @click="emit('close')"
          >Cancel</button>
          <button
            type="button"
            class="font-mono text-xs tracking-widest uppercase px-5 py-2 bg-work text-bg font-bold hover:bg-work-hi transition-colors"
            @click="save"
          >Save</button>
        </div>
      </div>
    </div>
  </div>
</template>

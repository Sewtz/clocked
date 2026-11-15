<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useClockStore } from '@/stores/clock'
import { useScrollLock } from '@/components/ui/useScrollLock'
import { now } from '@/domain/clock'
import { ymd, secondsSinceMidnight } from '@/domain/date'
import {
  presetRange, buildExport, toCsv, toMailText, exportFileName, mailSubject, dur, balanceText,
  type DateRange, type ExportData, type RangePreset,
} from '@/domain/export'
import { shareExport, type ShareResult } from '@/share/share'

const props = defineProps<{
  /** Dates the calendar can jump to (its 4-week grid). */
  selectableFrom?: string
  selectableTo?: string
}>()
const emit = defineEmits<{ close: []; jump: [date: string] }>()
const store = useClockStore()
useScrollLock()

const PRESETS: Array<{ id: RangePreset; label: string }> = [
  { id: 'this-week', label: 'This week' },
  { id: 'last-week', label: 'Last week' },
  { id: 'this-month', label: 'This month' },
  { id: 'last-month', label: 'Last month' },
]

const today = new Date(now())
const preset = ref<RangePreset | null>('this-week')
const range = ref<DateRange>(presetRange('this-week', today))

function choose(p: RangePreset) {
  preset.value = p
  range.value = presetRange(p, today)
}

function setFrom(v: string) {
  if (!v) return
  preset.value = null
  range.value = { ...range.value, from: v }
}
function setTo(v: string) {
  if (!v) return
  preset.value = null
  range.value = { ...range.value, to: v }
}

const rangeError = computed(() => (range.value.from > range.value.to ? 'The start date is after the end date.' : null))

// Prepared before the click: share() must run inside the user's tap (iOS).
const data = ref<ExportData | null>(null)
const loading = ref(false)
let requestId = 0

watch(range, async r => {
  const id = ++requestId // also invalidates any load still in flight
  if (r.from > r.to) { data.value = null; loading.value = false; return }
  loading.value = true
  const days = await store.loadDaysForExport(r.from, r.to)
  if (id !== requestId) return // a newer range was chosen meanwhile
  const nowMs = now()
  data.value = buildExport(r, days, {
    settings: store.settings!,
    today: ymd(new Date(nowMs)),
    nowSec: secondsSinceMidnight(nowMs),
  })
  loading.value = false
}, { immediate: true, deep: true })

const canJump = (date: string) =>
  !!props.selectableFrom && !!props.selectableTo && date >= props.selectableFrom && date <= props.selectableTo

const status = ref<string | null>(null)

async function share() {
  const d = data.value
  if (!d) return
  status.value = null
  const result: ShareResult = await shareExport({
    fileName: exportFileName(d.range),
    csv: toCsv(d),
    subject: mailSubject(d.range),
    text: toMailText(d),
    fallbackText: toMailText(d, { variant: 'summary' }),
  })
  if (result === 'shared') emit('close')
  else if (result === 'downloaded') status.value = `Saved ${exportFileName(d.range)} — attach it to the mail draft.`
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center"
    style="background-color: rgba(0,0,0,0.8)"
    @click.self="emit('close')"
  >
    <div class="bg-surface border border-border-2 w-full max-w-md mx-4 max-h-[85dvh] flex flex-col" role="dialog" aria-label="Share working times">
      <div class="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <span class="font-mono text-xs tracking-widest text-text-dim uppercase">Share working times</span>
        <button
          type="button"
          class="font-mono text-text-faint hover:text-text text-lg leading-none transition-colors"
          aria-label="Close"
          @click="emit('close')"
        >×</button>
      </div>

      <div class="overflow-y-auto px-6 py-5 flex flex-col gap-5">
        <div class="grid grid-cols-2 gap-2" role="group" aria-label="Period">
          <button
            v-for="p in PRESETS"
            :key="p.id"
            type="button"
            class="font-mono text-[10px] tracking-widest uppercase px-2 py-2 border transition-colors"
            :class="preset === p.id ? 'border-work text-work bg-work/15' : 'border-border-2 text-text-faint hover:text-text'"
            :aria-pressed="preset === p.id"
            @click="choose(p.id)"
          >{{ p.label }}</button>
        </div>

        <div class="flex items-center justify-between gap-3">
          <label class="flex flex-col gap-1 font-mono text-[10px] tracking-widest uppercase text-text-faint">
            From
            <input
              type="date"
              :value="range.from"
              aria-label="From"
              class="font-mono text-sm bg-surface border border-border-2 text-text px-2 py-1 focus:outline-none focus:border-work"
              @change="setFrom(($event.target as HTMLInputElement).value)"
            />
          </label>
          <label class="flex flex-col gap-1 font-mono text-[10px] tracking-widest uppercase text-text-faint">
            To
            <input
              type="date"
              :value="range.to"
              aria-label="To"
              class="font-mono text-sm bg-surface border border-border-2 text-text px-2 py-1 focus:outline-none focus:border-work"
              @change="setTo(($event.target as HTMLInputElement).value)"
            />
          </label>
        </div>

        <div v-if="rangeError" class="font-mono text-xs text-overtime" role="alert">{{ rangeError }}</div>

        <div v-else-if="data" class="flex flex-col gap-3" data-testid="share-preview">
          <div class="w-full grid grid-cols-3 gap-px bg-border">
            <div class="bg-surface px-3 py-3">
              <div class="font-mono text-work text-lg font-bold" data-testid="share-worked">{{ dur(data.totals.workedSec) }}</div>
              <div class="font-mono text-text-faint text-[10px] mt-1 tracking-widest uppercase">Worked</div>
            </div>
            <div class="bg-surface px-3 py-3">
              <div class="font-mono text-break text-lg font-bold" data-testid="share-breaks">{{ dur(data.totals.breakSec) }}</div>
              <div class="font-mono text-text-faint text-[10px] mt-1 tracking-widest uppercase">Breaks</div>
            </div>
            <div class="bg-surface px-3 py-3">
              <div class="font-mono text-sm font-bold text-text-dim pt-1" data-testid="share-balance">{{ balanceText(data.totals.balanceSec) }}</div>
              <div class="font-mono text-text-faint text-[10px] mt-1 tracking-widest uppercase">Balance</div>
            </div>
          </div>
          <div class="font-mono text-xs text-text-faint" data-testid="share-day-count">
            {{ data.totals.dayCount }} {{ data.totals.dayCount === 1 ? 'day' : 'days' }} with working times · {{ data.days.length }} calendar days
          </div>

          <div v-if="data.totals.faultyDates.length" class="flex flex-col gap-2 border border-overtime/40 px-3 py-3" role="alert" data-testid="share-faulty">
            <span class="font-mono text-xs text-overtime">
              {{ data.totals.faultyDates.length === 1 ? '1 day has' : `${data.totals.faultyDates.length} days have` }}
              inconsistent clock times. They are exported as “faulty” without totals.
            </span>
            <div class="flex flex-wrap gap-2">
              <template v-for="date in data.totals.faultyDates" :key="date">
                <button
                  v-if="canJump(date)"
                  type="button"
                  class="font-mono text-[10px] tracking-widest uppercase px-2 py-1 border border-overtime/60 text-overtime hover:bg-overtime/10 transition-colors"
                  :aria-label="`Fix ${date}`"
                  @click="emit('jump', date)"
                >Fix {{ date }}</button>
                <span v-else class="font-mono text-[10px] tracking-widest text-overtime px-2 py-1">{{ date }}</span>
              </template>
            </div>
          </div>
        </div>

        <div v-if="status" class="font-mono text-xs text-text-dim" role="status">{{ status }}</div>
      </div>

      <div class="flex justify-end gap-3 px-6 py-4 border-t border-border shrink-0">
        <button
          type="button"
          class="font-mono text-xs tracking-widest uppercase px-5 py-2 border border-border-2 text-text-faint hover:text-text hover:border-text-faint transition-colors"
          @click="emit('close')"
        >Cancel</button>
        <button
          type="button"
          class="font-mono text-xs tracking-widest uppercase px-5 py-2 bg-work text-bg font-bold hover:bg-work-hi transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          :disabled="!data || loading || !!rangeError"
          @click="share"
        >Share</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useClockStore } from '@/stores/clock'
import { useScrollLock } from '@/components/ui/useScrollLock'
import CalendarGrid from './CalendarGrid.vue'
import DayEventList from './DayEventList.vue'
import { lastFourWeeksRange, ymd, secondsSinceMidnight } from '@/domain/date'

const emit = defineEmits<{ close: [] }>()
const store = useClockStore()
useScrollLock()

const today = computed(() => (store.now ? new Date(store.now) : new Date()))
const range = computed(() => lastFourWeeksRange(today.value))
const selectedDate = ref<string | null>(ymd(today.value))

onMounted(async () => {
  await store.loadHistoryRange(range.value.start, range.value.end)
})

const history = computed(() => {
  const base = store.historyCache ?? {}
  if (store.worktime && store.worktime.punches.length > 0) {
    return { ...base, [store.worktime.date]: store.worktime }
  }
  return base
})

const selectedWorktime = computed(() => {
  if (!selectedDate.value) return null
  return history.value[selectedDate.value] ?? null
})

const nowSec = computed(() => {
  if (selectedDate.value === ymd(today.value)) {
    return secondsSinceMidnight(store.now)
  }
  return 86399
})

function onSelect(ymdStr: string) {
  selectedDate.value = ymdStr
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
        <span class="font-mono text-xs tracking-widest text-text-dim uppercase">Calendar</span>
        <button
          type="button"
          class="font-mono text-text-faint hover:text-text text-lg leading-none transition-colors"
          aria-label="Close"
          @click="emit('close')"
        >×</button>
      </div>

      <div class="overflow-y-auto px-6 py-5 flex flex-col gap-6">
        <CalendarGrid
          :today="today"
          :history="history"
          :selectedDate="selectedDate"
          @select="onSelect"
        />
        <DayEventList
          :worktime="selectedWorktime"
          :settings="store.settings"
          :nowSec="nowSec"
        />
      </div>
    </div>
  </div>
</template>
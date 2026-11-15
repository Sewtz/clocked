<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useClockStore } from '@/stores/clock'
import { useScrollLock } from '@/components/ui/useScrollLock'
import CalendarGrid from './CalendarGrid.vue'
import DayEventList from './DayEventList.vue'
import EditTimesDialog from './EditTimesDialog.vue'
import ShareDialog from './ShareDialog.vue'
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
  if (store.worktime && store.worktime.events.length > 0) {
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

const todayYmd = computed(() => ymd(today.value))

/** "Tuesday, 10 Nov 2026" for the selected day (same style as the app header). */
const selectedLabel = computed(() => {
  if (!selectedDate.value) return ''
  const [y, m, d] = selectedDate.value.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })
})
const isSelectedToday = computed(() => selectedDate.value === todayYmd.value)
// Today and past days are editable (including empty ones); future days are not.
const canEdit = computed(() => !!selectedDate.value && selectedDate.value <= todayYmd.value)

const editOpen = ref(false)
const shareOpen = ref(false)
const gridFrom = computed(() => ymd(range.value.start))
const gridTo = computed(() => ymd(range.value.end))

/** From the share dialog's faulty-day list: show that day so it can be fixed. */
function onJump(date: string) {
  shareOpen.value = false
  selectedDate.value = date
}

async function onEditClose() {
  editOpen.value = false
  await store.loadHistoryRange(range.value.start, range.value.end)
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
        <div class="flex items-center gap-4">
          <button
            type="button"
            class="text-text-faint hover:text-text transition-colors"
            aria-label="Share"
            title="Share working times"
            @click="shareOpen = true"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
          </button>
          <button
            type="button"
            class="font-mono text-text-faint hover:text-text text-lg leading-none transition-colors"
            aria-label="Close"
            @click="emit('close')"
          >×</button>
        </div>
      </div>

      <div class="overflow-y-auto px-6 py-5 flex flex-col gap-6">
        <CalendarGrid
          :today="today"
          :history="history"
          :selectedDate="selectedDate"
          @select="onSelect"
        />
        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between">
            <span class="font-mono text-xs tracking-widest text-work uppercase" data-testid="selected-day-label">{{ selectedLabel }}</span>
            <button
              type="button"
              class="font-mono text-[10px] tracking-widest uppercase px-3 py-1 border border-border-2 text-text-dim hover:text-text hover:border-text-faint transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              :disabled="!canEdit"
              :title="canEdit ? 'Edit this day' : 'Future days cannot be edited'"
              @click="editOpen = true"
            >Edit day</button>
          </div>
          <DayEventList
            :worktime="selectedWorktime"
            :settings="store.settings"
            :nowSec="nowSec"
            :isToday="isSelectedToday"
          />
        </div>
      </div>
    </div>
    <EditTimesDialog v-if="editOpen && selectedDate" :date="selectedDate" @close="onEditClose" />
    <ShareDialog
      v-if="shareOpen"
      :selectable-from="gridFrom"
      :selectable-to="gridTo"
      @close="shareOpen = false"
      @jump="onJump"
    />
  </div>
</template>

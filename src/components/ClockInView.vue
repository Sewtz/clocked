<script setup lang="ts">
import { ref } from 'vue'
import { useClockStore } from '@/stores/clock'
import { localEpochForTodayMs } from '@/domain/date'

const store = useClockStore()
const customTime = ref('')

function clockInNow() {
  store.clockIn()
}

function adjust(minutes: 1 | 5 | 10) {
  store.clockIn(Date.now() - minutes * 60_000)
}

function onCustomTime() {
  if (!customTime.value) return
  const [h, m] = customTime.value.split(':').map(Number)
  const startMs = localEpochForTodayMs(h, m)
  store.clockIn(startMs)
  customTime.value = ''
}
</script>

<template>
  <div class="flex flex-col items-center gap-10 px-6">
    <h1 class="text-2xl font-semibold text-neutral-700 dark:text-neutral-300">Ready to work?</h1>

    <button
      type="button"
      class="
        w-56 h-56 rounded-full
        bg-brand text-white text-3xl font-semibold
        shadow-xl shadow-brand/30
        active:scale-95 active:bg-brand-dark
        transition-all duration-150
        select-none touch-manipulation
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand
      "
      @click="clockInNow"
    >
      Clock In
    </button>

    <div class="flex gap-3">
      <button
        type="button"
        class="min-w-[44px] min-h-[44px] px-5 py-2 rounded-lg bg-neutral-200 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100 active:scale-95 transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        @click="adjust(1)"
      >+1min</button>
      <button
        type="button"
        class="min-w-[44px] min-h-[44px] px-5 py-2 rounded-lg bg-neutral-200 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100 active:scale-95 transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        @click="adjust(5)"
      >+5min</button>
      <button
        type="button"
        class="min-w-[44px] min-h-[44px] px-5 py-2 rounded-lg bg-neutral-200 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100 active:scale-95 transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        @click="adjust(10)"
      >+10min</button>
    </div>

    <label class="flex flex-col items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
      Custom time
      <input
        v-model="customTime"
        type="time"
        class="px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
        @change="onCustomTime"
      />
    </label>
  </div>
</template>

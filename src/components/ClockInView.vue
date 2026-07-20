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
  <div class="flex flex-col items-center gap-8">
    <button
      type="button"
      class="w-48 h-48 rounded-full bg-red-600 text-white text-2xl font-semibold shadow-lg active:scale-95 transition-transform"
      @click="clockInNow"
    >
      Clock In
    </button>

    <div class="flex gap-3">
      <button type="button" class="px-4 py-2 rounded-lg bg-neutral-200 text-neutral-800" @click="adjust(1)">+1min</button>
      <button type="button" class="px-4 py-2 rounded-lg bg-neutral-200 text-neutral-800" @click="adjust(5)">+5min</button>
      <button type="button" class="px-4 py-2 rounded-lg bg-neutral-200 text-neutral-800" @click="adjust(10)">+10min</button>
    </div>

    <label class="flex flex-col items-center gap-2 text-sm text-neutral-600">
      Custom time
      <input
        v-model="customTime"
        type="time"
        class="px-3 py-2 rounded-lg border border-neutral-300"
        @change="onCustomTime"
      />
    </label>
  </div>
</template>

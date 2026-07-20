<script setup lang="ts">
import { computed, ref } from 'vue'
import { useClockStore } from '@/stores/clock'
import { formatHHMM } from '@/domain/format'
import { localEpochForTodayMs } from '@/domain/date'

const store = useClockStore()

const display = computed(() => formatHHMM(store.displayMs))

const editTime = ref('')
function prefillEdit() {
  const first = store.entry?.segments[0]
  if (first && first.type === 'work') {
    const d = new Date(first.start)
    editTime.value = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
}
function applyEdit() {
  if (!editTime.value) return
  const [h, m] = editTime.value.split(':').map(Number)
  store.editClockIn(localEpochForTodayMs(h, m))
}

function adjust(minutes: 1 | 5 | 10) {
  store.adjustStart(minutes)
}
</script>

<template>
  <div class="flex flex-col items-center gap-6">
    <div class="text-6xl font-mono tabular-nums">{{ display }}</div>

    <div class="text-sm text-neutral-500">worked (excl. breaks)</div>

    <button
      type="button"
      class="px-6 py-3 rounded-lg bg-neutral-800 text-white"
      @click="store.clockOut()"
    >
      Clock Out
    </button>

    <div class="flex gap-3">
      <button type="button" class="px-4 py-2 rounded-lg bg-neutral-200" @click="adjust(1)">+1min</button>
      <button type="button" class="px-4 py-2 rounded-lg bg-neutral-200" @click="adjust(5)">+5min</button>
      <button type="button" class="px-4 py-2 rounded-lg bg-neutral-200" @click="adjust(10)">+10min</button>
    </div>

    <label class="flex flex-col items-center gap-2 text-sm text-neutral-600">
      Edit clock-in time
      <input
        v-model="editTime"
        type="time"
        class="px-3 py-2 rounded-lg border border-neutral-300"
        @focus="prefillEdit"
        @change="applyEdit"
      />
    </label>

    <button
      type="button"
      class="mt-4 text-sm text-red-600 underline"
      @click="store.reset()"
    >
      Reset day
    </button>
  </div>
</template>

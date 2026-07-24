<script setup lang="ts">
import { computed } from 'vue'
import { useClockStore } from '@/stores/clock'
import { formatHHMM } from '@/domain/format'
import StatsGrid from '@/components/StatsGrid.vue'
import DailyTargetBar from '@/components/DailyTargetBar.vue'
import Timeline from '@/components/Timeline.vue'

const store = useClockStore()

const workedToday = computed(() => formatHHMM(store.workedMs))
const isClockedOut = computed(() => store.isClockedOut)
const isEmpty = computed(() => !store.worktime)
</script>

<template>
  <div class="flex flex-col items-center gap-12 w-full max-w-xl">
    <div v-if="isClockedOut" class="flex flex-col items-center gap-1">
      <div class="font-mono text-5xl tabular-nums text-text">{{ workedToday }}</div>
      <div class="font-mono text-xs text-text-faint mt-1 tracking-widest uppercase">Worked today</div>
    </div>

    <button
      type="button"
      class="
        font-mono text-sm tracking-widest uppercase
        px-8 py-3 bg-work text-bg font-bold
        transition-all duration-150 hover:bg-work-hi active:scale-95
        min-h-[44px]
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-work
      "
      @click="store.clockIn()"
    >
      Clock In
    </button>

    <div v-if="isEmpty" class="font-mono text-xs text-text-faint/40 tracking-widest uppercase">
      Press clock in to start tracking
    </div>

    <template v-if="isClockedOut">
      <StatsGrid />
      <DailyTargetBar />
      <Timeline />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useClockStore } from '@/stores/clock'
import { formatHHMM } from '@/domain/format'
import BreakBanner from '@/components/BreakBanner.vue'
import MilestoneHint from '@/components/MilestoneHint.vue'
import StatsGrid from '@/components/StatsGrid.vue'
import DailyTargetBar from '@/components/DailyTargetBar.vue'
import Timeline from '@/components/Timeline.vue'

const store = useClockStore()

const display = computed(() => formatHHMM(store.workedMs))
const isRunning = computed(() => store.viewState.kind === 'running')
const isOnBreak = computed(() => store.viewState.kind === 'break')

const clockColor = computed(() =>
  isOnBreak.value ? 'var(--color-break)'
  : isRunning.value ? 'var(--color-work)'
  : 'var(--color-text-faint)',
)
const statusLabel = computed(() => {
  if (isRunning.value) return 'Current session'
  if (isOnBreak.value) return 'On mandatory break'
  return 'Not clocked in'
})
</script>

<template>
  <div class="flex flex-col items-center gap-12 w-full max-w-xl">
    <div class="text-center">
      <div
        class="font-mono text-[4.5rem] leading-none tracking-tight transition-colors duration-300 tabular-nums"
        :style="{ color: clockColor }"
      >
        {{ display }}
      </div>
      <div class="font-mono text-xs text-text-faint mt-2 tracking-widest uppercase">
        {{ statusLabel }}
      </div>
    </div>

    <BreakBanner />
    <MilestoneHint />

    <div v-if="isRunning || isOnBreak" class="flex gap-3">
      <button
        type="button"
        class="
          font-mono text-sm tracking-widest uppercase
          px-6 py-3 border border-border-2 text-text-faint
          transition-all duration-150 hover:border-text-faint hover:text-text
          active:scale-95 min-h-[44px]
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-work
        "
        @click="store.clockOut()"
      >
        Clock Out
      </button>
    </div>

    <StatsGrid />
    <DailyTargetBar />
    <Timeline />
  </div>
</template>

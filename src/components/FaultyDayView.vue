<script setup lang="ts">
import { ref, computed } from 'vue'
import { useClockStore } from '@/stores/clock'
import { secToTimeInput } from '@/domain/format'
import { ISSUE_TEXT } from '@/domain/events'
import EditTimesDialog from './EditTimesDialog.vue'

const store = useClockStore()
const editOpen = ref(false)

/** Today's events with the problems attached to the event that causes them. */
const rows = computed(() => {
  const events = store.worktime?.events ?? []
  const a = store.analysis
  const issues = a?.status === 'faulty' ? a.issues : []
  return events.map((e, i) => ({
    time: secToTimeInput(e.t),
    label: e.type === 'in' ? 'Clocked in' : 'Clocked out',
    problems: issues.filter(x => x.index === i).map(x => ISSUE_TEXT[x.kind]),
  }))
})
</script>

<template>
  <div class="flex flex-col items-center gap-8 w-full max-w-xl" data-testid="faulty-day">
    <div class="text-center flex flex-col gap-2">
      <div class="font-mono text-sm tracking-widest uppercase text-overtime">Times need fixing</div>
      <p class="font-mono text-xs text-text-dim max-w-sm">
        Today's clock-ins and clock-outs don't alternate, so worked time and breaks can't be
        calculated. Clocking is paused until the times are fixed.
      </p>
    </div>

    <ul class="w-full flex flex-col gap-1" aria-label="Today's events">
      <li
        v-for="(row, i) in rows"
        :key="i"
        class="flex flex-col border border-border px-3 py-2 border-l-2"
        :class="row.problems.length ? 'border-l-overtime' : 'border-l-border'"
      >
        <div class="flex items-center justify-between font-mono text-sm">
          <span class="text-text-dim">{{ row.label }}</span>
          <span class="text-text tabular-nums">{{ row.time }}</span>
        </div>
        <span
          v-for="msg in row.problems"
          :key="msg"
          class="font-mono text-[11px] text-overtime"
        >{{ msg }}</span>
      </li>
    </ul>

    <button
      type="button"
      class="
        font-mono text-sm tracking-widest uppercase
        px-8 py-3 bg-work text-bg font-bold
        transition-all duration-150 hover:bg-work-hi active:scale-95
        min-h-[44px]
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-work
      "
      @click="editOpen = true"
    >
      Fix times
    </button>

    <EditTimesDialog v-if="editOpen" :date="store.worktime?.date" @close="editOpen = false" />
  </div>
</template>

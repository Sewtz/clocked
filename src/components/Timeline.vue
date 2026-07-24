<script setup lang="ts">
import { computed } from 'vue'
import { useClockStore } from '@/stores/clock'
import { formatHHMM } from '@/domain/format'

const store = useClockStore()

function fmtTime(sec: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setSeconds(sec)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}
function fmtDur(sec: number): string {
  return formatHHMM(sec * 1000)
}

const span = computed(() => store.daySpanMs / 1000)
const firstIn = computed(() => (store.worktime ? store.worktime.punches[0].in : 0))
const nowFmt = computed(() => fmtTime(span.value + firstIn.value))

const trackSegs = computed(() =>
  store.segments.map(s => ({
    ...s,
    left: span.value > 0 ? ((s.startSec - firstIn.value) / span.value) * 100 : 0,
    width: span.value > 0 ? ((s.endSec - s.startSec) / span.value) * 100 : 0,
  })),
)
</script>

<template>
  <div v-if="store.segments.length > 0" class="w-full max-w-xl">
    <div class="flex justify-between mb-2">
      <span class="font-mono text-xs text-text-faint tracking-widest uppercase">Timeline</span>
      <span class="font-mono text-xs text-text-faint">
        {{ trackSegs.length ? fmtTime(firstIn) : '' }} → {{ nowFmt }}
      </span>
    </div>
    <div class="relative h-8 bg-surface w-full overflow-hidden">
      <div
        v-for="(seg, i) in trackSegs"
        :key="i"
        class="absolute top-0 h-full transition-all duration-500"
        :style="{
          left: seg.left + '%',
          width: seg.width + '%',
          backgroundColor: seg.type === 'work' ? 'var(--color-work)' : 'var(--color-break)',
          opacity: seg.type === 'work' ? 0.9 : 0.7,
        }"
        :title="`${seg.type === 'work' ? 'Work' : 'Break'}: ${fmtTime(seg.startSec)} – ${fmtTime(seg.endSec)}`"
      />
    </div>
    <div class="mt-3 flex flex-col gap-px">
      <div
        v-for="(seg, i) in store.segments"
        :key="'r' + i"
        class="flex items-center gap-3 font-mono text-xs text-text-faint"
      >
        <span
          class="w-1.5 h-1.5 rounded-full flex-shrink-0"
          :style="{ backgroundColor: seg.type === 'work' ? 'var(--color-work)' : 'var(--color-break)' }"
        />
        <span
          class="w-10 uppercase tracking-widest"
          :style="{ color: seg.type === 'work' ? 'var(--color-work)' : 'var(--color-break)' }"
        >
          {{ seg.type === 'work' ? 'Work' : 'Brk' }}
        </span>
        <span v-if="seg.type === 'mandatory-break'" class="text-text-faint uppercase tracking-widest text-[10px]">auto</span>
        <span>{{ fmtTime(seg.startSec) }} → {{ fmtTime(seg.endSec) }}</span>
        <span class="ml-auto">{{ fmtDur(seg.endSec - seg.startSec) }}</span>
      </div>
    </div>
  </div>
</template>

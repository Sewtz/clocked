<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useClockStore } from '@/stores/clock'
import { useScrollLock } from '@/components/ui/useScrollLock'
import { secToTimeInput, timeInputToSec } from '@/domain/format'
import { analyse } from '@/domain/events'
import type { PunchEvent, PunchEventType } from '@/domain/types'

const emit = defineEmits<{ close: [] }>()
const store = useClockStore()
useScrollLock()

interface DraftEvent { type: PunchEventType; time: string }

const draft = reactive<DraftEvent[]>(
  (store.worktime?.events ?? []).map(e => ({ type: e.type, time: secToTimeInput(e.t) })),
)

const rows = computed(() =>
  draft.map((e, i) => ({ index: i, label: e.type === 'in' ? 'Clocked in' : 'Clocked out', value: e.time })),
)

const error = ref<string | null>(null)

function toEvents(): PunchEvent[] {
  return draft.map(e => ({ type: e.type, t: timeInputToSec(e.time) }))
}

// Interim rule until #10: block saving a sequence that is out of order or faulty.
function validate(): string | null {
  const a = analyse(toEvents(), { allowOpen: true })
  if (a.status === 'valid') return null
  const issue = a.issues[0]
  if (issue.kind === 'unsorted') return `Event ${issue.index + 1} is earlier than the event before it.`
  return 'Clock-ins and clock-outs must alternate.'
}

error.value = validate()

function onTimeInput(index: number, value: string) {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(value.trim())
  if (!m) return
  draft[index].time = value
  error.value = validate()
}

async function save() {
  const err = validate()
  if (err) { error.value = err; return }
  if (!store.worktime) return
  await store.replaceDayEvents(store.worktime.date, toEvents())
  emit('close')
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center"
    style="background-color: rgba(0,0,0,0.8)"
    @click.self="emit('close')"
  >
    <div class="bg-surface border border-border-2 w-full max-w-md mx-4">
      <div class="flex items-center justify-between px-6 py-4 border-b border-border">
        <span class="font-mono text-xs tracking-widest text-text-dim uppercase">Edit times</span>
        <button
          type="button"
          class="font-mono text-text-faint hover:text-text text-lg leading-none transition-colors"
          aria-label="Close"
          @click="emit('close')"
        >×</button>
      </div>

      <div class="px-6 py-5 flex flex-col gap-3">
        <div
          v-for="row in rows"
          :key="row.index"
          class="flex items-center justify-between"
        >
          <span class="font-mono text-sm text-text-dim">{{ row.label }}</span>
          <input
            type="time"
            :value="row.value"
            @input="onTimeInput(row.index, ($event.target as HTMLInputElement).value)"
            class="font-mono text-sm w-24 bg-surface border border-border-2 text-text px-2 py-1 text-right focus:outline-none focus:border-work"
          />
        </div>

        <div v-if="error" class="font-mono text-xs text-overtime mt-2">
          {{ error }}
        </div>
      </div>

      <div class="flex justify-end gap-3 px-6 py-4 border-t border-border">
        <button
          type="button"
          class="font-mono text-xs tracking-widest uppercase px-5 py-2 border border-border-2 text-text-faint hover:text-text hover:border-text-faint transition-colors"
          @click="emit('close')"
        >Cancel</button>
        <button
          type="button"
          class="font-mono text-xs tracking-widest uppercase px-5 py-2 bg-work text-bg font-bold hover:bg-work-hi transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          :disabled="error !== null"
          @click="save"
        >Save</button>
      </div>
    </div>
  </div>
</template>
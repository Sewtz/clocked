<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useClockStore } from '@/stores/clock'
import { secToTimeInput, timeInputToSec } from '@/domain/format'

const emit = defineEmits<{ close: [] }>()
const store = useClockStore()

interface DraftPunch { in: string; out: string | null }

const draft = reactive<DraftPunch[]>(
  (store.worktime?.punches ?? []).map(p => ({
    in: secToTimeInput(p.in),
    out: p.out === undefined ? null : secToTimeInput(p.out),
  })),
)

const rows = computed(() => {
  const r: Array<{ punchIndex: number; field: 'in' | 'out'; label: string; value: string }> = []
  draft.forEach((p, i) => {
    r.push({ punchIndex: i, field: 'in', label: 'Clocked in', value: p.in })
    if (p.out !== null) r.push({ punchIndex: i, field: 'out', label: 'Clocked out', value: p.out })
  })
  return r
})

const error = ref<string | null>(null)

function validate(): string | null {
  const punches = draft.map(p => {
    const inSec = timeInputToSec(p.in)
    if (p.out === null) return { in: inSec }
    const outSec = timeInputToSec(p.out)
    return { in: inSec, out: outSec }
  })
  for (const p of punches) {
    if (p.out !== undefined && p.out < p.in)
      return 'Clocked-out time cannot be before clocked-in time.'
  }
  for (let i = 0; i < punches.length - 1; i++) {
    const out = punches[i].out
    if (out !== undefined && out > punches[i + 1].in)
      return `Punch ${i + 1} ends after punch ${i + 2} starts.`
  }
  return null
}

error.value = validate()

function onTimeInput(row: { punchIndex: number; field: 'in' | 'out' }, value: string) {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(value.trim())
  if (!m) return
  draft[row.punchIndex][row.field] = value
  error.value = validate()
}

async function save() {
  const err = validate()
  if (err) { error.value = err; return }
  const punches = draft.map(p => ({
    in: timeInputToSec(p.in),
    ...(p.out === null ? {} : { out: timeInputToSec(p.out) }),
  }))
  await store.replacePunches(punches)
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
          :key="`${row.punchIndex}-${row.field}`"
          class="flex items-center justify-between"
        >
          <span class="font-mono text-sm text-text-dim">{{ row.label }}</span>
          <input
            type="time"
            :value="row.value"
            @input="onTimeInput(row, ($event.target as HTMLInputElement).value)"
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
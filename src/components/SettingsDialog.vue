<script setup lang="ts">
import { reactive } from 'vue'
import { useClockStore } from '@/stores/clock'
import NumberInput from '@/components/ui/NumberInput.vue'
import Toggle from '@/components/ui/Toggle.vue'

const emit = defineEmits<{ close: [] }>()
const store = useClockStore()

interface Draft {
  targetHours: number
  break1Enabled: boolean
  break1TriggerHours: number
  break1DurationMinutes: number
  break2Enabled: boolean
  break2TriggerHours: number
  break2DurationMinutes: number
}

const s = store.settings
const draft = reactive<Draft>({
  targetHours: s ? s.daily_target / 3600 : 8,
  break1Enabled: s ? s.break1_enabled : true,
  break1TriggerHours: s ? s.break1_trigger / 3600 : 6,
  break1DurationMinutes: s ? s.break1_duration / 60 : 30,
  break2Enabled: s ? s.break2_enabled : true,
  break2TriggerHours: s ? s.break2_trigger / 3600 : 9,
  break2DurationMinutes: s ? s.break2_duration / 60 : 15,
})

function onBreak1Toggle(v: boolean) {
  draft.break1Enabled = v
  if (!v) draft.break2Enabled = false
}

async function save() {
  await store.setSettings({
    daily_target: draft.targetHours * 3600,
    break1_enabled: draft.break1Enabled,
    break1_trigger: draft.break1TriggerHours * 3600,
    break1_duration: draft.break1DurationMinutes * 60,
    break2_enabled: draft.break2Enabled,
    break2_trigger: draft.break2TriggerHours * 3600,
    break2_duration: draft.break2DurationMinutes * 60,
  })
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
        <span class="font-mono text-xs tracking-widest text-text-dim uppercase">Settings</span>
        <button
          type="button"
          class="font-mono text-text-faint hover:text-text text-lg leading-none transition-colors"
          aria-label="Close"
          @click="emit('close')"
        >×</button>
      </div>

      <div class="px-6 py-5 flex flex-col gap-8">
        <section>
          <div class="font-mono text-[10px] tracking-widest text-text-faint uppercase mb-4">Daily target</div>
          <div class="flex items-center justify-between">
            <span class="font-mono text-sm text-text-dim">Target work hours</span>
            <div class="flex items-center gap-2">
              <NumberInput v-model="draft.targetHours" :min="1" :max="24" :step="0.5" />
              <span class="font-mono text-xs text-text-faint">h</span>
            </div>
          </div>
        </section>

        <section>
          <div class="font-mono text-[10px] tracking-widest text-text-faint uppercase mb-4">Automatic breaks</div>
          <div class="flex flex-col gap-5">
            <div v-for="i in 2" :key="i" class="flex flex-col gap-3">
              <div class="flex items-center justify-between">
                <span class="font-mono text-sm text-text-dim">Break {{ i }}</span>
                <Toggle
                  :modelValue="i === 1 ? draft.break1Enabled : draft.break2Enabled"
                  @update:modelValue="i === 1 ? onBreak1Toggle($event) : (draft.break2Enabled = $event)"
                />
              </div>
              <div
                class="flex flex-col gap-3 pl-4 border-l transition-opacity duration-200"
                :style="{
                  borderColor: (i === 1 ? draft.break1Enabled : draft.break2Enabled) ? 'var(--color-border-2)' : '#1a1a1a',
                  opacity: (i === 1 ? draft.break1Enabled : draft.break2Enabled) ? 1 : 0.35,
                }"
              >
                <div class="flex items-center justify-between">
                  <span class="font-mono text-xs text-text-dim">Trigger after</span>
                  <div class="flex items-center gap-2">
                    <NumberInput
                      :modelValue="i === 1 ? draft.break1TriggerHours : draft.break2TriggerHours"
                      @update:modelValue="i === 1 ? (draft.break1TriggerHours = $event) : (draft.break2TriggerHours = $event)"
                      :min="0.5" :max="23" :step="0.5"
                      :disabled="i === 1 ? !draft.break1Enabled : !draft.break2Enabled"
                    />
                    <span class="font-mono text-xs text-text-faint">h worked</span>
                  </div>
                </div>
                <div class="flex items-center justify-between">
                  <span class="font-mono text-xs text-text-dim">Break duration</span>
                  <div class="flex items-center gap-2">
                    <NumberInput
                      :modelValue="i === 1 ? draft.break1DurationMinutes : draft.break2DurationMinutes"
                      @update:modelValue="i === 1 ? (draft.break1DurationMinutes = $event) : (draft.break2DurationMinutes = $event)"
                      :min="1" :max="120" :step="1"
                      :disabled="i === 1 ? !draft.break1Enabled : !draft.break2Enabled"
                    />
                    <span class="font-mono text-xs text-text-faint">min</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div class="flex justify-end gap-3 px-6 py-4 border-t border-border">
        <button
          type="button"
          class="font-mono text-xs tracking-widest uppercase px-5 py-2 border border-border-2 text-text-faint hover:text-text hover:border-text-faint transition-colors"
          @click="emit('close')"
        >Cancel</button>
        <button
          type="button"
          class="font-mono text-xs tracking-widest uppercase px-5 py-2 bg-work text-bg font-bold hover:bg-work-hi transition-colors"
          @click="save"
        >Save</button>
      </div>
    </div>
  </div>
</template>

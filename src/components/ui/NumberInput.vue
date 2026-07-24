<script setup lang="ts">
const props = defineProps<{ modelValue: number; min: number; max: number; step?: number; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [number] }>()
function onInput(e: Event) {
  const v = parseFloat((e.target as HTMLInputElement).value)
  if (!Number.isNaN(v)) emit('update:modelValue', Math.min(props.max, Math.max(props.min, v)))
}
</script>

<template>
  <input
    type="number"
    :value="modelValue"
    :min="min"
    :max="max"
    :step="step ?? 0.5"
    :disabled="disabled"
    @input="onInput"
    class="font-mono text-sm w-20 bg-surface border border-border-2 text-text px-2 py-1 text-right focus:outline-none focus:border-work disabled:opacity-30 disabled:cursor-not-allowed"
  />
</template>

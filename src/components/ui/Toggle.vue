<script setup lang="ts">
defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="modelValue"
    class="relative w-9 h-5 flex-shrink-0 transition-colors duration-200 focus:outline-none"
    :style="{ backgroundColor: modelValue ? 'var(--color-work)' : '#222' }"
    @click="emit('update:modelValue', !modelValue)"
  >
    <span
      class="absolute top-0.5 left-0.5 w-4 h-4 bg-bg transition-transform duration-200"
      :style="{ transform: modelValue ? 'translateX(16px)' : 'translateX(0)' }"
    />
  </button>
</template>

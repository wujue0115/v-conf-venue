<script setup lang="ts">
defineProps<{
  /** The current colour, #rrggbb */
  value: string
  /** Quick picks; anything else shows on the last, custom chip */
  colors: readonly string[]
  label: string
}>()
const emit = defineEmits<{ pick: [color: string] }>()
</script>

<template>
  <div class="colors" role="radiogroup" :aria-label="label">
    <button
      v-for="c in colors"
      :key="c"
      class="chip"
      :class="{ on: value === c }"
      :style="{ background: c }"
      type="button"
      role="radio"
      :aria-checked="value === c"
      :aria-label="c"
      @click="emit('pick', c)"
    ></button>
    <!-- the colour picker applies on close (change), so dragging through colours isn't one undo step each -->
    <label
      class="chip custom"
      :class="{ on: !colors.includes(value) }"
      :style="colors.includes(value) ? undefined : { background: value }"
      title="自訂顏色"
    >
      <input
        type="color"
        :value="value"
        aria-label="自訂顏色"
        @change="emit('pick', ($event.target as HTMLInputElement).value)"
      />
    </label>
  </div>
</template>

<style scoped>
.colors {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.chip {
  position: relative;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15);
  cursor: pointer;
}
.chip.on {
  box-shadow:
    0 0 0 2px #fff,
    0 0 0 4px var(--ink);
}
.chip:focus-visible,
.chip:focus-within {
  outline: 2px solid var(--yel);
  outline-offset: 3px;
}
/* rainbow until a custom colour is chosen */
.custom {
  background: conic-gradient(#f44, #fd4, #4d6, #4bf, #84f, #f4a, #f44);
}
.custom input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}
</style>

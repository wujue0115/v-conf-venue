<script setup lang="ts">
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import { usePlannerStore } from '@/stores/planner'

const store = usePlannerStore()
const visible = shallowRef(false)
let timer: ReturnType<typeof setTimeout> | undefined

watch(
  () => store.toast,
  (t) => {
    if (!t) return
    visible.value = true
    clearTimeout(timer)
    timer = setTimeout(() => (visible.value = false), 2200)
  },
)
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div class="hint" :class="{ show: visible }" role="status">{{ store.toast?.message }}</div>
</template>

<style scoped>
.hint {
  position: absolute;
  left: calc(50% + var(--stage-inset, 0px) / 2);
  top: 64px;
  transform: translateX(-50%);
  background: var(--ink);
  color: #fff;
  font-size: 12.5px;
  padding: 7px 12px;
  border-radius: 8px;
  opacity: 0;
  transition: opacity 0.25s;
  pointer-events: none;
}
.hint.show {
  opacity: 1;
}
</style>

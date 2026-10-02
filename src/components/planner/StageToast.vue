<script setup lang="ts">
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import { toastDuration, usePlannerStore } from '@/stores/planner'

const store = usePlannerStore()
const visible = shallowRef(false)
let timer: ReturnType<typeof setTimeout> | undefined

// From mount too: a toast given just before the page changed under it (signing out closes the
// project for the sign-in card) shows on for the rest of its time
watch(
  () => store.toast,
  (t) => {
    if (!t) return
    // longer ones stay up long enough to read
    const left = t.at + toastDuration(t.message) - Date.now()
    if (left <= 0) return
    visible.value = true
    clearTimeout(timer)
    timer = setTimeout(() => (visible.value = false), left)
  },
  { immediate: true },
)
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div class="hint toast-card" :class="{ show: visible }" role="status">
    {{ store.toast?.message }}
  </div>
</template>

<style scoped>
.hint {
  position: absolute;
  left: 14px;
  right: 14px;
  width: fit-content;
  margin-inline: auto;
  top: var(--top-clear, 66px);
}
</style>

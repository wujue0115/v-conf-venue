<script setup lang="ts">
import { shallowRef, useId, watch } from 'vue'
import { readJSON, writeJSON } from '@/venue/storage'

const props = defineProps<{
  title: string
  note?: string
  /** localStorage key that remembers whether the section is collapsed */
  storageKey: string
}>()

const collapsed = shallowRef(readJSON(props.storageKey) === true)
watch(collapsed, (v) => writeJSON(props.storageKey, v))
const bodyId = useId()
</script>

<template>
  <section class="sec">
    <button
      class="st"
      type="button"
      :aria-expanded="!collapsed"
      :aria-controls="bodyId"
      @click="collapsed = !collapsed"
    >
      <svg
        class="chev"
        :class="{ closed: collapsed }"
        viewBox="0 0 16 16"
        width="12"
        height="12"
        aria-hidden="true"
      >
        <path
          d="M4 6l4 4 4-4"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      {{ title }}
      <span v-if="note" class="note">{{ note }}</span>
    </button>
    <!-- grid-template-rows 1fr ↔ 0fr animates to the content's natural height -->
    <div :id="bodyId" class="body" :class="{ closed: collapsed }" :inert="collapsed">
      <div class="inner">
        <div class="pad">
          <slot />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.sec + .sec {
  margin-top: 4px;
}
.st {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 3px;
  padding: 6px 4px;
  border: 0;
  border-radius: 6px;
  background: none;
  font-size: 12px;
  font-weight: 700;
  color: var(--muted);
  text-align: left;
  cursor: pointer;
}
.st:hover {
  background: #f4f1ea;
}
.st:focus-visible {
  outline: 2px solid var(--yel);
  outline-offset: 1px;
}
.note {
  margin-left: auto;
  font: 500 11px var(--mono);
  color: var(--faint);
}
.chev {
  flex: none;
  color: var(--faint);
  transition: transform 0.25s ease;
}
.chev.closed {
  transform: rotate(-90deg);
}
.body {
  display: grid;
  grid-template-rows: 1fr;
  transition: grid-template-rows 0.28s ease;
}
.body.closed {
  grid-template-rows: 0fr;
}
.inner {
  /* no padding or vertical margin here: at 0fr they would stay visible below the clip */
  min-height: 0;
  overflow: hidden;
  margin: 0 -3px;
}
.pad {
  /* room for the tiles' 3px hover ring, which the overflow would otherwise clip */
  padding: 3px;
}
@media (prefers-reduced-motion: reduce) {
  .body,
  .chev {
    transition: none;
  }
}
</style>

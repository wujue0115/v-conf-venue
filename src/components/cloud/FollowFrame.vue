<script setup lang="ts">
import { computed } from 'vue'
import { t } from '@/i18n'
import { colorOf, useCollabStore } from '@/stores/collab'

/** While following someone's view: the stage framed in their colour, and a way to stop */

const collab = useCollabStore()
const who = computed(() => collab.peers.find((p) => p.key === collab.following) ?? null)
</script>

<template>
  <div v-if="who" class="frame" :style="{ '--c': colorOf(who.user) }">
    <div class="chip" data-stage-ui :title="t().collab.followHint">
      <span>{{ t().collab.following(who.name || t().collab.someone) }}</span>
      <button type="button" @click="collab.follow(null)">{{ t().collab.stopFollowing }}</button>
    </div>
  </div>
</template>

<style scoped>
.frame {
  position: absolute;
  inset: 0;
  z-index: 2;
  border: 3px solid var(--c);
  pointer-events: none;
}
.chip {
  position: absolute;
  left: 50%;
  top: var(--top-clear, 66px);
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: calc(100% - 28px);
  padding: 5px 6px 5px 12px;
  border-radius: 999px;
  background: var(--c);
  color: #fff;
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
  pointer-events: auto;
}
.chip span {
  overflow: hidden;
  text-overflow: ellipsis;
}
.chip button {
  height: 24px;
  padding: 0 10px;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--c);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.chip button:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
}
</style>

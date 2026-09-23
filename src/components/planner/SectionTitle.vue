<script setup lang="ts">
defineProps<{ title: string; note?: string }>()
</script>

<template>
  <div class="st">
    {{ title }} <span v-if="note">{{ note }}</span>
  </div>
</template>

<style scoped>
.st {
  font-size: 12px;
  font-weight: 700;
  color: var(--muted);
  margin: 4px 4px 10px;
  display: flex;
  justify-content: space-between;
}
.st span {
  font: 500 11px var(--mono);
  color: var(--faint);
}
</style>

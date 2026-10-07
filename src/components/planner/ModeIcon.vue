<script setup lang="ts">
/** The icon for 檢視, 編輯 or 導覽 (stroked in the current colour by whoever shows it) */
defineProps<{ mode: 'view' | 'edit' | 'tour' }>()
</script>

<template>
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <template v-if="mode === 'view'">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </template>
    <path v-else-if="mode === 'edit'" d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    <!-- someone walking: arms swinging, one leg a step ahead of the other -->
    <template v-else>
      <circle cx="13" cy="4" r="1.75" />
      <path d="M6 12l2-3 4-1 3 3 3 1" />
      <path d="M12 8l-1 6 3 3 2 4" />
      <path d="M11 14l-1 3-3 4" />
    </template>
  </svg>
</template>

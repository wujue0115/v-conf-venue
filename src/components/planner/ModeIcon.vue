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
    <!-- someone walking -->
    <template v-else>
      <circle cx="13.5" cy="4.5" r="2" />
      <path d="M12.5 8.5 11 14M12.5 8.5 9 11.5M12.5 8.5l2.5 3 2.5 1M11 14l-3 7M11 14l3 3v4" />
    </template>
  </svg>
</template>

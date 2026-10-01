<script setup lang="ts">
import { RouterView, useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <!-- A fresh planner (and three.js scene) for each layout opened, not one reused between them -->
  <RouterView :key="String(route.params.projectId ?? route.name ?? '')" />
</template>

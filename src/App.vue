<script setup lang="ts">
import { RouterView, useRoute } from 'vue-router'
import SignInDialog from '@/components/auth/SignInDialog.vue'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const auth = useAuthStore()
</script>

<template>
  <!-- A fresh planner (and three.js scene) for each layout opened, not one reused between them -->
  <RouterView
    :key="String(route.params.projectId ?? route.params.shareToken ?? route.name ?? '')"
  />
  <SignInDialog v-if="auth.available" />
</template>

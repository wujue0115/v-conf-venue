<script setup lang="ts">
import { computed } from 'vue'
import DockMenu from './DockMenu.vue'
import { useCameraViews } from '@/composables/useCameraViews'
import { t } from '@/i18n'

/**
 * The camera views as one menu in the phone's bottom bar: it shows the view last flown to,
 * and lists them all above it
 */

const { views, active, flyTo } = useCameraViews()
const items = computed(() => views.map((v, i) => ({ key: String(i), label: t().views[v.key] })))
</script>

<template>
  <DockMenu
    :label="t().views.pick"
    :items="items"
    :current="String(active)"
    @pick="(k) => flyTo(views[+k]!, +k)"
  />
</template>

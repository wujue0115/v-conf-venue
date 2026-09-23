<script setup lang="ts">
import { shallowRef, useTemplateRef } from 'vue'
import { useVenueEditor } from '@/composables/useVenueEditor'
import { usePlannerStore } from '@/stores/planner'
import { exportLayout, parseLayout } from '@/venue/layout'
import { VIEWS, type CameraView } from '@/venue/places'

const store = usePlannerStore()
const editor = useVenueEditor()
const fileInput = useTemplateRef('file')
const activeView = shallowRef(0)

function flyTo(view: CameraView, i: number) {
  activeView.value = i
  editor.value?.flyTo(view)
}

function clearAll() {
  if (!store.items.length || !confirm('確定要清空所有擺放的物件嗎？（可用復原找回）')) return
  editor.value?.clear()
}

function download() {
  const blob = new Blob([exportLayout(store.items)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'vueconf2026-layout.json'
  a.click()
  URL.revokeObjectURL(a.href)
}

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  if (!f) return
  try {
    editor.value?.load(parseLayout(JSON.parse(await f.text())), { record: true })
    store.notify('已匯入配置')
  } catch {
    store.notify('檔案格式錯誤')
  }
  input.value = ''
}
</script>

<template>
  <div class="topbars">
    <div class="bar" data-stage-ui>
      <div class="grp">
        <button
          v-for="(v, i) in VIEWS"
          :key="v.name"
          class="btn"
          :class="{ on: activeView === i }"
          @click="flyTo(v, i)"
        >
          {{ v.name }}
        </button>
      </div>
    </div>
    <div class="bar tools" data-stage-ui>
      <div class="grp">
        <button
          class="btn"
          :class="{ on: store.snap }"
          title="格點吸附 0.25m"
          @click="store.snap = !store.snap"
        >
          吸附
        </button>
        <button
          class="btn"
          :class="{ on: store.wallsCut }"
          title="剖切牆面"
          @click="store.wallsCut = !store.wallsCut"
        >
          剖切牆面
        </button>
        <button
          class="btn"
          :class="{ on: store.showLabels }"
          @click="store.showLabels = !store.showLabels"
        >
          標籤
        </button>
      </div>
      <div class="grp">
        <button class="btn" @click="editor?.undo()">復原 <kbd>⌘Z</kbd></button>
        <button class="btn" @click="download">匯出</button>
        <button class="btn" @click="fileInput?.click()">匯入</button>
        <button class="btn danger" @click="clearAll">清空</button>
      </div>
    </div>
    <input ref="file" type="file" accept=".json,application/json" hidden @change="onFile" />
  </div>
</template>

<style scoped>
.topbars {
  position: absolute;
  top: calc(14px + env(safe-area-inset-top, 0px));
  left: calc(var(--stage-inset, 0px) + 14px);
  right: 14px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 6px;
  flex-wrap: wrap;
  pointer-events: none;
}
.bar {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  pointer-events: auto;
}
.tools {
  justify-content: flex-end;
  margin-left: auto;
}
</style>

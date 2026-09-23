<script setup lang="ts">
import FurniturePalette from './FurniturePalette.vue'
import LayoutSummary from './LayoutSummary.vue'
</script>

<template>
  <aside class="side">
    <div class="hd">
      <div class="eyebrow">VUECONF TAIWAN 2026 · 10/17</div>
      <h1>政大公企 · A 棟 2F<br />3D 場地規劃</h1>
      <p>把左側物件拖曳到場地中擺放，點選物件可旋轉、複製或陣列排列。配置會自動存在這台電腦。</p>
    </div>
    <div class="scroll">
      <FurniturePalette />
      <LayoutSummary />
    </div>
  </aside>
</template>

<style scoped>
.side {
  background: #fff;
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.hd {
  padding: 20px 20px 16px;
  border-bottom: 1px solid #eee9de;
}
.eyebrow {
  font: 500 11px/1 var(--mono);
  letter-spacing: 0.08em;
  color: #8a6a1c;
}
h1 {
  margin: 10px 0 6px;
  font-size: 19px;
  line-height: 1.3;
  font-weight: 700;
}
.hd p {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
  text-wrap: pretty;
}
.scroll {
  overflow: auto;
  flex: 1;
  padding: 16px 16px 20px;
}
</style>

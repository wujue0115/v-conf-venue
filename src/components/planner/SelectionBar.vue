<script setup lang="ts">
import { computed, nextTick, shallowRef, useTemplateRef, watch } from 'vue'
import ColorChips from './ColorChips.vue'
import TagCombobox from './TagCombobox.vue'
import TriCheckbox from './TriCheckbox.vue'
import { useFurnitureThumbnails } from '@/composables/useFurnitureThumbnails'
import { useVenueEditor } from '@/composables/useVenueEditor'
import { usePlannerStore } from '@/stores/planner'
import {
  FURNITURE,
  PEOPLE_MAX,
  PERSON_COLOR,
  TAG_COLOR,
  isWallItem,
  onTableOnly,
  priceOf,
  thumbKey,
  variantAxesOf,
} from '@/venue/furniture'
import { LID_MAX } from '@/venue/laptop'
import { POSTER_PRESETS, readPosterImage, type PosterFit } from '@/venue/poster'
import { INFO_MAX, TAG_MAX, formatNT } from '@/venue/layout'
import { nameOf, t, variantLabel, variantName } from '@/i18n'
import { BELT_MAX } from '@/venue/stanchions'
import { ZONE_COLOR } from '@/venue/zone'

const store = usePlannerStore()
const editor = useVenueEditor()
const thumbs = useFurnitureThumbnails()

const cols = shallowRef(5)
const rows = shallowRef(4)
const dx = shallowRef(1)
const dz = shallowRef(1)

const sel = computed(() => store.selection)
/**
 * Quick picks for people's colour: a light skin tone by default, then soft tints so figures
 * don't overpower the furniture. The last chip opens a colour picker.
 */
const PERSON_COLORS = [PERSON_COLOR, '#42b883', '#8fb3d9', '#f2cf73', '#ec9a93', '#8a8f99']
const ZONE_COLORS = [ZONE_COLOR, '#4a90d9', '#edb32a', '#e57373', '#9575cd', '#8a8f99']
/** Quick picks for a tag on anything but a person or zone */
const TAG_COLORS = [TAG_COLOR, '#42b883', '#4a90d9', '#edb32a', '#e57373', '#9575cd']
/**
 * Tags already used in the layout, most used first. Zones keep their own tag list, so a zone
 * never suggests another item's tag and the other way round.
 */
const usedTags = computed(() => {
  const zone = sel.value?.type === 'zone'
  const n = new Map<string, number>()
  for (const i of store.items)
    if (i.tag && (i.t === 'zone') === zone) n.set(i.tag, (n.get(i.tag) ?? 0) + 1)
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t)
})

// The note being typed; saved (one undo step) when the box loses focus
const info = shallowRef('')
watch(
  () => sel.value?.info,
  (v) => (info.value = v ?? ''),
  { immediate: true },
)
const saveInfo = () => editor.value?.setInfo(info.value)

// A group's name, renamed when the box is committed; a name another group has is refused
const groupName = shallowRef('')
watch(
  () => sel.value?.group,
  (g) => (groupName.value = g ?? ''),
  { immediate: true },
)
const gnameInput = useTemplateRef('gname')
/** Make the group, then put the cursor in its name so it can be named straight away */
async function makeGroup() {
  editor.value?.makeGroup()
  await nextTick()
  gnameInput.value?.focus()
  gnameInput.value?.select()
}
function renameGroup() {
  const from = sel.value?.group ?? ''
  if (groupName.value.trim() === from) return
  if (!editor.value?.renameGroup(groupName.value)) {
    if (groupName.value.trim()) store.notify(t().grouping.nameTaken)
    groupName.value = from
  }
}

// Zone size in metres, applied when an input is committed
const zw = shallowRef(0)
const zd = shallowRef(0)
watch(
  () => sel.value?.zone,
  (z) => {
    if (!z) return
    zw.value = z.w
    zd.value = z.d
  },
  { immediate: true },
)
const def = computed(() => (sel.value ? FURNITURE[sel.value.type] : null))
/** Quick picks for a laptop's lid */
const LID_PRESETS = computed(() => [
  { name: t().sel.lidShut, deg: 0 },
  { name: '90°', deg: 90 },
  { name: '110°', deg: 110 },
  { name: t().sel.lidFull, deg: LID_MAX },
])
const axes = computed(() => (sel.value ? variantAxesOf(sel.value.type) : []))
/** The selected option on each axis */
const picked = computed(() => sel.value?.variant?.split('-') ?? [])
function pick(axis: number, id: string) {
  const parts = [...picked.value]
  parts[axis] = id
  editor.value?.setVariant(parts.join('-'))
}
const thumb = computed(() =>
  sel.value ? thumbs.value[thumbKey(sel.value.type, sel.value.variant)] : '',
)
const price = computed(() => {
  if (!sel.value) return ''
  const p = priceOf(sel.value.type)
  if (!p) return t().summary.free
  return sel.value.billed === false ? t().summary.unbilled : formatNT(p[store.priceMode])
})
const position = computed(() => {
  const s = sel.value
  if (!s) return ''
  const xz = `x ${s.x.toFixed(2)} · z ${s.z.toFixed(2)}`
  return isWallItem(s.type) ? t().sel.wallPos(xz, s.y.toFixed(2)) : `${xz} · ${s.deg}°`
})

// Size (posters and 易拉展), edited in centimetres
const cm = (m: number) => Math.round(m * 1000) / 10
const pw = shallowRef(0)
const ph = shallowRef(0)
watch(
  () => sel.value?.size,
  (sz) => {
    if (!sz) return
    pw.value = cm(sz.w)
    ph.value = cm(sz.h)
  },
  { immediate: true },
)
const applySize = () => editor.value?.setPosterSize(pw.value / 100, ph.value / 100)
function applyPreset(w: number, h: number) {
  const sz = sel.value?.size
  // keep the item's current orientation
  if (sz && sz.w > sz.h) editor.value?.setPosterSize(h, w, true)
  else editor.value?.setPosterSize(w, h, true)
}

const fileInput = useTemplateRef('file')
// After picking an image whose proportions differ from the current size, ask how to fit it
const pending = shallowRef<{ url: string; aspect: number } | null>(null)
const fitDialog = useTemplateRef('fitDialog')
const sizeAspect = computed(() => {
  const sz = sel.value?.size
  return sz ? sz.w / sz.h : 1
})
/** CSS size of a preview box with the given aspect, fitting inside 120 × 120 */
const box = (aspect: number) =>
  aspect >= 1
    ? { width: '120px', height: `${120 / aspect}px` }
    : { width: `${120 * aspect}px`, height: '120px' }

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (!f) return
  try {
    const img = await readPosterImage(f)
    // a face with no adjustable size always crops to fill, so there is nothing to ask
    if (!sel.value?.size || Math.abs(img.aspect / sizeAspect.value - 1) < 0.01) {
      editor.value?.setPosterImage(img.url, img.aspect)
      return
    }
    pending.value = img
    fitDialog.value?.showModal()
  } catch {
    store.notify(t().sel.imageUnreadable)
  }
}
function chooseFit(fit: PosterFit) {
  const p = pending.value
  if (p) editor.value?.setPosterImage(p.url, p.aspect, fit)
  fitDialog.value?.close()
}

// Reset the array spacing to the furniture's default whenever a different type gets selected
watch(def, (d) => {
  if (!d) return
  dx.value = d.arr[0]
  dz.value = d.arr[1]
})

const rotate = (deg: number) => editor.value?.rotate(deg)
const generate = () =>
  editor.value?.arrayFromSelected({
    cols: cols.value,
    rows: rows.value,
    dx: dx.value,
    dz: dz.value,
  })
</script>

<template>
  <!-- several items: they move, nudge and delete together -->
  <div v-if="sel && sel.count > 1" class="sel" data-stage-ui>
    <div class="head">
      <div class="meta">
        <div class="title">
          <b>{{ t().sel.multi(sel.count) }}</b>
        </div>
        <div class="pos">{{ t().sel.multiHint }}</div>
      </div>
      <button class="btn" @click="editor?.clearSelection()">{{ t().sel.deselect }}</button>
      <button class="btn" :title="t().sel.duplicateTitle" @click="editor?.duplicate()">
        {{ t().sel.duplicate }}
      </button>
      <button class="btn danger" :title="t().sel.deleteTitle" @click="editor?.remove()">
        {{ t().sel.delete }}
      </button>
    </div>
    <div v-if="sel.group" class="rows">
      <span class="lbl">{{ t().grouping.label }}</span>
      <div class="ctl">
        <input
          ref="gname"
          v-model="groupName"
          class="gname"
          :maxlength="TAG_MAX"
          :aria-label="t().grouping.name"
          @change="renameGroup"
          @keydown.enter="($event.target as HTMLInputElement).blur()"
        />
        <button class="btn" @click="editor?.ungroup()">{{ t().grouping.ungroup }}</button>
      </div>
    </div>
    <div v-else class="ctl">
      <button class="btn" @click="makeGroup">{{ t().grouping.make }}</button>
    </div>
  </div>

  <div v-else-if="sel && def" class="sel" data-stage-ui>
    <div class="head">
      <img :src="thumb" alt="" />
      <div class="meta">
        <div class="title">
          <b>{{ nameOf(sel.type) }}</b
          ><span class="price">{{ price }}</span>
        </div>
        <div class="pos">{{ position }}</div>
      </div>
      <button class="btn danger" :title="t().sel.deleteTitle" @click="editor?.remove()">
        {{ t().sel.delete }}
      </button>
    </div>

    <div class="rows">
      <template v-for="(a, i) in axes" :key="a.label">
        <span class="lbl">{{ variantLabel(a.label) }}</span>
        <div class="ctl swatches" role="radiogroup" :aria-label="variantLabel(a.label)">
          <button
            v-for="v in a.options"
            :key="v.id"
            class="swatch"
            :class="{ on: picked[i] === v.id }"
            type="button"
            role="radio"
            :aria-checked="picked[i] === v.id"
            @click="pick(i, v.id)"
          >
            <span v-if="v.swatch" class="dot" :style="{ background: v.swatch }"></span
            >{{ variantName(sel.type, v.id) }}
          </button>
        </div>
      </template>

      <template v-if="sel.laptop">
        <span class="lbl">{{ t().sel.lid }}</span>
        <div class="ctl lid">
          <input
            type="range"
            min="0"
            :max="LID_MAX"
            step="1"
            :value="sel.laptop.open"
            :aria-label="t().sel.lidAngle"
            @input="editor?.setLidAngle(+($event.target as HTMLInputElement).value, true)"
            @change="editor?.setLidAngle(+($event.target as HTMLInputElement).value)"
          />
          <span class="deg">{{ sel.laptop.open }}°</span>
          <button
            v-for="p in LID_PRESETS"
            :key="p.deg"
            class="btn"
            :class="{ on: sel.laptop.open === p.deg }"
            @click="editor?.setLidAngle(p.deg)"
          >
            {{ p.name }}
          </button>
        </div>
      </template>

      <template v-if="sel.size">
        <span class="lbl">{{ t().sel.size }}</span>
        <div class="ctl arr">
          <div class="pair" role="group" :aria-label="t().sel.widthHeightCm">
            <input
              v-model.number="pw"
              type="number"
              inputmode="decimal"
              step="1"
              :aria-label="t().sel.widthCm"
              @change="applySize"
            />
            <button
              class="lock"
              :class="{ on: sel.size.lock }"
              type="button"
              :title="sel.size.lock ? t().sel.lockOn : t().sel.lock"
              :aria-label="sel.size.lock ? t().sel.unlock : t().sel.lock"
              :aria-pressed="sel.size.lock"
              @click="editor?.setPosterLock(!sel.size.lock)"
            >
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor" />
                <path
                  :d="sel.size.lock ? 'M5.5 7V5a2.5 2.5 0 0 1 5 0v2' : 'M5.5 7V5a2.5 2.5 0 0 1 5 0'"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                />
              </svg>
            </button>
            <input
              v-model.number="ph"
              type="number"
              inputmode="decimal"
              step="1"
              :aria-label="t().sel.heightCm"
              @change="applySize"
            />
            <span class="op">cm</span>
          </div>
          <span v-if="sel.size.presets" class="presets">
            <button
              v-for="p in POSTER_PRESETS"
              :key="p.name"
              class="btn"
              :title="`${cm(p.w)} × ${cm(p.h)} cm`"
              @click="applyPreset(p.w, p.h)"
            >
              {{ p.name }}
            </button>
          </span>
        </div>
      </template>

      <template v-if="sel.people">
        <span class="lbl">{{ t().sel.people }}</span>
        <div class="ctl">
          <div class="grp count" role="radiogroup" :aria-label="t().sel.people">
            <button
              v-for="k in PEOPLE_MAX"
              :key="k"
              class="btn"
              :class="{ on: sel.people.n === k }"
              role="radio"
              :aria-checked="sel.people.n === k"
              :disabled="sel.people.sit && k !== 1"
              @click="editor?.setPeople({ n: k })"
            >
              {{ k }}
            </button>
          </div>
          <span v-if="sel.people.sit" class="hint">{{ t().sel.seatedOne }}</span>
        </div>

        <span class="lbl">{{ t().sel.colour }}</span>
        <div class="ctl">
          <ColorChips
            :value="sel.people.color"
            :colors="PERSON_COLORS"
            :label="t().sel.personColour"
            @pick="editor?.setPeople({ color: $event })"
          />
        </div>
      </template>

      <template v-if="sel.zone">
        <span class="lbl">{{ t().sel.size }}</span>
        <div class="ctl arr">
          <div class="pair" role="group" :aria-label="t().sel.widthDepthM">
            <input
              v-model.number="zw"
              type="number"
              inputmode="decimal"
              step="0.25"
              min="0.25"
              :aria-label="t().sel.widthM"
              @change="editor?.setZone({ w: zw })"
            />
            <span class="op">×</span>
            <input
              v-model.number="zd"
              type="number"
              inputmode="decimal"
              step="0.25"
              min="0.25"
              :aria-label="t().sel.depthM"
              @change="editor?.setZone({ d: zd })"
            />
            <span class="op">m</span>
          </div>
          <span class="hint">{{ t().sel.dragCorners }}</span>
        </div>

        <span class="lbl">{{ t().sel.colour }}</span>
        <div class="ctl">
          <ColorChips
            :value="sel.zone.color"
            :colors="ZONE_COLORS"
            :label="t().sel.zoneColour"
            @pick="editor?.setZone({ color: $event })"
          />
        </div>
      </template>

      <span class="lbl">{{ t().sel.tag }}</span>
      <div class="ctl">
        <TagCombobox :value="sel.tag" :options="usedTags" @commit="editor?.setTag($event)" />
      </div>

      <template v-if="sel.tag && sel.tagColor">
        <span class="lbl">{{ t().sel.tagColour }}</span>
        <div class="ctl">
          <ColorChips
            :value="sel.tagColor"
            :colors="TAG_COLORS"
            :label="t().sel.tagColour"
            @pick="editor?.setTagColor($event)"
          />
        </div>
      </template>

      <span class="lbl">{{ t().sel.info }}</span>
      <div class="ctl">
        <textarea
          v-model="info"
          class="info"
          rows="2"
          :maxlength="INFO_MAX"
          :placeholder="t().sel.infoPlaceholder"
          :aria-label="t().sel.infoLabel"
          @change="saveInfo"
        ></textarea>
      </div>

      <template v-if="sel.group">
        <span class="lbl">{{ t().grouping.label }}</span>
        <div class="ctl">
          <span class="hint">{{ sel.group }}</span>
          <button class="btn" @click="editor?.ungroup()">{{ t().grouping.leave }}</button>
        </div>
      </template>

      <template v-if="sel.billed !== undefined">
        <span class="lbl">{{ t().sel.billing }}</span>
        <label class="ctl billed">
          <TriCheckbox
            :state="sel.billed ? 'on' : 'off'"
            :label="t().sel.billed"
            @toggle="editor?.setBilled(!sel.billed)"
          />
          {{ t().sel.billed }}
        </label>
      </template>

      <template v-if="!isWallItem(sel.type)">
        <span class="lbl">{{ t().sel.rotate }}</span>
        <div class="ctl">
          <button class="btn" :title="t().sel.ccw15" @click="rotate(15)">⟲ 15°</button>
          <button class="btn" :title="t().sel.cw15" @click="rotate(-15)">⟳ 15°</button>
          <button class="btn" :title="t().sel.ccw45" @click="rotate(45)">⟲ 45°</button>
          <button class="btn" :title="t().sel.cw45" @click="rotate(-45)">⟳ 45°</button>
          <button class="btn" :title="t().sel.cw90" @click="rotate(-90)">⟳ 90°</button>
          <button class="btn" :title="t().sel.turn180" @click="rotate(180)">180°</button>
          <button class="btn dup" :title="t().sel.duplicateTitle" @click="editor?.duplicate()">
            {{ t().sel.duplicate }}
          </button>
        </div>

        <template v-if="!sel.zone && !onTableOnly(sel.type)">
          <span class="lbl">{{ t().sel.array }}</span>
          <div class="ctl arr">
            <label class="pair" :title="t().sel.perRowByRows">
              <input
                v-model.number="cols"
                type="number"
                inputmode="numeric"
                min="1"
                :aria-label="t().sel.perRow"
              />
              <span class="op">×</span>
              <input
                v-model.number="rows"
                type="number"
                inputmode="numeric"
                min="1"
                :aria-label="t().sel.rows"
              />
            </label>
            <label class="pair" :title="t().sel.spacingTitle">
              <span class="op">{{ t().sel.spacing }}</span>
              <input
                v-model.number="dx"
                type="number"
                inputmode="decimal"
                step="0.05"
                :aria-label="t().sel.spacingX"
              />
              <span class="op">/</span>
              <input
                v-model.number="dz"
                type="number"
                inputmode="decimal"
                step="0.05"
                :aria-label="t().sel.spacingZ"
              />
              <span class="op">m</span>
            </label>
            <button class="btn gen" @click="generate">{{ t().sel.generate }}</button>
          </div>
        </template>
      </template>

      <template v-if="sel.image">
        <span class="lbl">{{ t().sel.image }}</span>
        <div class="ctl">
          <button class="btn" @click="fileInput?.click()">
            {{ sel.image.hasImage ? t().sel.replaceImage : t().sel.uploadImage }}
          </button>
          <button v-if="sel.image.hasImage" class="btn" @click="editor?.setPosterImage(null)">
            {{ t().sel.remove }}
          </button>
          <button
            v-if="isWallItem(sel.type)"
            class="btn dup"
            :title="t().sel.duplicateTitle"
            @click="editor?.duplicate()"
          >
            {{ t().sel.duplicate }}
          </button>
          <input ref="file" type="file" accept="image/*" hidden @change="onFile" />
          <dialog ref="fitDialog" class="fit-dialog" @close="pending = null">
            <template v-if="pending">
              <h3>{{ t().sel.fitTitle }}</h3>
              <p>{{ t().sel.fitAsk }}</p>
              <div class="choices">
                <button class="choice" type="button" @click="chooseFit('image')">
                  <span class="frame">
                    <img :src="pending.url" alt="" :style="box(pending.aspect)" />
                  </span>
                  <b>{{ t().sel.fitImage }}</b>
                  <i>{{ t().sel.fitImageHint }}</i>
                </button>
                <button class="choice" type="button" @click="chooseFit('poster')">
                  <span class="frame">
                    <img :src="pending.url" alt="" class="crop" :style="box(sizeAspect)" />
                  </span>
                  <b>{{ t().sel.fitKeep }}</b>
                  <i>{{ t().sel.fitKeepHint }}</i>
                </button>
              </div>
              <button class="btn cancel" type="button" @click="fitDialog?.close()">
                {{ t().sel.cancel }}
              </button>
            </template>
          </dialog>
        </div>
      </template>

      <template v-if="sel.type === 'stanchion'">
        <span class="lbl">{{ t().sel.belt }}</span>
        <div class="ctl belt">
          <span class="hint">{{ t().sel.beltHint(BELT_MAX) }}</span>
          <button v-if="sel.cutBelts" class="btn restore" @click="editor?.restoreBelts()">
            {{ t().sel.restoreBelts(sel.cutBelts) }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.sel {
  position: absolute;
  /* centered in the stage, clear of the sidebar on the left and the ? button on the right */
  left: calc(var(--stage-inset, 0px) + 14px);
  right: 62px;
  width: fit-content;
  max-width: calc(100% - var(--stage-inset, 0px) - 76px);
  margin-inline: auto;
  bottom: calc(18px + env(safe-area-inset-bottom, 0px));
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.1);
  padding: 10px 12px 12px;
}

/* Header: thumbnail, name + price, position, delete */
.head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 10px;
  margin-bottom: 10px;
  border-bottom: 1px solid #eee9de;
}
.head img {
  flex: none;
  width: 44px;
  height: 33px;
  object-fit: contain;
  background: var(--paper);
  border-radius: 6px;
}
.meta {
  flex: 1;
  min-width: 0;
}
.title,
.pos {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.title b {
  font-size: 14px;
}
.price {
  margin-left: 8px;
  font: 500 12px var(--mono);
  color: #8a6a1c;
}
.pos {
  font: 500 10.5px var(--mono);
  color: var(--faint);
}

/* Labelled control rows share one label column so everything lines up */
.rows {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: 8px 12px;
}
.lbl {
  /* matches the 30px controls so the label sits on the first line when a row wraps */
  line-height: 30px;
  font-size: 12px;
  color: var(--faint);
}
.ctl {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.ctl .btn {
  background: var(--paper);
}
.ctl .btn:hover {
  background: #f0ece2;
}
.dup {
  margin-left: auto;
}
.arr {
  gap: 6px 10px;
  font-size: 12px;
  color: var(--muted);
}
.pair {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.op {
  color: var(--faint);
}
.arr input {
  width: 46px;
  height: 30px;
  padding: 0 4px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #fff;
  font: 500 12px var(--mono);
  font-variant-numeric: tabular-nums;
  text-align: center;
  /* no spinner arrows: they ate the space and clipped values like 1.85 */
  appearance: textfield;
  -moz-appearance: textfield;
}
.arr input::-webkit-inner-spin-button,
.arr input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.arr input:focus {
  outline: 2px solid var(--yel);
  border-color: transparent;
}
.ctl .gen {
  margin-left: auto;
  background: var(--yel);
  color: #fff;
  font-weight: 600;
}
.ctl .gen:hover {
  background: #e3a817;
}
.fit-dialog {
  width: min(380px, calc(100vw - 32px));
  padding: 18px 18px 14px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #fff;
  color: var(--ink);
  box-shadow: 0 16px 50px rgba(0, 0, 0, 0.18);
}
.fit-dialog::backdrop {
  background: rgba(31, 33, 38, 0.35);
}
.fit-dialog h3 {
  margin: 0;
  font-size: 15px;
}
.fit-dialog p {
  margin: 4px 0 14px;
  font-size: 12.5px;
  color: var(--muted);
}
.choices {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.choice {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 8px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--paper);
  cursor: pointer;
  text-align: center;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
.choice:hover,
.choice:focus-visible {
  outline: none;
  border-color: var(--yel);
  box-shadow: 0 0 0 3px rgba(237, 179, 42, 0.18);
}
.frame {
  display: grid;
  place-items: center;
  width: 120px;
  height: 120px;
  margin-bottom: 4px;
}
.frame img {
  display: block;
  object-fit: contain;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
}
.frame img.crop {
  object-fit: cover;
}
.choice b {
  font-size: 13px;
}
.choice i {
  font-style: normal;
  font-size: 11px;
  color: var(--faint);
}
.cancel {
  display: block;
  margin: 12px 0 0 auto;
}
.lock {
  width: 26px;
  height: 26px;
  padding: 0;
  display: grid;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 6px;
  background: none;
  color: var(--faint);
  cursor: pointer;
}
.lock:hover {
  color: var(--ink);
  background: #f4f1ea;
}
.lock.on {
  color: #8a6a1c;
  background: #fdf7e6;
  border-color: rgba(237, 179, 42, 0.45);
}
.lock:focus-visible {
  outline: 2px solid var(--yel);
  outline-offset: 1px;
}
.presets {
  display: flex;
  gap: 4px;
  margin-left: auto;
}
.swatches {
  gap: 6px;
}
.swatch {
  height: 30px;
  padding: 0 10px 0 6px;
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: #fff;
  font-size: 12px;
  cursor: pointer;
}
.swatch:hover {
  background: var(--paper);
}
.swatch.on {
  border-color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--ink);
}
.swatch:focus-visible {
  outline: 2px solid var(--yel);
  outline-offset: 1px;
}
.lid {
  gap: 6px;
}
.lid .btn.on {
  border-color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--ink);
}
.lid input[type='range'] {
  flex: 1 1 120px;
  min-width: 0;
  accent-color: var(--ink);
}
.deg {
  min-width: 3.5em;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15);
}
.count {
  padding: 2px;
}
.count .btn {
  width: 30px;
  height: 26px;
  padding: 0;
  justify-content: center;
  font: 500 12px var(--mono);
}
.billed {
  gap: 8px;
  min-height: 30px;
  font-size: 12px;
  cursor: pointer;
}
.gname {
  flex: 1;
  min-width: 0;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #fff;
  font: inherit;
  font-size: 12px;
}
.gname:focus {
  outline: 2px solid var(--yel);
  outline-offset: 0;
  border-color: transparent;
}
.info {
  width: 100%;
  min-height: 52px;
  padding: 6px 8px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #fff;
  font: inherit;
  font-size: 12px;
  line-height: 1.5;
  resize: vertical;
}
.info:focus {
  outline: 2px solid var(--yel);
  outline-offset: 0;
  border-color: transparent;
}
.hint {
  font-size: 12px;
  line-height: 30px;
  color: var(--muted);
}
.restore {
  margin-left: auto;
}

/* Phones: a full-width sheet pinned above the bottom edge */
@media (max-width: 720px) {
  .sel {
    left: 10px;
    right: 10px;
    bottom: calc(10px + env(safe-area-inset-bottom, 0px));
    width: auto;
    max-width: none;
    padding: 8px 10px 10px;
  }
  .head {
    padding-bottom: 8px;
    margin-bottom: 8px;
  }
  .rows {
    gap: 6px 8px;
  }
  .ctl .btn {
    padding: 0 8px;
  }
  .arr {
    gap: 6px;
  }
  .arr input {
    width: 40px;
  }
}
</style>

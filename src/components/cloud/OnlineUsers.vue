<script setup lang="ts">
import { computed } from 'vue'
import { t } from '@/i18n'
import { colorOf, useCollabStore } from '@/stores/collab'

/**
 * Who else has the cloud project open, by the top bar: a face (or initial) per person in their
 * colour, the colour their selected items and pointer are drawn in. Four at most, then +n.
 * Clicking a face follows that person's view, as in Figma; clicking it again stops. Someone
 * only viewing can't be followed: their view can't be sent to the channel.
 */

const collab = useCollabStore()
const MAX = 4

const shown = computed(() => collab.people.slice(0, MAX))
const more = computed(() => collab.people.length - shown.value.length)
const label = computed(() =>
  [
    t().collab.online(collab.people.length),
    ...collab.people.map((p) => `${p.name || t().collab.someone} · ${t().collab.roles[p.role]}`),
  ].join('\n'),
)
const initial = (name: string) => [...(name || '?').trim()][0]?.toUpperCase() ?? '?'
const nameOf = (name: string) => name || t().collab.someone
/** Where Google's and GitHub's profile pictures are served from */
const PHOTO_HOSTS = ['googleusercontent.com', 'githubusercontent.com']
/**
 * Only Google's and GitHub's own profile pictures: a face is whatever its tab says it is, and
 * any other address would have everyone's browser fetch it (telling that server who's looking)
 */
function photo(url: string) {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' &&
      PHOTO_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith('.' + h))
      ? url
      : ''
  } catch {
    return ''
  }
}
const toggle = (key: string) => collab.follow(collab.following === key ? null : key)
const followable = (role: string) => role !== 'viewer'
function titleOf(p: { key: string; name: string; role: string }) {
  if (!followable(p.role)) return `${nameOf(p.name)} · ${t().collab.cantFollow}`
  return collab.following === p.key ? t().collab.stopFollowing : t().collab.follow(nameOf(p.name))
}
</script>

<template>
  <div
    v-if="collab.people.length"
    class="online grp"
    role="group"
    :aria-label="label"
    :title="label"
  >
    <button
      v-for="p in shown"
      :key="p.user"
      class="face"
      :class="{ on: collab.following === p.key }"
      type="button"
      :style="{ '--c': colorOf(p.user) }"
      :title="titleOf(p)"
      :aria-label="t().collab.follow(nameOf(p.name))"
      :aria-pressed="collab.following === p.key"
      :disabled="!followable(p.role)"
      @click="toggle(p.key)"
    >
      <img v-if="photo(p.avatar)" :src="photo(p.avatar)" alt="" referrerpolicy="no-referrer" />
      <span v-else aria-hidden="true">{{ initial(p.name) }}</span>
    </button>
    <span v-if="more > 0" class="face more" aria-hidden="true">+{{ more }}</span>
  </div>
</template>

<style scoped>
.online {
  align-items: center;
  height: 38px;
  padding: 0 8px 0 12px;
}
.face {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  margin-left: -6px;
  overflow: hidden;
  border: 2px solid var(--c, var(--line));
  border-radius: 50%;
  background: #fff;
  font-size: 12px;
  font-weight: 700;
  color: var(--c, var(--muted));
  box-shadow: 0 0 0 2px #fff;
  padding: 0;
}
/* Phones: the faces overlap more, leaving the top row room for the project's name */
@media (max-width: 560px) {
  .online {
    padding: 0 6px 0 16px;
  }
  .face {
    margin-left: -12px;
  }
}
button.face {
  cursor: pointer;
  transition:
    transform 0.15s,
    box-shadow 0.15s;
}
button.face:disabled {
  cursor: default;
}
button.face:hover:not(:disabled) {
  transform: translateY(-1px);
  z-index: 1;
}
/* following them: filled in their colour, the ring thicker inward (nothing reaches past the bar) */
button.face.on {
  border-width: 3px;
  background: var(--c);
  color: #fff;
  z-index: 1;
}
button.face:focus-visible {
  /* over the white ring, so it stays inside the bar too */
  outline: 2px solid var(--ink);
  outline-offset: 0;
}
.face img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.more {
  font-size: 11px;
  color: var(--muted);
}
</style>

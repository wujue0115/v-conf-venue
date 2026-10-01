<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { cleanEmail, isEmail, type AccessEntry } from '@/cloud/access'
import { cloudMessage } from '@/cloud/messages'
import type { Grant } from '@/cloud/projects'
import { t } from '@/i18n'
import { useAccessStore } from '@/stores/access'
import { useAuthStore } from '@/stores/auth'
import { useProjectStore } from '@/stores/project'

/**
 * 分享's people, for the owner: add someone by email as viewer or editor, answer access requests,
 * change or remove members, and see who opened the link signed in. Editable with sharing off
 * too; it takes effect once sharing is back on.
 */

const access = useAccessStore()
const project = useProjectStore()
const auth = useAuthStore()

const email = shallowRef('')
const role = shallowRef<Grant>('editor')
/** The row (or 'add') a change is waiting on */
const busy = shallowRef<string | null>(null)
/** What the last change came to: done, or why it failed */
const message = shallowRef<{ text: string; error: boolean } | null>(null)

const sharing = computed(() => project.meta?.sharing ?? null)
const GRANTS: Grant[] = ['viewer', 'editor']
/** Removing someone doesn't keep them out while the link lets signed-in people in */
const linkLetsIn = computed(
  () => !!sharing.value?.share_enabled && sharing.value.view_access !== 'allowed',
)

async function run(key: string, job: () => Promise<void>, done?: string) {
  if (busy.value) return
  busy.value = key
  message.value = null
  try {
    await job()
    if (done) message.value = { text: done, error: false }
  } catch (e) {
    message.value = { text: cloudMessage(e), error: true }
  } finally {
    busy.value = null
  }
}

/** Load the list afresh (分享 opening) */
function refresh() {
  message.value = null
  return run('load', () => access.load())
}

function add() {
  const e = cleanEmail(email.value)
  if (!isEmail(e)) return (message.value = { text: t().share.people.invalidEmail, error: true })
  if (e === cleanEmail(auth.email))
    return (message.value = { text: t().share.people.self, error: true })
  run(
    'add',
    async () => {
      await access.add(e, role.value)
      email.value = ''
    },
    t().share.people.added(e),
  )
}

const approve = (a: AccessEntry) =>
  run(a.id, () => access.approve(a), t().share.people.approved(a.email))
const deny = (a: AccessEntry) => run(a.id, () => access.deny(a))
const setRole = (a: AccessEntry, r: Grant) => run(a.id, () => access.setRole(a, r))
const remove = (a: AccessEntry) =>
  run(a.id, () => access.remove(a), t().share.people.removed(a.email))
const makeMember = (a: AccessEntry) =>
  run(a.id, () => access.add(a.email, 'viewer'), t().share.people.added(a.email))

defineExpose({ refresh })
</script>

<template>
  <section class="people" :aria-busy="!!busy">
    <h4>{{ t().share.people.title }}</h4>
    <p v-if="sharing && !sharing.share_enabled" class="hint">{{ t().share.people.offHint }}</p>

    <form class="add" @submit.prevent="add">
      <input
        v-model="email"
        type="email"
        autocomplete="off"
        :aria-label="t().share.people.email"
        :placeholder="t().share.people.emailPlaceholder"
        :disabled="busy === 'add'"
      />
      <select v-model="role" :aria-label="t().share.people.roleOf(email || '…')">
        <option v-for="g in GRANTS" :key="g" :value="g">{{ t().share.people.roles[g] }}</option>
      </select>
      <button class="ok" type="submit" :disabled="!email.trim() || busy === 'add'">
        {{ t().share.people.add }}
      </button>
    </form>
    <p v-if="message" class="msg" :class="{ error: message.error }" role="status">
      {{ message.text }}
    </p>

    <p v-if="!access.entries" class="hint">{{ t().share.people.loading }}</p>
    <template v-else>
      <template v-if="access.requests.length">
        <h5>{{ t().share.people.requests }}</h5>
        <ul>
          <li v-for="a in access.requests" :key="a.id" class="row ask">
            <span class="who">
              <b>{{ a.email }}</b>
              <i>{{ t().share.people.asks[a.requested_role!] }}</i>
            </span>
            <button class="txt-btn" type="button" :disabled="!!busy" @click="deny(a)">
              {{ t().share.people.deny }}
            </button>
            <button class="txt-btn ok" type="button" :disabled="!!busy" @click="approve(a)">
              {{ t().share.people.approve }}
            </button>
          </li>
        </ul>
      </template>

      <ul v-if="access.members.length">
        <li v-for="a in access.members" :key="a.id" class="row">
          <span class="who"
            ><b>{{ a.email }}</b></span
          >
          <select
            :value="a.role"
            :aria-label="t().share.people.roleOf(a.email)"
            :disabled="!!busy"
            @change="setRole(a, ($event.target as HTMLSelectElement).value as Grant)"
          >
            <option v-for="g in GRANTS" :key="g" :value="g">
              {{ t().share.people.roles[g] }}
            </option>
          </select>
          <button
            class="x"
            type="button"
            :title="t().share.people.removeTitle(a.email)"
            :aria-label="t().share.people.removeTitle(a.email)"
            :disabled="!!busy"
            @click="remove(a)"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </li>
      </ul>
      <p v-else class="hint">{{ t().share.people.none }}</p>
      <p v-if="linkLetsIn && (access.members.length || access.linkVisitors.length)" class="hint">
        {{ t().share.people.removeHint }}
      </p>

      <details v-if="access.linkVisitors.length" class="visitors">
        <summary>{{ t().share.people.visitors(access.linkVisitors.length) }}</summary>
        <p class="hint">{{ t().share.people.visitorsHint }}</p>
        <ul>
          <li v-for="a in access.linkVisitors" :key="a.id" class="row">
            <span class="who"
              ><b>{{ a.email }}</b></span
            >
            <button class="txt-btn" type="button" :disabled="!!busy" @click="makeMember(a)">
              {{ t().share.people.makeMember }}
            </button>
            <button
              class="x"
              type="button"
              :title="t().share.people.removeTitle(a.email)"
              :aria-label="t().share.people.removeTitle(a.email)"
              :disabled="!!busy"
              @click="remove(a)"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </li>
        </ul>
      </details>
    </template>
  </section>
</template>

<style scoped>
.people {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}
h4,
h5 {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: var(--faint);
}
h5 {
  margin-top: 12px;
}
.hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--faint);
}
.msg {
  margin: 6px 0 0;
  font-size: 12px;
  color: #2f7d4f;
}
.msg.error {
  color: #b3261e;
}
.add {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}
.add input {
  flex: 1;
  min-width: 0;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #fff;
  font-size: 13px;
  color: var(--ink);
}
select {
  height: 34px;
  padding: 0 6px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #fff;
  font-size: 13px;
  color: var(--ink);
}
.row select {
  height: 28px;
  font-size: 12px;
}
ul {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}
.row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 0;
}
.row + .row {
  border-top: 1px solid #f1eee6;
}
.who {
  flex: 1;
  min-width: 0;
}
.who b,
.who i {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.who b {
  font-size: 13px;
  font-weight: 500;
}
.who i {
  font-style: normal;
  font-size: 12px;
  color: #a06a00;
}
.txt-btn,
.ok {
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #fff;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
}
.add .ok {
  height: 34px;
  padding: 0 12px;
  font-size: 13px;
}
.ok {
  border-color: transparent;
  background: var(--yel);
  font-weight: 600;
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
.x {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.x:hover:not(:disabled) {
  background: #fbe9e7;
  color: #b3261e;
}
.x svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}
.visitors {
  margin-top: 12px;
}
.visitors summary {
  font-size: 12px;
  color: var(--muted);
  cursor: pointer;
}
.add input:focus-visible,
select:focus-visible,
button:focus-visible,
summary:focus-visible {
  outline: 2px solid var(--yel);
  outline-offset: 1px;
}
</style>

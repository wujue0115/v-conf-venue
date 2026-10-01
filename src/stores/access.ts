import { computed, shallowRef, watch } from 'vue'
import { acceptHMRUpdate, defineStore } from 'pinia'
import {
  addPerson,
  approve,
  cleanEmail,
  countRequests,
  deny,
  listAccess,
  removeAccess,
  setRole,
  type AccessEntry,
} from '@/cloud/access'
import { CloudError, type Grant } from '@/cloud/projects'
import { useProjectStore } from '@/stores/project'

/**
 * The open project's people, for its owner: those added by email, those asking for access, and
 * those who opened the share link signed in. The list loads when 分享 opens; how many are asking
 * is looked up as soon as the owner opens the project, for the dot on 分享.
 */
export const useAccessStore = defineStore('access', () => {
  const project = useProjectStore()

  /** null until loaded */
  const entries = shallowRef<AccessEntry[] | null>(null)
  const loading = shallowRef(false)
  /** How many are waiting, before the list itself is loaded */
  const requestCount = shallowRef(0)

  const projectId = computed(() => (project.meta?.role === 'owner' ? project.meta.id : null))

  /** Added by name, the earliest first */
  const members = computed(() => (entries.value ?? []).filter((e) => e.role))
  /** Waiting on the owner, the earliest ask first; an added viewer asking to edit is here too */
  const requests = computed(() =>
    (entries.value ?? [])
      .filter((e) => e.requested_role)
      .sort((a, b) => (a.requested_at ?? '').localeCompare(b.requested_at ?? '')),
  )
  /** Opened the link signed in, nothing granted by name and nothing asked */
  const linkVisitors = computed(() =>
    (entries.value ?? []).filter((e) => !e.role && !e.requested_role && e.via_link),
  )

  watch(
    projectId,
    async (id) => {
      entries.value = null
      requestCount.value = 0
      if (!id) return
      try {
        const n = await countRequests(id)
        if (projectId.value === id) requestCount.value = n
      } catch (e) {
        // just the dot: the list says it again when 分享 opens
        console.error(
          '[cloud] counting access requests failed',
          e instanceof CloudError ? e.detail : e,
        )
      }
    },
    { immediate: true },
  )

  async function load() {
    const id = projectId.value
    if (!id) return
    loading.value = true
    try {
      const list = await listAccess(id)
      if (projectId.value !== id) return
      entries.value = list
      requestCount.value = list.filter((e) => e.requested_role).length
    } finally {
      loading.value = false
    }
  }

  /** Make a change, then read the list back as the database has it */
  async function change(job: (projectId: string) => Promise<unknown>) {
    const id = projectId.value
    if (!id) return
    await job(id)
    await load()
  }

  const find = (email: string) => entries.value?.find((e) => e.email === cleanEmail(email))

  return {
    entries,
    loading,
    requestCount,
    members,
    requests,
    linkVisitors,
    find,
    load,
    add: (email: string, role: Grant) => change((id) => addPerson(id, email, role, find(email))),
    setRole: (e: AccessEntry, role: Grant) => change(() => setRole(e, role)),
    approve: (e: AccessEntry) => change(() => approve(e)),
    deny: (e: AccessEntry) => change(() => deny(e)),
    remove: (e: AccessEntry) => change(() => removeAccess(e)),
  }
})

if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useAccessStore, import.meta.hot))

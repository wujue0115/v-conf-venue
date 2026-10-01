import type { ProjectSettings } from './projects'
import { parseLayout, type LayoutItem } from '@/venue/layout'
import { readJSON, removeKey, writeJSON } from '@/venue/storage'

/*
 * A cloud project's changes that couldn't be saved, kept in this browser so closing the tab
 * doesn't lose them. One per project, under its own key: never the browser's own layout, and
 * never written to the cloud unless the person chooses to restore it.
 */

export interface Draft {
  /** The project's updated_at when the changes started: the cloud version they were made on */
  base: string
  /** When the draft was last written */
  at: string
  items: LayoutItem[]
  settings: ProjectSettings
}

const key = (projectId: string) => `v-conf-venue:unsaved:${projectId}`

export function loadDraft(projectId: string): Draft | null {
  const d = readJSON(key(projectId)) as Partial<Draft> | null
  if (!d || typeof d.base !== 'string' || typeof d.at !== 'string') return null
  try {
    return { base: d.base, at: d.at, items: parseLayout(d.items), settings: d.settings ?? {} }
  } catch {
    return null
  }
}

/** Returns false when the browser refused it (poster images past the storage quota) */
export const saveDraft = (projectId: string, draft: Draft) => writeJSON(key(projectId), draft)

export const clearDraft = (projectId: string) => removeKey(key(projectId))

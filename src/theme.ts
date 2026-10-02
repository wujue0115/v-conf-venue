import { computed, shallowRef, watch } from 'vue'
import { readJSON, removeKey, writeJSON } from '@/venue/storage'

/*
 * Light or dark, or the system's (the default). The resolved one is <html data-theme>, which
 * main.css's colours follow; index.html sets it before the first paint from the same saved
 * choice, so a dark page never flashes light.
 */

export type Theme = 'system' | 'light' | 'dark'
export const THEMES: readonly Theme[] = ['system', 'light', 'dark']

/** Read by index.html's inline script too: keep the two in step */
const KEY = 'vueconf26-theme'

function initial(): Theme {
  const saved = readJSON(KEY)
  return saved === 'light' || saved === 'dark' ? saved : 'system'
}

export const theme = shallowRef<Theme>(initial())

const media = globalThis.matchMedia?.('(prefers-color-scheme: dark)')
const systemDark = shallowRef(!!media?.matches)
media?.addEventListener('change', (e) => (systemDark.value = e.matches))

/** Whether the page is dark now */
export const dark = computed(
  () => theme.value === 'dark' || (theme.value === 'system' && systemDark.value),
)

watch(theme, (t) => (t === 'system' ? removeKey(KEY) : writeJSON(KEY, t)))

watch(
  dark,
  (d) => {
    if (typeof document === 'undefined') return
    document.documentElement.dataset.theme = d ? 'dark' : 'light'
    // the browser's own bars, on phones
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', d ? '#16171a' : '#f3f0e8')
  },
  { immediate: true },
)

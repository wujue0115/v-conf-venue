import { shallowRef, watch } from 'vue'
import en from './en'
import zh, { type Messages } from './zh'
import { FURNITURE, type FurnitureType, type VariantLabel } from '@/venue/furniture'
import { readJSON, writeJSON } from '@/venue/storage'

/*
 * 中文 / English. `t()` returns the current language's messages; reading it inside a template
 * or computed ties that to `locale`, so switching language re-renders. Code outside Vue (the
 * editor's toasts) just calls it when it needs a string.
 */

export type Locale = 'zh' | 'en'
export const LOCALES: readonly Locale[] = ['zh', 'en']
/** Each language's name, written in itself */
export const LOCALE_NAMES: Record<Locale, string> = { zh: '中文', en: 'English' }

const KEY = 'vueconf26-locale'
const MESSAGES: Record<Locale, Messages> = { zh, en }

/** A saved choice, else the browser's language (Chinese → 中文, anything else → English) */
function initial(): Locale {
  const saved = readJSON(KEY)
  if (saved === 'zh' || saved === 'en') return saved
  return globalThis.navigator?.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

export const locale = shallowRef<Locale>(initial())
export const t = () => MESSAGES[locale.value]

watch(
  locale,
  (l) => {
    writeJSON(KEY, l)
    if (typeof document === 'undefined') return
    document.documentElement.lang = MESSAGES[l].lang
    document.title = MESSAGES[l].docTitle
  },
  { immediate: true },
)

/** An item kind's name */
export const nameOf = (type: FurnitureType) => t().furniture[type]
/** An item kind's size: its dimensions, or words where it has none */
export const sizeOf = (type: FurnitureType) => t().sizes[type] ?? FURNITURE[type].size
/** A variant option's name (a colour, flavour or size) */
export const variantName = (type: FurnitureType, id: string) => t().variants[type]?.[id] ?? id
/** What a row of variant options is called */
export const variantLabel = (label: VariantLabel) => t().variantLabels[label]

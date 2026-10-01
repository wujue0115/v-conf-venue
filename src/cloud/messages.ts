import { CloudError } from './projects'
import { t } from '@/i18n'

/** What to tell the person when a cloud call failed (Supabase's own error goes to the console) */
export function cloudMessage(e: unknown) {
  console.error('[cloud]', e instanceof CloudError ? (e.detail ?? e) : e)
  return t().cloud.errors[e instanceof CloudError ? e.code : 'failed']
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

/** "3 minutes ago" / "3 分鐘前", in the current language */
export function timeAgo(iso: string, now = Date.now()) {
  const fmt = new Intl.RelativeTimeFormat(t().lang, { numeric: 'auto' })
  const s = Math.round((new Date(iso).getTime() - now) / 1000)
  for (const [unit, size] of UNITS)
    if (Math.abs(s) >= size) return fmt.format(Math.round(s / size), unit)
  return t().cloud.justNow
}

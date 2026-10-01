import { readonly, shallowRef } from 'vue'

/** The width up to which the planner lays out for phones: one row on top, the tools at the bottom */
export const PHONE_MAX = 560

const query =
  typeof window !== 'undefined' ? window.matchMedia(`(max-width: ${PHONE_MAX}px)`) : null
const phone = shallowRef(!!query?.matches)
query?.addEventListener('change', (e) => (phone.value = e.matches))

/** Whether the screen is phone-sized (follows the window as it's resized or turned) */
export const usePhone = () => readonly(phone)

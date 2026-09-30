import { createClient } from '@supabase/supabase-js'

/*
 * The one Supabase client. Null when the build has no project configured (VITE_SUPABASE_URL /
 * VITE_SUPABASE_PUBLISHABLE_KEY), so the planner still runs locally without any cloud features.
 */

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabase =
  url && key
    ? createClient(url, key, {
        // PKCE: Google sends back a `?code=`, which the client swaps for a session on load and
        // then removes from the address bar
        auth: { flowType: 'pkce' },
      })
    : null

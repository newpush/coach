import { defineStore } from 'pinia'

const ACT_AS_COOKIE_NAME = 'coach_wattz_act_as_user'
const ACT_AS_DASHBOARD_PATH = '/dashboard'

function persistActAsCookie(userId: string | null) {
  if (!import.meta.client) return

  if (!userId) {
    document.cookie = `${ACT_AS_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`
    return
  }

  document.cookie = `${ACT_AS_COOKIE_NAME}=${encodeURIComponent(userId)}; path=/; SameSite=Lax`
}

/**
 * Hard-navigate so identity-scoped Pinia caches (user, profile, entitlements)
 * are wiped and re-fetched under the new act-as (or restored coach) identity.
 */
function hardResetForIdentityChange(path?: string) {
  if (!import.meta.client) return

  if (path) {
    window.location.assign(path)
    return
  }

  window.location.reload()
}

export interface PendingActAsRequest {
  userId: string
  userName: string
}

export const useCoachingStore = defineStore('coaching', () => {
  const actingAsUserId = ref<string | null>(null)
  const actingAsUserName = ref<string | null>(null)

  /**
   * Act-as switches identity for the whole app and survives reloads, so it is
   * never entered on a single click. Every trigger stages the request here and
   * `CoachingBanner` renders the confirmation that commits it (CW-541).
   */
  const pendingActAs = ref<PendingActAsRequest | null>(null)

  // Load from localStorage on init
  if (import.meta.client) {
    const savedId = localStorage.getItem('coaching_act_as_id')
    const savedName = localStorage.getItem('coaching_act_as_name')
    if (savedId) {
      actingAsUserId.value = savedId
      actingAsUserName.value = savedName
      persistActAsCookie(savedId)
    }
  }

  const isCoachingMode = computed(() => !!actingAsUserId.value)
  const hasPendingActAsRequest = computed(() => !!pendingActAs.value)

  function commitActingAs(userId: string, userName: string) {
    actingAsUserId.value = userId
    actingAsUserName.value = userName
    if (import.meta.client) {
      localStorage.setItem('coaching_act_as_id', userId)
      localStorage.setItem('coaching_act_as_name', userName)
      persistActAsCookie(userId)
      // Mirror stopActingAs: full navigation clears stale coach identity UI
      hardResetForIdentityChange(ACT_AS_DASHBOARD_PATH)
    }
  }

  /**
   * Stage an act-as request. Does NOT change identity — it opens the global
   * confirmation. Every "act as athlete" trigger in the app calls this.
   */
  function startActingAs(userId: string, userName: string) {
    pendingActAs.value = { userId, userName }
  }

  /** Commit the staged request. No-op when nothing is pending. */
  function confirmActingAs() {
    const pending = pendingActAs.value
    if (!pending) return
    pendingActAs.value = null
    commitActingAs(pending.userId, pending.userName)
  }

  /** Dismiss the staged request without changing identity. */
  function cancelActingAs() {
    pendingActAs.value = null
  }

  /** Drop every trace of act-as: in-memory state, both localStorage keys, the cookie. */
  function clearActingAs() {
    actingAsUserId.value = null
    actingAsUserName.value = null
    pendingActAs.value = null
    if (import.meta.client) {
      localStorage.removeItem('coaching_act_as_id')
      localStorage.removeItem('coaching_act_as_name')
      persistActAsCookie(null)
    }
  }

  function stopActingAs() {
    clearActingAs()
    // Force reload to clear all states and re-fetch session
    hardResetForIdentityChange()
  }

  return {
    actingAsUserId,
    actingAsUserName,
    pendingActAs,
    isCoachingMode,
    hasPendingActAsRequest,
    startActingAs,
    confirmActingAs,
    cancelActingAs,
    clearActingAs,
    stopActingAs
  }
})

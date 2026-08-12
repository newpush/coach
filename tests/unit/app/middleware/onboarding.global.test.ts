// @vitest-environment nuxt

import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RouteLocationNormalizedGeneric } from 'vue-router'
import onboardingMiddleware from '~/middleware/onboarding.global'

type MockUser = {
  termsAcceptedAt?: string | null
  deactivatedAt?: string | Date | null
}

type AuthMockState = {
  status: { value: 'authenticated' | 'unauthenticated' | 'loading' }
  data: { value: { user: MockUser } | null }
  getSession: ReturnType<typeof vi.fn>
  signOut: ReturnType<typeof vi.fn>
}

const { navigateToMock, authMockRef } = vi.hoisted(() => ({
  navigateToMock: vi.fn(),
  // Mutable ref so each test can swap in its own auth state before invoking the
  // middleware, while the mock factory itself stays static (required by the
  // mockNuxtImport macro, which is transpiled at module scope).
  authMockRef: { current: null as AuthMockState | null }
}))

mockNuxtImport('navigateTo', () => navigateToMock)
mockNuxtImport('useAuth', () => () => authMockRef.current)

function makeRoute(path: string): RouteLocationNormalizedGeneric {
  return {
    path,
    fullPath: path,
    query: {},
    params: {},
    hash: '',
    matched: [],
    meta: {},
    name: undefined,
    redirectedFrom: undefined
  } as unknown as RouteLocationNormalizedGeneric
}

function buildAuthMock(options: {
  status?: 'authenticated' | 'unauthenticated' | 'loading'
  user?: MockUser
  getSession?: ReturnType<typeof vi.fn>
  signOut?: ReturnType<typeof vi.fn>
}): AuthMockState {
  return {
    status: { value: options.status ?? 'authenticated' },
    data: { value: options.user ? { user: options.user } : null },
    getSession: options.getSession ?? vi.fn().mockResolvedValue(null),
    signOut: options.signOut ?? vi.fn().mockResolvedValue(undefined)
  }
}

describe('onboarding.global middleware', () => {
  beforeEach(() => {
    navigateToMock.mockReset()
    authMockRef.current = null
  })

  afterEach(() => {
    authMockRef.current = null
  })

  it('refreshes the session unconditionally -- not only when status is "loading" -- before making any onboarding decision', async () => {
    const auth = buildAuthMock({
      status: 'authenticated',
      user: { termsAcceptedAt: '2024-01-01T00:00:00.000Z', deactivatedAt: null }
    })
    authMockRef.current = auth

    const to = makeRoute('/dashboard')
    await onboardingMiddleware(to, to)

    // The fix under test: getSession must run even though status was never 'loading'.
    expect(auth.getSession).toHaveBeenCalledTimes(1)
    expect(auth.signOut).not.toHaveBeenCalled()
    expect(navigateToMock).not.toHaveBeenCalled()
  })

  it('kicks out a user deactivated mid-session on a client-side nav to a route with no other auth middleware, instead of trusting the stale cached session', async () => {
    const auth = buildAuthMock({
      // Stale cached session: authenticated, not yet flagged deactivated.
      status: 'authenticated',
      user: { termsAcceptedAt: '2024-01-01T00:00:00.000Z', deactivatedAt: null }
    })
    auth.getSession.mockImplementation(async () => {
      // Simulate the DB-backed refresh discovering the deactivation and updating
      // the shared auth state, exactly like the real getSession() would.
      auth.data.value = {
        user: {
          termsAcceptedAt: '2024-01-01T00:00:00.000Z',
          deactivatedAt: '2024-06-01T00:00:00.000Z'
        }
      }
      return null
    })
    authMockRef.current = auth

    // A route with no 'auth' / 'oauth-auth' middleware of its own -- onboarding.global.ts
    // (global) is the only middleware guaranteed to run on this navigation.
    const to = makeRoute('/some-public-app-route')
    await onboardingMiddleware(to, to)

    expect(auth.getSession).toHaveBeenCalledTimes(1)
    expect(auth.signOut).toHaveBeenCalledTimes(1)
    expect(auth.signOut).toHaveBeenCalledWith({ callbackUrl: '/login?error=deactivated' })
    expect(navigateToMock).not.toHaveBeenCalled()
  })

  it('leaves existing onboarding-redirect behavior unchanged: redirects an active user who has not accepted terms to /onboarding', async () => {
    const auth = buildAuthMock({
      status: 'authenticated',
      user: { termsAcceptedAt: null, deactivatedAt: null }
    })
    authMockRef.current = auth

    const to = makeRoute('/dashboard')
    await onboardingMiddleware(to, to)

    expect(auth.getSession).toHaveBeenCalledTimes(1)
    expect(auth.signOut).not.toHaveBeenCalled()
    expect(navigateToMock).toHaveBeenCalledTimes(1)
    expect(navigateToMock).toHaveBeenCalledWith({
      path: '/onboarding',
      query: { redirect: '/dashboard' }
    })
  })

  it('leaves existing onboarding-redirect behavior unchanged: lets an active user who has accepted terms through without redirect', async () => {
    const auth = buildAuthMock({
      status: 'authenticated',
      user: { termsAcceptedAt: '2024-01-01T00:00:00.000Z', deactivatedAt: null }
    })
    authMockRef.current = auth

    const to = makeRoute('/dashboard')
    const result = await onboardingMiddleware(to, to)

    expect(auth.getSession).toHaveBeenCalledTimes(1)
    expect(auth.signOut).not.toHaveBeenCalled()
    expect(navigateToMock).not.toHaveBeenCalled()
    expect(result).toBeUndefined()
  })

  // CW-538: the ONLY thing keeping an authenticated-but-unconsented invitee off the
  // consent gate is the `/join` allowlist in this middleware. The route-resolution
  // test in tests/unit/app/pages/join-route.test.ts cannot see it — `route.meta.middleware`
  // excludes global middleware — so without these two cases, deleting that allowlist
  // line would break every invite link for signed-in users with the whole suite green.
  it.each(['/join/ABC123', '/join'])(
    'lets an unconsented user reach %s, so invite links work before the consent gate',
    async (path) => {
      const auth = buildAuthMock({
        status: 'authenticated',
        user: { termsAcceptedAt: null, deactivatedAt: null }
      })
      authMockRef.current = auth

      const to = makeRoute(path)
      const result = await onboardingMiddleware(to, to)

      expect(navigateToMock).not.toHaveBeenCalled()
      expect(result).toBeUndefined()
    }
  )

  it('does not treat an unauthenticated visitor as deactivated after the forced refresh', async () => {
    const auth = buildAuthMock({ status: 'unauthenticated' })
    authMockRef.current = auth

    const to = makeRoute('/login')
    await onboardingMiddleware(to, to)

    expect(auth.getSession).toHaveBeenCalledTimes(1)
    expect(auth.signOut).not.toHaveBeenCalled()
    expect(navigateToMock).not.toHaveBeenCalled()
  })
})

// @vitest-environment nuxt

import { describe, expect, it } from 'vitest'
import { useRouter } from '#imports'

// CW-538: `app/pages/join.vue` + `app/pages/join/[code].vue` used to form a
// parent/child pair. The parent rendered no <NuxtPage /> outlet, so the invite
// page never mounted, and the parent's `guest` middleware bounced authenticated
// invitees to /dashboard. Renaming the parent to `app/pages/join/index.vue`
// makes the two routes siblings: no outlet needed, no inherited middleware.
//
// These assertions are auth-state independent on purpose — that *is* the fix.
// `/join/:code()` carries no auth-dependent middleware, so it resolves to the
// invite component identically for signed-out and signed-in visitors.
async function resolveComponentFile(record: unknown) {
  const component = (record as { components?: { default?: unknown } }).components?.default
  const mod =
    typeof component === 'function' ? await (component as () => Promise<unknown>)() : component
  const definition = (mod as { default?: { __file?: string } })?.default ?? mod
  return (definition as { __file?: string })?.__file
}

describe('join route resolution (CW-538)', () => {
  it('resolves /join/{code} to the invite page, not nested under the sign-up page', async () => {
    const route = useRouter().resolve('/join/ABC123')

    expect(route.name).toBe('join-code')
    // Exactly one matched record: if `app/pages/join.vue` ever comes back this
    // becomes ['/join', '/join/:code()'] and the invite page stops rendering.
    expect(route.matched.map((record) => record.path)).toEqual(['/join/:code()'])
    expect(route.params).toMatchObject({ code: 'ABC123' })
    await expect(resolveComponentFile(route.matched[0])).resolves.toMatch(
      /app\/pages\/join\/\[code\]\.vue$/
    )
  })

  it('applies no auth-dependent middleware to /join/{code}, so both auth states see the invite', () => {
    const route = useRouter().resolve('/join/ABC123')
    const middleware = ([] as unknown[]).concat(
      (route.meta as { middleware?: unknown }).middleware ?? []
    )

    expect(middleware).not.toContain('guest')
    expect(middleware).not.toContain('auth')
  })

  it('keeps /join on the public sign-up page with its guest redirect intact', async () => {
    const route = useRouter().resolve('/join')

    expect(route.name).toBe('join')
    expect(route.matched.map((record) => record.path)).toEqual(['/join'])
    expect((route.meta as { middleware?: string[] }).middleware).toContain('guest')
    await expect(resolveComponentFile(route.matched[0])).resolves.toMatch(
      /app\/pages\/join\/index\.vue$/
    )
  })
})

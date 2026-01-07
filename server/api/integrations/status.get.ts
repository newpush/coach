import { getServerSession } from '../../utils/session'

defineRouteMeta({
  openAPI: {
    tags: ['Integrations'],
    summary: 'Get integration status',
    description: 'Returns the status of all connected integrations for the user.',
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                integrations: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      provider: { type: 'string' },
                      lastSyncAt: { type: 'string', format: 'date-time', nullable: true },
                      syncStatus: { type: 'string', nullable: true },
                      externalUserId: { type: 'string', nullable: true },
                      ingestWorkouts: { type: 'boolean' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      401: { description: 'Unauthorized' }
    }
  }
})

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!session?.user?.email) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: {
      integrations: {
        select: {
          id: true,
          provider: true,
          lastSyncAt: true,
          syncStatus: true,
          externalUserId: true,
          ingestWorkouts: true
        }
      },
      accounts: {
        where: { provider: 'intervals' },
        select: {
          provider: true,
          access_token: true,
          providerAccountId: true,
          scope: true
        }
      }
    }
  })

  if (!user) {
    throw createError({
      statusCode: 404,
      message: 'User not found'
    })
  }

  // Self-healing: If user has an intervals account but no intervals integration, create it
  const hasIntervalsAccount = user.accounts.some((a) => a.provider === 'intervals')
  const hasIntervalsIntegration = user.integrations.some((i) => i.provider === 'intervals')

  if (hasIntervalsAccount && !hasIntervalsIntegration) {
    const account = user.accounts.find((a) => a.provider === 'intervals')
    if (account?.access_token) {
      try {
        const newIntegration = await prisma.integration.create({
          data: {
            userId: user.id,
            provider: 'intervals',
            accessToken: account.access_token,
            externalUserId: account.providerAccountId,
            scope: account.scope,
            syncStatus: 'SUCCESS',
            lastSyncAt: new Date(),
            ingestWorkouts: true
          }
        })
        // Add the new integration to the list we return
        user.integrations.push({
          id: newIntegration.id,
          provider: newIntegration.provider,
          lastSyncAt: newIntegration.lastSyncAt,
          syncStatus: newIntegration.syncStatus,
          externalUserId: newIntegration.externalUserId,
          ingestWorkouts: newIntegration.ingestWorkouts
        })
        console.log(`Self-healed missing Intervals.icu integration for user ${user.id}`)
      } catch (error) {
        console.error('Failed to self-heal Intervals.icu integration:', error)
      }
    }
  }

  return {
    integrations: user.integrations
  }
})

import { getServerSession } from '#auth'
import { prisma } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const body = await readBody(event)
  const { termsVersion, privacyPolicyVersion } = body

  if (!termsVersion || !privacyPolicyVersion) {
    throw createError({ statusCode: 400, message: 'Missing version information' })
  }

  const user = await prisma.user.update({
    where: { id: (session.user as any).id },
    data: {
      termsAcceptedAt: new Date(),
      healthConsentAcceptedAt: new Date(),
      termsVersion,
      privacyPolicyVersion
    }
  })

  return { success: true, termsAcceptedAt: user.termsAcceptedAt }
})

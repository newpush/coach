import { getServerSession } from '../../utils/session'
import { z } from 'zod'
import { sportSettingsRepository } from '../../utils/repositories/sportSettingsRepository'
import { profileUpdateSchema } from '../../utils/schemas/profile'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)

  if (!session?.user?.email) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    })
  }

  const body = await readBody(event)
  const result = profileUpdateSchema.safeParse(body)

  if (!result.success) {
    console.warn('[PATCH /api/profile] Validation failed:', {
      user: session.user.email,
      errors: result.error.issues,
      body: body
    })
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid input',
      data: result.error.issues
    })
  }

  const data = result.data
  const userEmail = session.user.email

  try {
    // 1. Update User (Basic Settings)
    // Exclude sportSettings from user update
    const { sportSettings, hrZones, powerZones, ...userUpdateData } = data

    // Normalize sex
    if (userUpdateData.sex === 'M') userUpdateData.sex = 'Male'
    if (userUpdateData.sex === 'F') userUpdateData.sex = 'Female'

    // Handle date conversion for DOB
    const updatePayload: any = { ...userUpdateData }
    if (updatePayload.dob) {
      updatePayload.dob = new Date(updatePayload.dob)
    }

    const updatedUser = await prisma.user.update({
      where: { email: userEmail },
      data: updatePayload
    })

    // 2. Update Sport Settings via Repository
    let updatedSettings = []
    if (sportSettings) {
      updatedSettings = await sportSettingsRepository.upsertSettings(updatedUser.id, sportSettings)
    } else {
      // If not updating settings, fetch existing to return consistent response
      updatedSettings = await sportSettingsRepository.getByUserId(updatedUser.id)
    }

    // Helper to format date as YYYY-MM-DD
    const formatDate = (date: Date | null) => {
      if (!date) return null
      return date.toISOString().split('T')[0]
    }

    return {
      success: true,
      profile: {
        ...updatedUser,
        dob: formatDate(updatedUser.dob),
        // Return updated sport settings
        sportSettings: updatedSettings
      }
    }
  } catch (error) {
    console.error('[PATCH /api/profile] Update failed:', {
      user: userEmail,
      error: error,
      payload: data
    })
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update profile'
    })
  }
})

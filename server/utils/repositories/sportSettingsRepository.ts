import { prisma } from '../db'
import { getUserLocalDate } from '../date'

export const sportSettingsRepository = {
  /**
   * Get all sport settings for a user, ensuring a Default profile exists.
   */
  async getByUserId(userId: string) {
    const settings = await prisma.sportSettings.findMany({
      where: { userId },
      orderBy: { isDefault: 'desc' } // Default first
    })

    // Lazy create Default if missing
    if (!settings.some((s: any) => s.isDefault)) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          ftp: true,
          lthr: true,
          maxHr: true,
          restingHr: true
        }
      })

      if (user) {
        const defaultProfile = await this.createDefault(userId, user)
        settings.unshift(defaultProfile)
      }
    }

    return settings
  },

  /**
   * Get the default sport settings for a user.
   */
  async getDefault(userId: string) {
    const settings = await this.getByUserId(userId)
    return settings.find((s: any) => s.isDefault) || null
  },

  /**
   * Create the default profile using user's basic settings.
   */
  async createDefault(userId: string, legacyProfile: any) {
    return await prisma.sportSettings.create({
      data: {
        userId,
        name: 'Default',
        isDefault: true,
        types: [],
        source: 'system',
        externalId: `default_${userId}`,
        ftp: legacyProfile.ftp,
        lthr: legacyProfile.lthr,
        maxHr: legacyProfile.maxHr,
        restingHr: legacyProfile.restingHr,
        hrZones: [], // Clean slate
        powerZones: [], // Clean slate
        warmupTime: 10,
        cooldownTime: 10,
        loadPreference: 'POWER_HR_PACE'
      }
    })
  },

  /**
   * Get the applicable sport settings for a specific activity type.
   * Falls back to Default if no specific match found.
   */
  async getForActivityType(userId: string, activityType: string) {
    const allSettings = await this.getByUserId(userId)

    // 1. Exact match in types array
    const specific = allSettings.find(
      (s: any) => !s.isDefault && s.types && s.types.includes(activityType)
    )
    if (specific) return specific

    // 2. Partial match (e.g. "Ride" matches "VirtualRide")?
    // For now, strict match or fallback.
    // Ideally we might want logic like: if type contains "Ride", look for profile with "Ride".
    const partial = allSettings.find(
      (s: any) => !s.isDefault && s.types && s.types.some((t: string) => activityType.includes(t))
    )
    if (partial) return partial

    // 3. Fallback to Default
    return allSettings.find((s: any) => s.isDefault)
  },

  /**
   * Upsert a list of settings (used by sync or manual update).
   * Ensures Default profile is preserved/updated correctly.
   */
  async upsertSettings(userId: string, settingsPayload: any[]) {
    // We handle updates by iterating.
    // Identify by ID if present, or externalId+source.

    const results = []

    for (const setting of settingsPayload) {
      // Prevent unsetting isDefault on the default profile if payload tries to
      if (setting.isDefault === false && setting.externalId?.startsWith('default_')) {
        setting.isDefault = true
      }

      // Logic to find existing record
      if (setting.id) {
        const existing = await prisma.sportSettings.findUnique({ where: { id: setting.id } })
        if (existing) {
          const updated = await prisma.sportSettings.update({
            where: { id: existing.id },
            data: {
              name: setting.name,
              types: setting.types,
              ftp: setting.ftp,
              indoorFtp: setting.indoorFtp,
              wPrime: setting.wPrime,
              powerZones: setting.powerZones || undefined,
              eFtp: setting.eFtp,
              pMax: setting.pMax,
              powerSpikeThreshold: setting.powerSpikeThreshold,
              lthr: setting.lthr,
              maxHr: setting.maxHr,
              hrZones: setting.hrZones || undefined,
              restingHr: setting.restingHr,
              hrLoadType: setting.hrLoadType,
              thresholdPace: setting.thresholdPace,
              warmupTime: setting.warmupTime,
              cooldownTime: setting.cooldownTime,
              loadPreference: setting.loadPreference
            }
          })

          // Sync back to User model if this is the Default profile
          if (updated.isDefault) {
            await prisma.user.update({
              where: { id: userId },
              data: {
                ftp: updated.ftp,
                lthr: updated.lthr,
                maxHr: updated.maxHr,
                restingHr: updated.restingHr
              }
            })
          }

          results.push(updated)
          continue
        }
      }

      if (setting.externalId && setting.source) {
        // Use upsert to handle race conditions
        const upserted = await prisma.sportSettings.upsert({
          where: {
            userId_source_externalId: {
              userId,
              source: setting.source,
              externalId: setting.externalId
            }
          },
          update: {
            name: setting.name,
            types: setting.types,
            ftp: setting.ftp,
            indoorFtp: setting.indoorFtp,
            wPrime: setting.wPrime,
            powerZones: setting.powerZones || undefined,
            eFtp: setting.eFtp,
            pMax: setting.pMax,
            powerSpikeThreshold: setting.powerSpikeThreshold,
            lthr: setting.lthr,
            maxHr: setting.maxHr,
            hrZones: setting.hrZones || undefined,
            restingHr: setting.restingHr,
            hrLoadType: setting.hrLoadType,
            thresholdPace: setting.thresholdPace,
            warmupTime: setting.warmupTime,
            cooldownTime: setting.cooldownTime,
            loadPreference: setting.loadPreference
          },
          create: {
            userId,
            ...setting,
            source: setting.source,
            externalId: setting.externalId
          }
        })

        // Sync back to User model if this is the Default profile
        if (upserted.isDefault) {
          await prisma.user.update({
            where: { id: userId },
            data: {
              ftp: upserted.ftp,
              lthr: upserted.lthr,
              maxHr: upserted.maxHr,
              restingHr: upserted.restingHr
            }
          })
        }

        results.push(upserted)
        continue
      }

      // Create new (Fallback)
      const created = await prisma.sportSettings.create({
        data: {
          userId,
          ...setting,
          source: setting.source || 'manual',
          externalId: setting.externalId || `manual_${Date.now()}`
        }
      })
      results.push(created)
    }

    // Optional: Delete removed profiles?
    // Usually "update" replaces the list.
    // If we want full replacement behavior (except Default), we need to know IDs to keep.
    // For now, we assume this method is just upserting what is passed.

    return results
  }
}

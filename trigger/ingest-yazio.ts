import './init'
import { logger, task } from '@trigger.dev/sdk/v3'
import { userIngestionQueue } from './queues'
import { prisma } from '../server/utils/db'
import { nutritionRepository } from '../server/utils/repositories/nutritionRepository'
import { getUserTimezone, getStartOfDayUTC } from '../server/utils/date'
import {
  fetchYazioDailySummary,
  fetchYazioConsumedItems,
  fetchYazioProductDetails,
  normalizeYazioData
} from '../server/utils/yazio'
import type { IngestionResult } from './types'

export const ingestYazioTask = task({
  id: 'ingest-yazio',
  queue: userIngestionQueue,
  maxDuration: 900, // 15 minutes
  run: async (payload: {
    userId: string
    startDate: string
    endDate: string
  }): Promise<IngestionResult> => {
    const { userId, startDate, endDate } = payload

    logger.log('='.repeat(60))
    logger.log('🍽️  YAZIO SYNC STARTING')
    logger.log('='.repeat(60))
    logger.log(`User ID: ${userId}`)
    logger.log(`Date Range: ${startDate} to ${endDate}`)

    // Fetch integration
    const integration = await prisma.integration.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: 'yazio'
        }
      }
    })

    if (!integration) {
      logger.error('❌ Yazio integration not found for user')
      throw new Error('Yazio integration not found for user')
    }

    logger.log(`✓ Found Yazio integration (ID: ${integration.id})`)

    // Update sync status
    await prisma.integration.update({
      where: { id: integration.id },
      data: { syncStatus: 'SYNCING' }
    })

    try {
      // Parse dates
      const start = new Date(startDate)
      const end = new Date(endDate)

      // Generate date range
      const dates = []
      const currentDate = new Date(start)

      while (currentDate <= end) {
        const year = currentDate.getUTCFullYear()
        const month = String(currentDate.getUTCMonth() + 1).padStart(2, '0')
        const day = String(currentDate.getUTCDate()).padStart(2, '0')
        dates.push(`${year}-${month}-${day}`)
        currentDate.setUTCDate(currentDate.getUTCDate() + 1)
      }

      logger.log('-'.repeat(60))
      logger.log(`📅 Generated ${dates.length} dates to process`)
      logger.log(`   First: ${dates[0]}`)
      logger.log(`   Last: ${dates[dates.length - 1]}`)
      logger.log('-'.repeat(60))

      let upsertedCount = 0
      let skippedCount = 0
      let errorCount = 0
      let cachedCount = 0
      let dbCacheHits = 0
      let apiFetches = 0

      logger.log('')

      for (const date of dates) {
        try {
          logger.log(`[${date}] Fetching data...`)

          // Fetch daily summary and consumed items
          const [summary, items] = await Promise.all([
            fetchYazioDailySummary(integration, date),
            fetchYazioConsumedItems(integration, date)
          ])

          const productsCount = items?.products?.length || 0
          const simpleProductsCount = items?.simple_products?.length || 0
          const totalItems = productsCount + simpleProductsCount

          logger.log(
            `[${date}] Found ${totalItems} items (${productsCount} products, ${simpleProductsCount} simple)`
          )

          if (totalItems === 0) {
            skippedCount++
            logger.log(`[${date}] ⊘ Skipping - no food logged`)
            continue
          }

          // Check if this is a recent date (today, yesterday, or last 2 days)
          // Recent dates should always be re-synced to catch new meals added throughout the day
          const dateObj = new Date(
            Date.UTC(
              parseInt(date.split('-')[0]!),
              parseInt(date.split('-')[1]!) - 1,
              parseInt(date.split('-')[2]!)
            )
          )
          const today = new Date()
          const daysDiff = Math.floor((today.getTime() - dateObj.getTime()) / (1000 * 60 * 60 * 24))
          const isRecentDate = daysDiff <= 2 // Today, yesterday, or 2 days ago

          if (!isRecentDate) {
            // For older dates, check if we already have complete data
            const existing = await nutritionRepository.getByDate(userId, dateObj)

            // Skip if record exists and already has product names (check first meal item)
            if (existing && existing.breakfast) {
              const firstItem = Array.isArray(existing.breakfast) ? existing.breakfast[0] : null
              if (firstItem && (firstItem as any).product_name) {
                cachedCount++
                logger.log(`[${date}] ✓ Already has product names - skipping (older date)`)
                continue
              }
            }
          } else {
            logger.log(`[${date}] Recent date - will update even if data exists`)
          }

          logger.log(
            `[${date}] Processing ${productsCount} products + ${simpleProductsCount} simple_products`
          )

          // Fetch product details to get names (simple_products already have names)
          const enrichedItems = { ...items }

          if (items?.products && items.products.length > 0) {
            const productsWithDetails = await Promise.all(
              items.products.map(async (item, index) => {
                try {
                  // Check database cache first
                  const cached = await prisma.yazioProductCache.findUnique({
                    where: {
                      productId: item.product_id
                    }
                  })

                  let productDetails

                  if (cached && cached.expiresAt > new Date()) {
                    // Use cached data
                    dbCacheHits++
                    logger.log(
                      `[${date}] Product ${index + 1}/${items.products.length}: ${item.product_id} (DB cached)`
                    )
                    productDetails = {
                      name: cached.name,
                      brand: cached.brand,
                      base_unit: cached.baseUnit,
                      nutrients: cached.nutrients
                    }
                  } else {
                    // Fetch from API
                    apiFetches++
                    logger.log(
                      `[${date}] Fetching product ${index + 1}/${items.products.length}: ${item.product_id}`
                    )
                    productDetails = await fetchYazioProductDetails(integration, item.product_id)

                    // Cache in database with 1 year TTL
                    const expiresAt = new Date()
                    expiresAt.setFullYear(expiresAt.getFullYear() + 1)

                    await prisma.yazioProductCache.upsert({
                      where: { productId: item.product_id },
                      create: {
                        productId: item.product_id,
                        name: productDetails?.name || 'Unknown Product',
                        brand: productDetails?.brand,
                        baseUnit: productDetails?.base_unit,
                        nutrients: productDetails?.nutrients,
                        expiresAt
                      },
                      update: {
                        name: productDetails?.name || 'Unknown Product',
                        brand: productDetails?.brand,
                        baseUnit: productDetails?.base_unit,
                        nutrients: productDetails?.nutrients,
                        expiresAt,
                        fetchedAt: new Date()
                      }
                    })
                  }

                  const enriched = {
                    ...item,
                    product_name: productDetails?.name || 'Unknown Product',
                    product_brand: productDetails?.brand || null,
                    product_nutrients: productDetails?.nutrients || null
                  }
                  logger.log(
                    `[${date}] → "${enriched.product_name}"${enriched.product_brand ? ` (${enriched.product_brand})` : ''}`
                  )
                  return enriched
                } catch (error) {
                  logger.error(`[${date}] ✗ Failed to fetch product ${item.product_id}:`, {
                    error: error instanceof Error ? error.message : String(error)
                  })
                  return {
                    ...item,
                    product_name: 'Unknown Product'
                  }
                }
              })
            )
            enrichedItems.products = productsWithDetails
          }

          // Log simple products (already have names)
          if (items?.simple_products && items.simple_products.length > 0) {
            items.simple_products.forEach((item, index) => {
              logger.log(
                `[${date}] Simple product ${index + 1}/${items.simple_products.length}: "${item.name}" (AI-generated)`
              )
            })
          }

          // Normalize data with enriched items
          const nutrition = normalizeYazioData(summary, enrichedItems, userId, date)

          // Debug the final nutrition meals data
          logger.log(`[${date}] Final meal items:`)
          if (nutrition.breakfast) logger.log(`  Breakfast: ${nutrition.breakfast.length} items`)
          if (nutrition.lunch) logger.log(`  Lunch: ${nutrition.lunch.length} items`)
          if (nutrition.dinner) logger.log(`  Dinner: ${nutrition.dinner.length} items`)
          if (nutrition.snacks) logger.log(`  Snacks: ${nutrition.snacks.length} items`)

          // Log what we're about to save
          logger.log(`[${date}] 💾 Saving to database...`)
          logger.log(`[${date}]    Calories: ${nutrition.calories}/${nutrition.caloriesGoal}`)
          logger.log(`[${date}]    Protein: ${nutrition.protein?.toFixed(1)}g`)
          logger.log(`[${date}]    Carbs: ${nutrition.carbs?.toFixed(1)}g`)
          logger.log(`[${date}]    Fat: ${nutrition.fat?.toFixed(1)}g`)

          // Upsert to database
          // When updating, clear AI analysis since the underlying data has changed
          const result = await nutritionRepository.upsert(
            userId,
            nutrition.date,
            nutrition as any,
            {
              ...nutrition,
              // Clear AI analysis fields since nutrition data has changed
              aiAnalysis: null,
              aiAnalysisJson: null,
              aiAnalysisStatus: 'NOT_STARTED',
              aiAnalyzedAt: null,
              // Clear scores
              overallScore: null,
              macroBalanceScore: null,
              qualityScore: null,
              adherenceScore: null,
              hydrationScore: null,
              // Clear score explanations
              nutritionalBalanceExplanation: null,
              calorieAdherenceExplanation: null,
              macroDistributionExplanation: null,
              hydrationStatusExplanation: null,
              timingOptimizationExplanation: null
            } as any
          )

          upsertedCount++
          logger.log(`[${date}] ✅ Synced successfully (ID: ${result.record.id})`)
          logger.log('')
        } catch (error: any) {
          errorCount++
          logger.error(`[${date}] ❌ ERROR:`, { error: error?.message || String(error) })
          logger.error(`[${date}] Stack:`, { stack: error instanceof Error ? error.stack : 'N/A' })
          logger.log('')
          // Continue with other dates
        }
      }

      logger.log('='.repeat(60))
      logger.log('📊 SYNC SUMMARY')
      logger.log('='.repeat(60))
      logger.log(`✅ Successfully synced: ${upsertedCount} days`)
      logger.log(`✓  Already cached: ${cachedCount} days`)
      logger.log(`⊘  Skipped (no data): ${skippedCount} days`)
      logger.log(`❌ Errors: ${errorCount} days`)
      logger.log(`📆 Total processed: ${dates.length} days`)
      logger.log('')
      logger.log('🗄️  Product Cache Stats:')
      logger.log(`   DB cache hits: ${dbCacheHits}`)
      logger.log(`   API fetches: ${apiFetches}`)
      logger.log(`   Total products processed: ${dbCacheHits + apiFetches}`)
      logger.log('='.repeat(60))

      // Update sync status
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          syncStatus: 'SUCCESS',
          lastSyncAt: new Date(),
          errorMessage: null
        }
      })

      return {
        success: true,
        counts: {
          nutrition: upsertedCount
        },
        userId,
        startDate,
        endDate
      }
    } catch (error) {
      logger.error('Error ingesting Yazio data', { error })

      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          syncStatus: 'FAILED',
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        }
      })

      throw error
    }
  }
})

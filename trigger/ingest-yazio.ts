import { logger, task } from "@trigger.dev/sdk/v3"
import { prisma } from "../server/utils/db"
import { 
  fetchYazioDailySummary, 
  fetchYazioConsumedItems,
  normalizeYazioData 
} from "../server/utils/yazio"

export const ingestYazioTask = task({
  id: "ingest-yazio",
  run: async (payload: { 
    userId: string
    startDate: string
    endDate: string
  }) => {
    const { userId, startDate, endDate } = payload
    
    logger.log("Starting Yazio ingestion", { userId, startDate, endDate })
    
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
      throw new Error('Yazio integration not found for user')
    }
    
    // Update sync status
    await prisma.integration.update({
      where: { id: integration.id },
      data: { syncStatus: 'SYNCING' }
    })
    
    try {
      // Parse dates and log the range
      const start = new Date(startDate)
      const end = new Date(endDate)
      
      logger.log(`Date range parameters received:`, {
        startDate,
        endDate,
        startParsed: start.toISOString(),
        endParsed: end.toISOString()
      })
      
      // Generate date range - FIX: Create new Date object for each iteration
      const dates = []
      const currentDate = new Date(start)
      
      while (currentDate <= end) {
        // Use UTC date to avoid timezone issues
        const year = currentDate.getUTCFullYear()
        const month = String(currentDate.getUTCMonth() + 1).padStart(2, '0')
        const day = String(currentDate.getUTCDate()).padStart(2, '0')
        const dateStr = `${year}-${month}-${day}`
        dates.push(dateStr)
        
        // Move to next day
        currentDate.setUTCDate(currentDate.getUTCDate() + 1)
      }
      
      logger.log(`Generated ${dates.length} dates to fetch:`, {
        first: dates[0],
        last: dates[dates.length - 1],
        total: dates.length
      })
      
      let upsertedCount = 0
      let skippedCount = 0
      let errorCount = 0
      
      for (const date of dates) {
        try {
          logger.log(`[${date}] Fetching Yazio data...`)
          
          // Fetch daily summary and consumed items
          const [summary, items] = await Promise.all([
            fetchYazioDailySummary(integration, date),
            fetchYazioConsumedItems(integration, date)
          ])
          
          logger.log(`[${date}] API Response:`, {
            hasSummary: !!summary,
            summaryGoals: summary?.goals,
            summaryMeals: summary?.meals ? Object.keys(summary.meals) : [],
            itemsCount: items?.products?.length || 0
          })
          
          // Normalize data
          const nutrition = normalizeYazioData(summary, items, userId, date)
          
          logger.log(`[${date}] Normalized data:`, {
            date: nutrition.date,
            calories: nutrition.calories,
            protein: nutrition.protein,
            carbs: nutrition.carbs,
            fat: nutrition.fat,
            hasBreakfast: !!nutrition.breakfast,
            hasLunch: !!nutrition.lunch,
            hasDinner: !!nutrition.dinner
          })
          
          // Skip days with no nutrition data (no food logged)
          if (!nutrition.calories || nutrition.calories === 0) {
            skippedCount++
            logger.log(`[${date}] ⊘ Skipped - no nutrition data logged`)
            continue
          }
          
          // Upsert to database
          const result = await prisma.nutrition.upsert({
            where: {
              userId_date: {
                userId,
                date: nutrition.date
              }
            },
            update: nutrition,
            create: nutrition
          })
          
          upsertedCount++
          logger.log(`[${date}] ✓ Synced successfully (ID: ${result.id})`)
        } catch (error) {
          errorCount++
          logger.error(`[${date}] ✗ Error syncing:`, {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
          })
          // Continue with other dates
        }
      }
      
      logger.log(`Sync completed:`, {
        total: dates.length,
        upserted: upsertedCount,
        errors: errorCount,
        skipped: skippedCount
      })
      
      logger.log(`Upserted ${upsertedCount} nutrition entries`)
      
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
        count: upsertedCount,
        userId,
        startDate,
        endDate
      }
    } catch (error) {
      logger.error("Error ingesting Yazio data", { error })
      
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
import './init'
import { logger, task } from '@trigger.dev/sdk/v3'
import { generateStructuredAnalysis } from '../server/utils/gemini'
import { prisma } from '../server/utils/db'
import { userReportsQueue } from './queues'
import { checkQuota } from '../server/utils/quotas/engine'
import {
  fetchReportContext,
  renderPrompt,
  convertStructuredToMarkdown
} from '../server/utils/report-engine'

export const generateReportTask = task({
  id: 'generate-report',
  maxDuration: 600, // 10 minutes
  queue: userReportsQueue,
  run: async (payload: { userId: string; reportId: string; templateId?: string }) => {
    const { userId, reportId, templateId } = payload

    logger.log('Starting unified report generation', { userId, reportId, templateId })

    // 1. Fetch Report and Template
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      include: { template: true }
    })

    if (!report) throw new Error(`Report not found: ${reportId}`)

    // Check Quota
    try {
      await checkQuota(userId, 'unified_report_generation')
    } catch (quotaError: any) {
      if (quotaError.statusCode === 429) {
        logger.warn('Unified report generation quota exceeded', { userId, reportId })
        await prisma.report.update({
          where: { id: reportId },
          data: { status: 'FAILED' }
        })
        return { success: false, reason: 'QUOTA_EXCEEDED' }
      }
      throw quotaError
    }

    // Use template from relation or from payload or fallback to a default
    const template =
      report.template ||
      (templateId ? await prisma.reportTemplate.findUnique({ where: { id: templateId } }) : null)

    if (!template) {
      throw new Error(`Report template not found for report ${reportId}`)
    }

    // Update report status to PROCESSING and ensure templateId is set
    await prisma.report.update({
      where: { id: reportId },
      data: {
        status: 'PROCESSING',
        templateId: template.id
      }
    })

    try {
      // 2. Fetch Context Data based on template configuration
      const context = await fetchReportContext(userId, template.inputConfig)

      // Check if this is a nutrition report and if nutrition tracking is disabled
      const isNutritionReport = template.name.toLowerCase().includes('nutrition')
      if (isNutritionReport && !context.user?.nutritionTrackingEnabled) {
        logger.log('Skipping nutrition report because tracking is disabled', {
          userId,
          reportId
        })
        await prisma.report.update({
          where: { id: reportId },
          data: {
            status: 'COMPLETED', // Mark as complete to avoid re-runs
            markdown: 'Nutrition tracking is disabled. This report cannot be generated.'
          }
        })
        return { success: true, skipped: true, reason: 'Nutrition tracking disabled' }
      }

      // 3. Render Prompt Template
      const prompt = renderPrompt((template.outputConfig as any).promptTemplate, context)
      const schema = (template.outputConfig as any).schema

      const modelPreference = context.user?.aiModelPreference || 'flash'

      logger.log(`Generating structured analysis with Gemini (${modelPreference})`)

      // 4. Generate AI Analysis using structured output
      const structuredAnalysis = await generateStructuredAnalysis<any>(
        prompt,
        schema,
        modelPreference,
        {
          userId,
          operation: 'unified_report_generation',
          entityType: 'Report',
          entityId: reportId
        }
      )

      // 5. Convert structured JSON to Markdown for backward compatibility/fallback
      const markdownAnalysis = convertStructuredToMarkdown(structuredAnalysis)

      logger.log('Analysis generated successfully, saving to database')

      // 6. Save results to database in a transaction
      await prisma.$transaction(async (tx) => {
        // Update the report record
        await tx.report.update({
          where: { id: reportId },
          data: {
            status: 'COMPLETED',
            markdown: markdownAnalysis,
            analysisJson: structuredAnalysis as any,
            modelVersion: modelPreference,
            // Extract scores if they follow the standard schema
            overallScore: structuredAnalysis.scores?.overall ?? null,
            trainingLoadScore: structuredAnalysis.scores?.training_load ?? null,
            recoveryScore: structuredAnalysis.scores?.recovery ?? null,
            progressScore: structuredAnalysis.scores?.progress ?? null,
            consistencyScore: structuredAnalysis.scores?.consistency ?? null,
            // Extract explanations
            trainingLoadExplanation: structuredAnalysis.scores?.training_load_explanation ?? null,
            recoveryBalanceExplanation: structuredAnalysis.scores?.recovery_explanation ?? null,
            progressTrendExplanation: structuredAnalysis.scores?.progress_explanation ?? null,
            adaptationReadinessExplanation:
              structuredAnalysis.scores?.consistency_explanation ?? null,
            injuryRiskExplanation: structuredAnalysis.scores?.overall_explanation ?? null
          }
        })

        // Link related entities (Workouts/Nutrition) to the report
        const workoutSources = (template.inputConfig as any).sources.filter(
          (s: any) => s.entity === 'workout'
        )
        for (const source of workoutSources) {
          const workouts = context[source.key || 'workouts']
          if (workouts && Array.isArray(workouts)) {
            await tx.reportWorkout.createMany({
              data: workouts.map((w: any) => ({
                reportId,
                workoutId: w.id
              })),
              skipDuplicates: true
            })
          }
        }
      })

      return {
        success: true,
        reportId,
        userId,
        templateName: template.name
      }
    } catch (error) {
      logger.error('Error in unified report generation', { error })

      await prisma.report.update({
        where: { id: reportId },
        data: { status: 'FAILED' }
      })

      throw error
    }
  }
})

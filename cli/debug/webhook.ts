import { Command } from 'commander';
import chalk from 'chalk';
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const debugWebhookCommand = new Command('webhook');

debugWebhookCommand
  .description('Debug WebhookLog entries and their processing')
  .argument('[id]', 'WebhookLog ID to debug')
  .option('--prod', 'Use production database')
  .option('-l, --limit <number>', 'Limit number of logs to check', '10')
  .option('-s, --status <status>', 'Filter by status (PENDING, PROCESSED, FAILED)')
  .option('--provider <provider>', 'Filter by provider')
  .action(async (id, options) => {
    const isProd = options.prod;
    const connectionString = isProd ? process.env.DATABASE_URL_PROD : process.env.DATABASE_URL;

    if (isProd) {
      if (!connectionString) {
        console.error(chalk.red('DATABASE_URL_PROD is not defined.'));
        process.exit(1);
      }
      console.log(chalk.yellow('Using PRODUCTION database.'));
    } else {
      console.log(chalk.blue('Using DEVELOPMENT database.'));
    }

    const pool = new pg.Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({ adapter });

    try {
      if (id) {
        await debugSingleLog(prisma, id);
      } else {
        await debugMultipleLogs(prisma, options);
      }

    } catch (e: any) {
      console.error(chalk.red('Error:'), e);
    } finally {
      await prisma.$disconnect();
      await pool.end();
    }
  });

async function debugSingleLog(prisma: PrismaClient, id: string) {
    console.log(chalk.gray(`Fetching WebhookLog ${id}...`));
    
    const log = await prisma.webhookLog.findUnique({
      where: { id }
    });

    if (!log) {
      console.error(chalk.red(`WebhookLog not found: ${id}`));
      return;
    }

    await debugLogDetails(prisma, log);
}

async function debugMultipleLogs(prisma: PrismaClient, options: any) {
    const limit = parseInt(options.limit);
    const where: any = {};
    if (options.status) where.status = options.status;
    if (options.provider) where.provider = options.provider;
    
    console.log(chalk.gray(`Fetching last ${limit} webhooks${options.status ? ` with status ${options.status}` : ''}...`));
    const logs = await prisma.webhookLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit
    });
    
    console.log(chalk.gray(`Found ${logs.length} logs.`));
    
    for (const log of logs) {
        console.log(chalk.gray('---------------------------------------------------'));
        await debugLogDetails(prisma, log);
    }
}

async function debugLogDetails(prisma: PrismaClient, log: any) {
    console.log(chalk.bold.cyan(`
=== Webhook Log Details ===`));
    console.log(`ID:          ${chalk.gray(log.id)}`);
    console.log(`Provider:    ${chalk.yellow(log.provider)}`);
    console.log(`Event Type:  ${chalk.magenta(log.eventType)}`);
    console.log(`Status:      ${log.status === 'PROCESSED' ? chalk.green(log.status) : log.status === 'FAILED' ? chalk.red(log.status) : chalk.yellow(log.status)}`);
    console.log(`Created At:  ${chalk.white(log.createdAt.toISOString())}`);
    console.log(`Processed At: ${log.processedAt ? chalk.white(log.processedAt.toISOString()) : chalk.gray('N/A')}`);
    if (log.error) {
    console.log(`Error:       ${chalk.red(log.error)}`);
    }

    const payload: any = log.payload;
    if (!payload) {
    console.log(chalk.red('❌ No payload found in log.'));
    return;
    }

    console.log(chalk.bold.cyan(`
=== Payload Analysis ===`));
    // console.log(JSON.stringify(payload, null, 2));

    if (log.provider === 'intervals') {
    await analyzeIntervalsWebhook(prisma, log, payload);
    } else {
    console.log(chalk.yellow(`Analysis logic for provider '${log.provider}' is not implemented yet.`));
    }
}

async function analyzeIntervalsWebhook(prisma: PrismaClient, log: any, payload: any) {
  const events = payload.events || [];
  console.log(`Found ${events.length} event(s) in payload.`);

  for (const [index, event] of events.entries()) {
    console.log(chalk.bold(`
--- Event #${index + 1} (${event.type}) ---`));
    
    const athleteId = event.athlete_id;
    if (!athleteId) {
      console.log(chalk.red('❌ No athlete_id in event.'));
      continue;
    }
    console.log(`Athlete ID: ${chalk.blue(athleteId)}`);

    const integration = await prisma.integration.findFirst({
      where: {
        provider: 'intervals',
        externalUserId: athleteId.toString()
      },
      include: { user: true }
    });

    if (!integration) {
      console.log(chalk.red(`❌ No integration found for externalUserId: ${athleteId}`));
      continue;
    }

    console.log(`User:       ${chalk.green(integration.user.email)} (${integration.userId})`);
    
    // Logic Simulation
    let startDate: Date | undefined;
    let endDate: Date = new Date(log.createdAt); // Use log creation time as "now" reference
    endDate.setHours(23, 59, 59, 999);

    const type = event.type;
    let actionDescription = '';

    switch (type) {
      case 'ACTIVITY_UPLOADED':
      case 'ACTIVITY_ANALYZED':
      case 'WELLNESS_UPDATED':
        startDate = new Date(log.createdAt);
        startDate.setDate(startDate.getDate() - 2);
        actionDescription = `Sync data from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`;
        break;

      case 'ACTIVITY_UPDATED':
        const activityDateStr = event.activity?.start_date_local || event.activity?.start_date;
        if (activityDateStr) {
            const actDate = new Date(activityDateStr);
            startDate = new Date(actDate);
            startDate.setDate(startDate.getDate() - 1);
            endDate = new Date(actDate);
            endDate.setDate(endDate.getDate() + 1);
            actionDescription = `Sync activity range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`;
        } else {
            startDate = new Date(log.createdAt);
            startDate.setDate(startDate.getDate() - 2);
            actionDescription = `Sync fallback range (last 2 days)`;
        }
        break;

      case 'FITNESS_UPDATED':
        const records = event.records || [];
        if (records.length > 0) {
            const dates = records.map((r: any) => new Date(r.id).getTime());
            const minDate = new Date(Math.min(...dates));
            const maxDate = new Date(Math.max(...dates));
            startDate = minDate;
            endDate = maxDate;
            actionDescription = `Sync fitness range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`;
        } else {
            startDate = new Date(log.createdAt);
            startDate.setDate(startDate.getDate() - 2);
            actionDescription = `Sync fallback range (last 2 days)`;
        }
        break;

      case 'ACTIVITY_DELETED':
        const deletedActivityId = event.activity?.id || event.id;
        actionDescription = `Delete activity ${deletedActivityId} AND Sync data (1 day back)`;
        if (deletedActivityId) {
           // Check if it still exists (it shouldn't)
           const exists = await prisma.workout.findFirst({
             where: {
               userId: integration.userId,
               source: 'intervals',
               externalId: deletedActivityId.toString()
             }
           });
           if (exists) {
             console.log(chalk.red(`❌ Activity ${deletedActivityId} still exists in DB!`));
           } else {
             console.log(chalk.green(`✅ Activity ${deletedActivityId} not found in DB (correctly deleted).`));
           }
        }
        startDate = new Date(log.createdAt);
        startDate.setDate(startDate.getDate() - 1);
        break;
      
      case 'CALENDAR_UPDATED':
        const deletedEvents = event.deleted_events || [];
        actionDescription = `Sync calendar (last 3 days to +28 days). Deleted events: ${deletedEvents.length}`;
        if (deletedEvents.length > 0) {
           const deletedIds = deletedEvents.map((id: any) => id.toString());
           const count = await prisma.plannedWorkout.count({
             where: {
               userId: integration.userId,
               externalId: { in: deletedIds }
             }
           });
            if (count > 0) {
             console.log(chalk.red(`❌ ${count} deleted planned workouts still exist in DB!`));
           } else {
             console.log(chalk.green(`✅ Deleted planned workouts not found in DB.`));
           }
        }
        startDate = new Date(log.createdAt);
        startDate.setDate(startDate.getDate() - 3);
        endDate = new Date(log.createdAt);
        endDate.setDate(endDate.getDate() + 28);
        break;

      default:
        actionDescription = chalk.yellow('Unhandled event type');
        console.log(chalk.gray('Event Payload:'), JSON.stringify(event, null, 2));
    }

    console.log(`Expected Action: ${chalk.blue(actionDescription)}`);

    if (startDate) {
        // Check for updates around the processed time
        if (log.processedAt) {
             console.log(chalk.gray(`Checking for data updates after processedAt (${log.processedAt.toISOString()})...`));
             
             // Check Workouts
             const workoutsUpdated = await prisma.workout.count({
                 where: {
                     userId: integration.userId,
                     source: 'intervals',
                     updatedAt: { gte: log.processedAt }
                 }
             });
             
             // Check Metrics
             const metricsUpdated = await prisma.dailyMetric.count({
                where: {
                    userId: integration.userId,
                    source: 'intervals', // Assuming daily metrics source is intervals? wait, schema says "whoop", "garmin", "oura". Intervals might map to one of these or just be intervals?
                    // Let's check schema again. dailyMetric source is string.
                    // Intervals endpoint doesn't seem to touch dailyMetric directly?
                    // Ah, ingest-intervals might.
                }
             });
             // Actually, intervals ingestion might update Wellness -> Wellness table
             const wellnessUpdated = await prisma.wellness.count({
                 where: {
                     userId: integration.userId,
                     updatedAt: { gte: log.processedAt }
                 }
             });

             // Check Planned Workouts
             const plansUpdated = await prisma.plannedWorkout.count({
                 where: {
                     userId: integration.userId,
                     updatedAt: { gte: log.processedAt }
                 }
             });

             // Check Events
             const eventsUpdated = await prisma.event.count({
                 where: {
                     userId: integration.userId,
                     source: 'intervals',
                     updatedAt: { gte: log.processedAt }
                 }
             });

             console.log(`
Updates since processing:`);
             console.log(`Workouts:        ${workoutsUpdated > 0 ? chalk.green(workoutsUpdated) : chalk.gray(0)}`);
             console.log(`Wellness:        ${wellnessUpdated > 0 ? chalk.green(wellnessUpdated) : chalk.gray(0)}`);
             console.log(`PlannedWorkouts: ${plansUpdated > 0 ? chalk.green(plansUpdated) : chalk.gray(0)}`);
             console.log(`Events:          ${eventsUpdated > 0 ? chalk.green(eventsUpdated) : chalk.gray(0)}`);
        } else {
            console.log(chalk.yellow('Log was not processed successfully, skipping update check.'));
        }
    }
  }
}

export default debugWebhookCommand;

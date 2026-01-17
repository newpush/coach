import { Command } from 'commander'
import IORedis from 'ioredis'
import chalk from 'chalk'
import 'dotenv/config'

const redisCommand = new Command('redis')

redisCommand
  .description('Check Redis connection')
  .action(async () => {
    console.log(chalk.blue('=== Redis Connection Check ===\n'))

    const connectionString = process.env.REDIS_URL

    if (!connectionString) {
        console.log(chalk.yellow('WARNING: REDIS_URL env var is not set. Using default: redis://localhost:6379'))
    } else {
        // Obfuscate password for display
        const displayUrl = connectionString.replace(/:([^@]+)@/, ':****@')
        console.log(`Using REDIS_URL: ${displayUrl}`)
    }

    const redisUrl = connectionString || 'redis://localhost:6379'
    
    const redis = new IORedis(redisUrl, {
        maxRetriesPerRequest: 1,
        // Disable auto-reconnect for this check
        retryStrategy: null,
        lazyConnect: true // We will manually connect
    })

    try {
        await redis.connect()
        
        const options = redis.options
        const hasPassword = !!options.password
        console.log(chalk.green(`\n✔ Redis connected successfully!`))
        console.log(`  Host: ${options.host}`)
        console.log(`  Port: ${options.port}`)
        console.log(`  Auth: ${hasPassword ? 'Password provided' : 'No password provided'}`)
        
        // Use disconnect to force close as we are done
        redis.disconnect()
        process.exit(0)

    } catch (err: any) {
        console.error(chalk.red(`\n✘ Redis connection failed:`))
        console.error(chalk.red(`  ${err.message}`))
        
        if (err.message && err.message.includes('NOAUTH')) {
            console.log(chalk.yellow('\nHint: The Redis server requires a password but none was provided.'))
            console.log(chalk.yellow('      Check your REDIS_URL environment variable.'))
        }
        
        redis.disconnect()
        process.exit(1)
    }
  })

export default redisCommand
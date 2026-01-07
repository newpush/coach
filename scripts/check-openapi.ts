import 'dotenv/config'

async function checkOpenApi() {
  const url = 'http://localhost:3099/_openapi.json'
  console.log(`Checking OpenAPI spec at ${url}...`)

  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch OpenAPI spec: ${response.status} ${response.statusText}`)
    }

    const spec = await response.json()
    console.log('OpenAPI spec fetched successfully.')
    console.log(`Title: ${spec.info.title}`)
    console.log(`Version: ${spec.info.version}`)
    console.log(`Path count: ${Object.keys(spec.paths).length}`)

    const documentedPaths = Object.keys(spec.paths).sort()
    console.log('\nDocumented Paths (sample):')
    documentedPaths.slice(0, 10).forEach((p) => console.log(`- ${p}`))

    if (documentedPaths.length > 10) {
      console.log(`... and ${documentedPaths.length - 10} more.`)
    }
  } catch (error) {
    console.error('Error checking OpenAPI spec:', error)
    process.exit(1)
  }
}

checkOpenApi()

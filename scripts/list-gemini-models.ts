async function listGeminiModels() {
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    console.error('GEMINI_API_KEY not found in environment variables')
    process.exit(1)
  }

  try {
    console.log('Fetching available Gemini models...\n')

    // Use the REST API directly to list models
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    )

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
    const models = data.models || []

    console.log('Available Models:')
    console.log('=================\n')

    for (const model of models) {
      console.log(`Name: ${model.name}`)
      console.log(`Display Name: ${model.displayName || 'N/A'}`)
      console.log(`Description: ${model.description || 'N/A'}`)
      console.log(`Supported Methods: ${model.supportedGenerationMethods?.join(', ') || 'None'}`)
      console.log(`Input Token Limit: ${model.inputTokenLimit || 'Unknown'}`)
      console.log(`Output Token Limit: ${model.outputTokenLimit || 'Unknown'}`)
      console.log('---')
    }

    // Filter for Gemini 2.0 and 3.0 models
    console.log('\n\nGemini 2.0/3.0 Models with generateContent support:')
    console.log('===================================================\n')

    const gemini2Models = models.filter(
      (m: any) =>
        (m.name.includes('gemini-2') || m.name.includes('gemini-3')) &&
        m.supportedGenerationMethods?.includes('generateContent')
    )

    if (gemini2Models.length === 0) {
      console.log('No Gemini 2.0/3.0 models found with generateContent support.')
      console.log('\nAll models with generateContent:')
      const allGenContentModels = models.filter((m: any) =>
        m.supportedGenerationMethods?.includes('generateContent')
      )
      for (const model of allGenContentModels) {
        const modelId = model.name.replace('models/', '')
        console.log(`✓ ${modelId}`)
      }
    } else {
      for (const model of gemini2Models) {
        const modelId = model.name.replace('models/', '')
        console.log(`✓ ${modelId}`)
        console.log(`  Display Name: ${model.displayName || 'N/A'}`)
        console.log(`  Description: ${model.description || 'N/A'}`)
        console.log('')
      }
    }
  } catch (error) {
    console.error('Error listing models:', error)
    process.exit(1)
  }
}

listGeminiModels()

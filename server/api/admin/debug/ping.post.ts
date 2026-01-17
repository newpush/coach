import { defineEventHandler, readBody, createError } from 'h3'
import { getServerSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  const session = await getServerSession(event)
  if (!session?.user?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const { url, method = 'GET' } = await readBody(event)

  if (!url) {
    throw createError({ statusCode: 400, statusMessage: 'URL is required' })
  }

  const start = performance.now()
  try {
    const response = await $fetch.raw(url, {
      method,
      ignoreResponseError: true
    })
    const end = performance.now()

    // Handle body - potentially text or JSON
    let body = response._data
    if (typeof body === 'object') {
      body = JSON.stringify(body, null, 2)
    } else {
      body = String(body)
    }

    return {
      success: response.status >= 200 && response.status < 300,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body,
      duration: Math.round(end - start)
    }
  } catch (error: any) {
    const end = performance.now()
    return {
      success: false,
      error: error.message,
      code: error.code, // e.g. ENOTFOUND
      cause: error.cause,
      duration: Math.round(end - start)
    }
  }
})

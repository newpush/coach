import { setCurrencyRates } from '~/utils/currency'

export default defineNuxtPlugin(async () => {
  try {
    const data = await $fetch<{ rates: Record<string, number> }>('/api/currency/rates')
    if (data?.rates) {
      setCurrencyRates(data.rates)
    }
  } catch (error) {
    console.warn('[CurrencyRates] Failed to load rates on client.', error)
  }
})

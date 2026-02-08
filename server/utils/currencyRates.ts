const SUPPORTED_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'CAD',
  'AUD',
  'NZD',
  'JPY',
  'CHF',
  'SEK',
  'NOK',
  'DKK',
  'INR',
  'BRL',
  'MXN',
  'KRW',
  'SGD',
  'HKD',
  'ZAR',
  'ARS',
  'CLP'
]

const FALLBACK_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  CAD: 1.35,
  AUD: 1.55,
  NZD: 1.65,
  JPY: 147,
  CHF: 0.9,
  SEK: 10.2,
  NOK: 10.6,
  DKK: 6.9,
  INR: 83,
  BRL: 4.95,
  MXN: 17.2,
  KRW: 1340,
  SGD: 1.34,
  HKD: 7.8,
  ZAR: 18.4,
  ARS: 1100,
  CLP: 960
}

let cachedRates: Record<string, number> = { ...FALLBACK_RATES }
let lastUpdated: string | null = null
let source = 'fallback'

interface FrankfurterResponse {
  amount: number
  base: string
  date: string
  rates: Record<string, number>
}

export async function refreshCurrencyRates() {
  try {
    const response = await fetch('https://api.frankfurter.app/latest?from=USD')
    if (!response.ok) {
      throw new Error(`Frankfurter responded with ${response.status}`)
    }
    const data = (await response.json()) as FrankfurterResponse
    const nextRates: Record<string, number> = { USD: 1 }

    for (const code of SUPPORTED_CURRENCIES) {
      if (code === 'USD') continue
      const rate = data.rates?.[code]
      if (typeof rate === 'number') {
        nextRates[code] = rate
      }
    }

    cachedRates = { ...FALLBACK_RATES, ...nextRates }
    lastUpdated = data.date || new Date().toISOString().slice(0, 10)
    source = 'frankfurter'
  } catch (error) {
    console.warn('[CurrencyRates] Failed to refresh rates, using fallback.', error)
  }
}

export function getCurrencyRates() {
  return {
    rates: cachedRates,
    lastUpdated,
    source
  }
}

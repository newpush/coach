export interface CurrencyContext {
  country?: string | null
  preferredCurrency?: string | null
  profileTimezone?: string | null
  browserTimezone?: string | null
  locale?: string | null
}

const COUNTRY_ALIASES: Record<string, string> = {
  'united states': 'US',
  'united states of america': 'US',
  usa: 'US',
  uk: 'GB',
  'united kingdom': 'GB',
  england: 'GB',
  scotland: 'GB',
  wales: 'GB',
  'northern ireland': 'GB',
  russia: 'RU',
  korea: 'KR',
  'south korea': 'KR',
  'republic of korea': 'KR',
  'north korea': 'KP',
  'new zealand': 'NZ'
}

const COUNTRY_TO_CURRENCY: Record<string, string> = {
  US: 'USD',
  CA: 'CAD',
  MX: 'MXN',
  BR: 'BRL',
  AR: 'ARS',
  CL: 'CLP',
  GB: 'GBP',
  IE: 'EUR',
  FR: 'EUR',
  DE: 'EUR',
  ES: 'EUR',
  IT: 'EUR',
  NL: 'EUR',
  BE: 'EUR',
  PT: 'EUR',
  AT: 'EUR',
  FI: 'EUR',
  NO: 'NOK',
  SE: 'SEK',
  DK: 'DKK',
  CH: 'CHF',
  JP: 'JPY',
  KR: 'KRW',
  IN: 'INR',
  AU: 'AUD',
  NZ: 'NZD',
  SG: 'SGD',
  HK: 'HKD',
  ZA: 'ZAR'
}

const CURRENCY_LABELS: Record<string, string> = {
  USD: 'US Dollar',
  EUR: 'Euro',
  GBP: 'British Pound',
  CAD: 'Canadian Dollar',
  AUD: 'Australian Dollar',
  NZD: 'New Zealand Dollar',
  JPY: 'Japanese Yen',
  CHF: 'Swiss Franc',
  SEK: 'Swedish Krona',
  NOK: 'Norwegian Krone',
  DKK: 'Danish Krone',
  INR: 'Indian Rupee',
  BRL: 'Brazilian Real',
  MXN: 'Mexican Peso',
  KRW: 'South Korean Won',
  SGD: 'Singapore Dollar',
  HKD: 'Hong Kong Dollar',
  ZAR: 'South African Rand',
  ARS: 'Argentine Peso',
  CLP: 'Chilean Peso'
}

const DEFAULT_CURRENCY_RATES: Record<string, number> = {
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

let dynamicRates: Record<string, number> | null = null

const TIMEZONE_HINTS: Array<[string, string]> = [
  ['Europe/London', 'GBP'],
  ['Europe/Dublin', 'EUR'],
  ['Europe/', 'EUR'],
  ['America/Toronto', 'CAD'],
  ['America/Vancouver', 'CAD'],
  ['America/Montreal', 'CAD'],
  ['America/Edmonton', 'CAD'],
  ['America/Winnipeg', 'CAD'],
  ['America/Mexico', 'MXN'],
  ['America/Sao_Paulo', 'BRL'],
  ['America/Argentina', 'ARS'],
  ['America/Santiago', 'CLP'],
  ['America/', 'USD'],
  ['Asia/Tokyo', 'JPY'],
  ['Asia/Seoul', 'KRW'],
  ['Asia/Kolkata', 'INR'],
  ['Asia/Singapore', 'SGD'],
  ['Asia/Hong_Kong', 'HKD'],
  ['Australia/', 'AUD'],
  ['Pacific/Auckland', 'NZD'],
  ['Africa/Johannesburg', 'ZAR']
]

export const ACCEPTED_CURRENCIES = Object.keys(DEFAULT_CURRENCY_RATES)
  .sort()
  .map((code) => ({
    code,
    label: `${code} - ${CURRENCY_LABELS[code] || code}`
  }))

export function setCurrencyRates(rates: Record<string, number>) {
  dynamicRates = { ...rates }
}

function getRates(): Record<string, number> {
  return dynamicRates || DEFAULT_CURRENCY_RATES
}

function normalizeCountryCode(country?: string | null): string | undefined {
  if (!country) return undefined
  const trimmed = country.trim()
  if (!trimmed) return undefined
  if (trimmed.length === 2 || trimmed.length === 3) {
    return trimmed.toUpperCase()
  }
  const normalized = trimmed.toLowerCase()
  return COUNTRY_ALIASES[normalized] || undefined
}

function resolveCurrencyFromTimezone(timezone?: string | null): string | undefined {
  if (!timezone) return undefined
  const normalized = timezone.trim()
  for (const [hint, currency] of TIMEZONE_HINTS) {
    if (normalized.startsWith(hint)) return currency
  }
  return undefined
}

function resolveCountryFromLocale(locale?: string | null): string | undefined {
  if (!locale) return undefined
  const normalized = locale.trim()
  if (!normalized) return undefined
  const parts = normalized.split(/[-_]/)
  const region = parts[parts.length - 1]
  if (region && region.length === 2) return region.toUpperCase()
  return undefined
}

function getDefaultLocale(): string {
  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language
  }
  return 'en-US'
}

export function resolveCurrencyContext(context: CurrencyContext) {
  const countryCode = normalizeCountryCode(context.country)
  const preferredCurrency = context.preferredCurrency
    ? context.preferredCurrency.trim().toUpperCase()
    : undefined
  const rates = getRates()
  const hasPreferred = preferredCurrency && rates[preferredCurrency]
  const currencyFromCountry = countryCode ? COUNTRY_TO_CURRENCY[countryCode] : undefined
  const currencyFromProfileTz = resolveCurrencyFromTimezone(context.profileTimezone)
  const currencyFromBrowserTz = resolveCurrencyFromTimezone(context.browserTimezone)
  const localeCountry = resolveCountryFromLocale(context.locale)
  const currencyFromLocale = localeCountry ? COUNTRY_TO_CURRENCY[localeCountry] : undefined
  const currency =
    (hasPreferred ? preferredCurrency : undefined) ||
    currencyFromCountry ||
    currencyFromProfileTz ||
    currencyFromBrowserTz ||
    currencyFromLocale ||
    'USD'
  const rate = rates[currency] || 1
  const locale = context.locale || getDefaultLocale()

  return {
    currency,
    rate,
    locale,
    countryCode
  }
}

export function getCurrencyLabel(currency: string): string {
  return CURRENCY_LABELS[currency] || currency
}

export function formatCurrencyFromUsd(amountUsd: number, context: CurrencyContext): string {
  const { currency, rate, locale } = resolveCurrencyContext(context)
  const converted = amountUsd * rate
  const fractionDigits = converted % 1 === 0 ? 0 : 2

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  }).format(converted)
}

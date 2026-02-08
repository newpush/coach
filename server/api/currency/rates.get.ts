import { getCurrencyRates } from '../../utils/currencyRates'

export default defineEventHandler(() => {
  return getCurrencyRates()
})

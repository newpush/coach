import { refreshCurrencyRates } from '../utils/currencyRates'

export default defineNitroPlugin(async () => {
  await refreshCurrencyRates()
})

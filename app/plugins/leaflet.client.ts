export default defineNuxtPlugin(async (nuxtApp) => {
  if (import.meta.server) return

  const L = await import('leaflet')
  await import('leaflet/dist/leaflet.css')
  const { LMap, LTileLayer, LPolyline, LCircleMarker } = await import('@vue-leaflet/vue-leaflet')

  // Fix Leaflet's default icon paths
  type DefaultIcon = L.Icon.Default & {
    _getIconUrl?: string
  }

  const icon = L.Icon.Default.prototype as DefaultIcon
  if (icon._getIconUrl) {
    delete icon._getIconUrl
  }

  L.Icon.Default.mergeOptions({
    iconRetinaUrl: '/images/leaflet/marker-icon-2x.png',
    iconUrl: '/images/leaflet/marker-icon.png',
    shadowUrl: '/images/leaflet/marker-shadow.png'
  })

  // Register components globally
  nuxtApp.vueApp.component('LMap', LMap)
  nuxtApp.vueApp.component('LTileLayer', LTileLayer)
  nuxtApp.vueApp.component('LPolyline', LPolyline)
  nuxtApp.vueApp.component('LCircleMarker', LCircleMarker)
})

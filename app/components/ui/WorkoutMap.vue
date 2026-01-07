<template>
  <div
    class="h-96 w-full rounded-xl overflow-hidden ring-1 ring-gray-200 dark:ring-gray-800 z-0 bg-gray-100 dark:bg-gray-900 flex items-center justify-center"
  >
    <client-only>
      <LMap
        v-if="latLngs.length > 0"
        ref="map"
        :zoom="zoom"
        :center="center"
        :options="mapOptions"
        class="h-full w-full"
        @ready="onMapReady"
      >
        <LTileLayer :url="tileUrl" :attribution="attribution" layer-type="base" name="Base" />

        <LPolyline :lat-lngs="latLngs" :color="primaryColor" :weight="4" :opacity="0.8" />

        <!-- Start Marker -->
        <LCircleMarker
          v-if="startPoint"
          :lat-lng="startPoint"
          :radius="6"
          :color="'white'"
          :fill-color="primaryColor"
          :fill-opacity="1"
          :weight="2"
        />

        <!-- End Marker -->
        <LCircleMarker
          v-if="endPoint"
          :lat-lng="endPoint"
          :radius="6"
          :color="'white'"
          :fill-color="'red'"
          :fill-opacity="1"
          :weight="2"
        />
      </LMap>
      <div v-else class="flex flex-col items-center gap-2 text-gray-500">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin" />
        <span class="text-sm">Loading map...</span>
      </div>
    </client-only>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'

  const props = defineProps<{
    coordinates: any[]
    interactive?: boolean
    scrollWheelZoom?: boolean
  }>()

  const zoom = ref(13)
  const center = ref<[number, number]>([51.505, -0.09])
  const mapObject = ref<any>(null)

  // Map options
  const mapOptions = computed(() => ({
    scrollWheelZoom: props.scrollWheelZoom || false,
    dragging: props.interactive !== false,
    zoomControl: props.interactive !== false,
    doubleClickZoom: props.interactive !== false
  }))

  // Theme handling
  const colorMode = useColorMode()
  const isDark = computed(() => colorMode.value === 'dark')

  const tileUrl = computed(() => {
    return isDark.value
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
  })

  const attribution =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  const primaryColor = '#22c55e'

  const latLngs = computed(() => {
    if (!props.coordinates || !Array.isArray(props.coordinates)) return []

    // Filter out invalid coordinates to prevent Leaflet errors (COACH-WATTS-10)
    return props.coordinates.filter((coord) => {
      if (!coord) return false
      if (Array.isArray(coord)) {
        return (
          coord.length >= 2 &&
          typeof coord[0] === 'number' &&
          !isNaN(coord[0]) &&
          typeof coord[1] === 'number' &&
          !isNaN(coord[1])
        )
      }
      return (
        typeof coord.lat === 'number' &&
        !isNaN(coord.lat) &&
        typeof coord.lng === 'number' &&
        !isNaN(coord.lng)
      )
    })
  })

  const startPoint = computed(() => (latLngs.value.length > 0 ? latLngs.value[0] : null))
  const endPoint = computed(() =>
    latLngs.value.length > 0 ? latLngs.value[latLngs.value.length - 1] : null
  )

  const onMapReady = (map: any) => {
    mapObject.value = map
    fitBounds()
  }

  const fitBounds = () => {
    if (mapObject.value && latLngs.value.length > 0) {
      mapObject.value.fitBounds(latLngs.value, { padding: [50, 50] })
    }
  }

  watch(
    () => props.coordinates,
    () => {
      setTimeout(() => {
        fitBounds()
      }, 100)
    },
    { deep: true }
  )
</script>

<style scoped>
  :deep(.leaflet-pane) {
    z-index: 10 !important;
  }
  :deep(.leaflet-bottom) {
    z-index: 11 !important;
  }
  :deep(.leaflet-control-attribution) {
    display: none !important;
  }
</style>

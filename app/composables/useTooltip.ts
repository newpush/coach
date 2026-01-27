// app/composables/useTooltip.ts
export function useTooltip() {
  const tooltip = reactive({
    visible: false,
    x: 0,
    y: 0,
    content: ''
  })

  function showTooltip(event: MouseEvent, content: string) {
    tooltip.content = content
    tooltip.visible = true
    moveTooltip(event)
  }

  function moveTooltip(event: MouseEvent) {
    tooltip.x = event.clientX
    tooltip.y = event.clientY
  }

  function hideTooltip() {
    tooltip.visible = false
  }

  return {
    tooltip,
    showTooltip,
    moveTooltip,
    hideTooltip
  }
}

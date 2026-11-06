import { clamp } from 'lodash-es'

export function usePanelResize(key, initial, edge) {
  const width = useStorage(`3d-mql-panel-${key}`, initial)

  const onResizeStart = (e) => {
    const startX = e.clientX
    const startWidth = width.value
    const sign = edge === 'right' ? 1 : -1
    const stopMove = useEventListener(window, 'pointermove', (ev) => {
      width.value = clamp(startWidth + sign * (ev.clientX - startX), 200, 640)
    })
    useEventListener(window, 'pointerup', stopMove, { once: true })
  }

  return { width, onResizeStart }
}

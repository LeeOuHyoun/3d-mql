import { clamp } from 'lodash-es'

export function usePanelResize(key, initial, edge) {
  const width = useStorage(`3d-mql-panel-${key}`, initial)

  const onResizeStart = (e) => {
    const axis = edge === 'top' ? 'clientY' : 'clientX'
    const start = e[axis]
    const startWidth = width.value
    const sign = edge === 'right' ? 1 : -1
    const stopMove = useEventListener(window, 'pointermove', (ev) => {
      width.value = clamp(startWidth + sign * (ev[axis] - start), 200, 640)
    })
    useEventListener(window, 'pointerup', stopMove, { once: true })
  }

  return { width, onResizeStart }
}

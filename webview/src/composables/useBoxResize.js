export const BOX_RESIZE_HANDLES = [
  { dir: 'n', cursor: 'ns-resize' },
  { dir: 's', cursor: 'ns-resize' },
  { dir: 'e', cursor: 'ew-resize' },
  { dir: 'w', cursor: 'ew-resize' },
  { dir: 'ne', cursor: 'nesw-resize' },
  { dir: 'nw', cursor: 'nwse-resize' },
  { dir: 'se', cursor: 'nwse-resize' },
  { dir: 'sw', cursor: 'nesw-resize' },
]

const CURSOR_BY_DIR = Object.fromEntries(BOX_RESIZE_HANDLES.map((handle) => [handle.dir, handle.cursor]))

const containerBox = (container) => {
  const element = toValue(container)
  return element
    ? { w: element.clientWidth, h: element.clientHeight }
    : { w: window.innerWidth, h: window.innerHeight }
}

const applyDir = (start, dir, dx, dy, { minW, minH, maxW, maxH }, container) => {
  let left = start.x
  let top = start.y
  let right = start.x + start.w
  let bottom = start.y + start.h
  if (dir.includes('w')) left = Math.min(right - minW, Math.max(0, right - maxW, start.x + dx))
  if (dir.includes('e')) right = Math.max(left + minW, Math.min(container.w, left + maxW, right + dx))
  if (dir.includes('n')) top = Math.min(bottom - minH, Math.max(0, bottom - maxH, start.y + dy))
  if (dir.includes('s')) bottom = Math.max(top + minH, Math.min(container.h, top + maxH, bottom + dy))
  return {
    x: Math.round(left),
    y: Math.round(top),
    w: Math.round(right - left),
    h: Math.round(bottom - top),
  }
}

export function useBoxResize(options) {
  const isResizing = ref(false)
  let stopListeners = null

  const finishResize = () => {
    stopListeners?.()
    stopListeners = null
    if (!isResizing.value) return
    isResizing.value = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    options.onEnd?.()
  }

  const onResizeStart = (e, dir) => {
    if (e.button !== 0 || e.detail === 2) return
    e.preventDefault()
    e.stopPropagation()
    const start = { ...options.getBox() }
    const { clientX, clientY, pointerId } = e
    isResizing.value = true
    document.body.style.cursor = CURSOR_BY_DIR[dir]
    document.body.style.userSelect = 'none'

    const onMove = (ev) => {
      if (ev.pointerId !== pointerId) return
      const box = applyDir(start, dir, ev.clientX - clientX, ev.clientY - clientY, options, containerBox(options.container))
      options.setBox(box)
    }

    const onUp = (ev) => {
      if (ev.pointerId === pointerId) finishResize()
    }

    stopListeners?.()
    const listenerOptions = { capture: true }
    window.addEventListener('pointermove', onMove, listenerOptions)
    window.addEventListener('pointerup', onUp, listenerOptions)
    window.addEventListener('pointercancel', onUp, listenerOptions)
    stopListeners = () => {
      window.removeEventListener('pointermove', onMove, listenerOptions)
      window.removeEventListener('pointerup', onUp, listenerOptions)
      window.removeEventListener('pointercancel', onUp, listenerOptions)
    }
  }

  tryOnScopeDispose(finishResize)

  return { onResizeStart }
}

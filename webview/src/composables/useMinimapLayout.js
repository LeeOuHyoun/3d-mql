import { clamp } from 'lodash-es'
import { useBoxResize } from './useBoxResize.js'

const MINIMAP_DEFAULT = { w: 240, h: 180 }
const MINIMAP_MIN = { w: 160, h: 120 }
const MINIMAP_MAX = { w: 600, h: 600 }
const MINIMAP_GAP = 8
const DEFAULT_POSITION = 'bottom-right'
const GAP = `${MINIMAP_GAP}px`
const POSITION_STYLES = {
  'top-left': { top: GAP, left: GAP },
  top: { top: GAP, left: '50%', transform: 'translateX(-50%)' },
  'top-right': { top: GAP, right: GAP },
  left: { left: GAP, top: '50%', transform: 'translateY(-50%)' },
  right: { right: GAP, top: '50%', transform: 'translateY(-50%)' },
  'bottom-left': { bottom: GAP, left: GAP },
  bottom: { bottom: GAP, left: '50%', transform: 'translateX(-50%)' },
  'bottom-right': { bottom: GAP, right: GAP },
}

const fitSize = (size, pane) => Math.min(size, Math.max(0, pane - MINIMAP_GAP * 2))

export function useMinimapLayout(container) {
  const minimapRef = ref(null)
  const minimapHandle = ref(null)
  const hasDragged = ref(false)
  const minimapSize = useStorage('3d-mql-minimap-size', { ...MINIMAP_DEFAULT })
  const minimapPosition = useStorage('3d-mql-minimap-position', DEFAULT_POSITION)
  const { width: paneWidth, height: paneHeight } = useElementSize(container)

  const markDragged = () => {
    hasDragged.value = true
  }

  const { x, y } = useDraggable(minimapRef, {
    handle: minimapHandle,
    containerElement: container,
    initialValue: { x: 0, y: 0 },
    stopPropagation: true,
    onMove: markDragged,
  })

  const currentBox = () => {
    const containerRect = container.value.getBoundingClientRect()
    const rect = minimapRef.value.getBoundingClientRect()
    return { x: rect.left - containerRect.left, y: rect.top - containerRect.top, w: rect.width, h: rect.height }
  }

  const { onResizeStart: onMinimapResize } = useBoxResize({
    minW: MINIMAP_MIN.w,
    minH: MINIMAP_MIN.h,
    maxW: MINIMAP_MAX.w,
    maxH: MINIMAP_MAX.h,
    container,
    getBox: currentBox,
    setBox: ({ x: left, y: top, w, h }) => {
      x.value = left
      y.value = top
      minimapSize.value = { w, h }
      markDragged()
    },
  })

  const minimapStyle = computed(() => {
    const paneW = paneWidth.value || Infinity
    const paneH = paneHeight.value || Infinity
    const w = fitSize(minimapSize.value.w, paneW)
    const h = fitSize(minimapSize.value.h, paneH)
    return {
      width: `${w}px`,
      height: `${h}px`,
      ...(hasDragged.value
        ? { left: `${clamp(x.value, 0, paneW - w)}px`, top: `${clamp(y.value, 0, paneH - h)}px` }
        : (POSITION_STYLES[minimapPosition.value] ?? POSITION_STYLES[DEFAULT_POSITION])),
    }
  })

  const resetMinimapSize = () => {
    minimapSize.value = { ...MINIMAP_DEFAULT }
  }

  const setMinimapPosition = (position) => {
    minimapPosition.value = position
    hasDragged.value = false
  }

  const resetMinimap = () => {
    setMinimapPosition(DEFAULT_POSITION)
    resetMinimapSize()
  }

  return {
    minimapRef,
    minimapHandle,
    minimapStyle,
    minimapPosition,
    onMinimapResize,
    resetMinimapSize,
    setMinimapPosition,
    resetMinimap,
  }
}

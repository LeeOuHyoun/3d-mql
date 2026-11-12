<script setup>
import { throttle } from 'lodash-es'

const props = defineProps({
  cy: { type: Object, default: null },
  isDark: { type: Boolean, default: false },
})
const emit = defineEmits(['fit'])

const PADDING = 6
const WHEEL_ZOOM_FACTOR = 1.2
const REGION_MARGIN_RATIO = 0.25
const OUTLINE_PX = 1.5
const CONTENT_THROTTLE_MS = 100

const panelRef = ref(null)
const canvasRef = ref(null)
const { width: panelWidth, height: panelHeight } = useElementSize(panelRef)

const content = shallowRef(null)
const extent = shallowRef(null)
const frozenTransform = shallowRef(null)

const unionBox = (a, b) => {
  const box = { x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1), x2: Math.max(a.x2, b.x2), y2: Math.max(a.y2, b.y2) }
  return { ...box, w: box.x2 - box.x1, h: box.y2 - box.y1 }
}

const padBox = (box) => {
  const margin = Math.max(box.w, box.h) * REGION_MARGIN_RATIO
  return { x1: box.x1 - margin, y1: box.y1 - margin, x2: box.x2 + margin, y2: box.y2 + margin }
}

const transform = computed(() => {
  if (frozenTransform.value) return frozenTransform.value
  if (!content.value || !extent.value || !panelWidth.value) return null
  const box = unionBox(padBox(content.value), extent.value)
  const scale = Math.min((panelWidth.value - PADDING * 2) / box.w, (panelHeight.value - PADDING * 2) / box.h)
  return {
    scale,
    x0: (panelWidth.value - box.w * scale) / 2 - box.x1 * scale,
    y0: (panelHeight.value - box.h * scale) / 2 - box.y1 * scale,
  }
})

const viewStyle = computed(() => {
  if (!transform.value) return null
  const { scale, x0, y0 } = transform.value
  const { x1, y1, w, h } = extent.value
  return { left: `${x0 + x1 * scale}px`, top: `${y0 + y1 * scale}px`, width: `${w * scale}px`, height: `${h * scale}px` }
})

const nodesBox = (cy) => {
  const box = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity }
  cy.nodes().forEach((n) => {
    if (!n.visible()) return
    const { x, y } = n.position()
    const w = n.outerWidth() / 2
    const h = n.outerHeight() / 2
    box.x1 = Math.min(box.x1, x - w)
    box.y1 = Math.min(box.y1, y - h)
    box.x2 = Math.max(box.x2, x + w)
    box.y2 = Math.max(box.y2, y + h)
  })
  return box.x1 === Infinity ? null : { ...box, w: box.x2 - box.x1, h: box.y2 - box.y1 }
}

const rgba = ([r, g, b], opacity) => `rgba(${r},${g},${b},${opacity})`

const pathOf = (paths, key) => paths.get(key) ?? paths.set(key, new Path2D()).get(key)

const drawGraph = (ctx, cy, scale) => {
  const centers = new Map()
  const fills = new Map()
  const outlines = new Map()
  cy.nodes().forEach((n) => {
    if (!n.visible()) return
    const center = n.position()
    const w = n.outerWidth()
    const h = n.outerHeight()
    const opacity = n.effectiveOpacity()
    const box = [center.x - w / 2, center.y - h / 2, w, h, Math.min(w, h) * 0.2]
    centers.set(n.id(), center)
    pathOf(fills, rgba(n.pstyle('background-color').value, opacity)).roundRect(...box)
    if (n.selected() || n.data('isRoot')) pathOf(outlines, rgba(n.pstyle('border-color').value, opacity)).roundRect(...box)
  })
  const lines = new Map()
  cy.edges().forEach((e) => {
    const from = centers.get(e.data('source'))
    const to = centers.get(e.data('target'))
    if (!from || !to || !e.visible()) return
    const path = pathOf(lines, rgba(e.pstyle('line-color').value, e.effectiveOpacity()))
    path.moveTo(from.x, from.y)
    path.lineTo(to.x, to.y)
  })
  ctx.lineWidth = 1 / scale
  lines.forEach((path, color) => {
    ctx.strokeStyle = color
    ctx.stroke(path)
  })
  fills.forEach((path, color) => {
    ctx.fillStyle = color
    ctx.fill(path)
  })
  ctx.lineWidth = OUTLINE_PX / scale
  outlines.forEach((path, color) => {
    ctx.strokeStyle = color
    ctx.stroke(path)
  })
}

const draw = () => {
  const canvas = canvasRef.value
  if (!canvas || !panelWidth.value) return
  const ratio = window.devicePixelRatio || 1
  const width = Math.round(panelWidth.value * ratio)
  const height = Math.round(panelHeight.value * ratio)
  if (canvas.width !== width || canvas.height !== height) Object.assign(canvas, { width, height })
  const ctx = canvas.getContext('2d')
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, width, height)
  const t = transform.value
  if (!props.cy || !t) return
  ctx.setTransform(ratio * t.scale, 0, 0, ratio * t.scale, ratio * t.x0, ratio * t.y0)
  drawGraph(ctx, props.cy, t.scale)
}

let frame = 0
let isContentDirty = true
let isPaintDirty = true
let painted = null

const isSameTransform = (a, b) => !!a && !!b && a.scale === b.scale && a.x0 === b.x0 && a.y0 === b.y0

const flushDraw = () => {
  frame = 0
  if (isContentDirty && props.cy) {
    isContentDirty = false
    isPaintDirty = true
    content.value = nodesBox(props.cy)
  }
  if (!isPaintDirty && isSameTransform(transform.value, painted)) return
  isPaintDirty = false
  painted = transform.value
  draw()
}

const scheduleDraw = () => {
  if (!frame) frame = requestAnimationFrame(flushDraw)
}

const repaint = () => {
  isPaintDirty = true
  scheduleDraw()
}

const markContent = throttle(() => {
  isContentDirty = true
  scheduleDraw()
}, CONTENT_THROTTLE_MS)

const updateExtent = () => {
  extent.value = props.cy?.extent() ?? null
  scheduleDraw()
}

const contentEvents = 'add remove position data class select unselect'

watch(
  () => props.cy,
  (cy, _, onCleanup) => {
    if (!cy) return
    cy.on('viewport resize', updateExtent)
    cy.on(contentEvents, markContent)
    updateExtent()
    markContent()
    onCleanup(() => {
      cy.off('viewport resize', updateExtent)
      cy.off(contentEvents, markContent)
    })
  },
  { immediate: true },
)

watch(() => props.isDark, () => nextTick(markContent))
watch([panelWidth, panelHeight], repaint)
watch(frozenTransform, scheduleDraw)

tryOnScopeDispose(() => {
  markContent.cancel()
  cancelAnimationFrame(frame)
})

const isOverView = ref(false)
let grabOffset = null

const toModel = (e) => {
  const { scale, x0, y0 } = transform.value
  return { x: (e.offsetX - x0) / scale, y: (e.offsetY - y0) / scale }
}

const isInsideView = ({ x, y }) => {
  const view = extent.value
  return x >= view.x1 && x <= view.x2 && y >= view.y1 && y <= view.y2
}

const centerOn = ({ x, y }) => {
  const cy = props.cy
  const zoom = cy.zoom()
  cy.pan({ x: cy.width() / 2 - x * zoom, y: cy.height() / 2 - y * zoom })
}

const handlePointerDown = (e) => {
  if (!props.cy || !transform.value || e.button !== 0) return
  e.currentTarget.setPointerCapture(e.pointerId)
  frozenTransform.value = transform.value
  const point = toModel(e)
  const view = extent.value
  grabOffset = isInsideView(point)
    ? { x: point.x - (view.x1 + view.x2) / 2, y: point.y - (view.y1 + view.y2) / 2 }
    : { x: 0, y: 0 }
  centerOn({ x: point.x - grabOffset.x, y: point.y - grabOffset.y })
}

const handlePointerMove = (e) => {
  if (!transform.value) return
  const point = toModel(e)
  if (!grabOffset) {
    isOverView.value = isInsideView(point)
    return
  }
  centerOn({ x: point.x - grabOffset.x, y: point.y - grabOffset.y })
}

const handlePointerUp = () => {
  grabOffset = null
  frozenTransform.value = null
}

const handleWheel = (e) => {
  const cy = props.cy
  if (!cy) return
  const factor = e.deltaY > 0 ? 1 / WHEEL_ZOOM_FACTOR : WHEEL_ZOOM_FACTOR
  cy.zoom({ level: cy.zoom() * factor, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } })
}
</script>

<template>
  <div
    ref="panelRef"
    class="relative w-full h-full overflow-hidden select-none"
    :class="isOverView ? 'cursor-move' : 'cursor-pointer'"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerUp"
    @pointercancel="handlePointerUp"
    @wheel.prevent="handleWheel"
    @dblclick="emit('fit')"
  >
    <canvas ref="canvasRef" class="absolute inset-0 w-full h-full pointer-events-none"></canvas>
    <div
      v-if="viewStyle"
      :style="viewStyle"
      class="absolute rounded-sm pointer-events-none border-[1.5px] border-[#4f46e5]/60 bg-[#4f46e5]/12"
    ></div>
  </div>
</template>

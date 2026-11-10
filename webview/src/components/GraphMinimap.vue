<script setup>
import { throttle } from 'lodash-es'

const props = defineProps({
  cy: { type: Object, default: null },
  isDark: { type: Boolean, default: false },
})
const emit = defineEmits(['fit'])

const PADDING = 6
const WHEEL_ZOOM_FACTOR = 1.2
const THUMBNAIL_THROTTLE_MS = 100

const panelRef = ref(null)
const { width: panelWidth, height: panelHeight } = useElementSize(panelRef)

const thumbnail = shallowRef(null)
const extent = shallowRef(null)
const frozenTransform = shallowRef(null)

const unionBox = (a, b) => {
  const box = { x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1), x2: Math.max(a.x2, b.x2), y2: Math.max(a.y2, b.y2) }
  return { ...box, w: box.x2 - box.x1, h: box.y2 - box.y1 }
}

const transform = computed(() => {
  if (frozenTransform.value) return frozenTransform.value
  if (!thumbnail.value || !extent.value || !panelWidth.value) return null
  const box = unionBox(thumbnail.value.box, extent.value)
  const scale = Math.min((panelWidth.value - PADDING * 2) / box.w, (panelHeight.value - PADDING * 2) / box.h)
  return {
    scale,
    x0: (panelWidth.value - box.w * scale) / 2 - box.x1 * scale,
    y0: (panelHeight.value - box.h * scale) / 2 - box.y1 * scale,
  }
})

const toPanelStyle = (box) => {
  const { scale, x0, y0 } = transform.value
  return {
    left: `${x0 + box.x1 * scale}px`,
    top: `${y0 + box.y1 * scale}px`,
    width: `${box.w * scale}px`,
    height: `${box.h * scale}px`,
  }
}

const thumbnailStyle = computed(() => transform.value && toPanelStyle(thumbnail.value.box))
const viewStyle = computed(() => transform.value && toPanelStyle(extent.value))

const renderThumbnail = throttle(() => {
  const cy = props.cy
  if (!cy || !panelWidth.value) return
  const bb = cy.elements().boundingBox()
  if (!cy.elements().length || !bb.w || !bb.h) {
    thumbnail.value = null
    return
  }
  const box = { ...bb, w: Math.ceil(bb.w), h: Math.ceil(bb.h) }
  const scale = Math.min(panelWidth.value / box.w, panelHeight.value / box.h)
  thumbnail.value = { box, src: cy.png({ full: true, scale }) }
}, THUMBNAIL_THROTTLE_MS)

const updateExtent = () => {
  extent.value = props.cy?.extent() ?? null
}

const contentEvents = 'add remove position data class style select unselect'

watch(
  () => props.cy,
  (cy, _, onCleanup) => {
    if (!cy) return
    cy.on('viewport resize', updateExtent)
    cy.on(contentEvents, renderThumbnail)
    updateExtent()
    renderThumbnail()
    onCleanup(() => {
      cy.off('viewport resize', updateExtent)
      cy.off(contentEvents, renderThumbnail)
    })
  },
  { immediate: true },
)

watch([() => props.isDark, panelWidth, panelHeight], () => nextTick(renderThumbnail))
tryOnScopeDispose(() => renderThumbnail.cancel())

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
    <img
      v-if="thumbnailStyle"
      :src="thumbnail.src"
      :style="thumbnailStyle"
      alt=""
      draggable="false"
      class="absolute max-w-none pointer-events-none"
    />
    <div
      v-if="viewStyle"
      :style="viewStyle"
      class="absolute rounded-sm pointer-events-none border-[1.5px] border-[#4f46e5]/60 bg-[#4f46e5]/12"
    ></div>
  </div>
</template>

const PADDING = 8
const WHEEL_ZOOM_FACTOR = 1.2

export function useMinimap(cyRef, isDark, onFit) {
  const minimapCanvas = ref(null)
  let frame = 0
  let transform = null
  let grabOffset = null

  const drawEdges = (ctx, cy, { scale, x0, y0 }) => {
    ctx.lineWidth = 1
    cy.edges(':visible').forEach((edge) => {
      const source = edge.source().position()
      const target = edge.target().position()
      ctx.globalAlpha = edge.pstyle('opacity').value
      ctx.strokeStyle = edge.pstyle('line-color').strValue
      ctx.beginPath()
      ctx.moveTo(x0 + source.x * scale, y0 + source.y * scale)
      ctx.lineTo(x0 + target.x * scale, y0 + target.y * scale)
      ctx.stroke()
    })
  }

  const drawNodes = (ctx, nodes, { scale, x0, y0 }) => {
    nodes.forEach((node) => {
      const { x, y } = node.position()
      const w = Math.max(3, node.outerWidth() * scale)
      const h = Math.max(3, node.outerHeight() * scale)
      ctx.globalAlpha = node.pstyle('opacity').value
      ctx.fillStyle = node.pstyle('background-color').strValue
      ctx.strokeStyle = node.pstyle('border-color').strValue
      ctx.beginPath()
      ctx.roundRect(x0 + x * scale - w / 2, y0 + y * scale - h / 2, w, h, Math.min(w, h) * 0.25)
      ctx.fill()
      ctx.stroke()
    })
  }

  const draw = () => {
    frame = 0
    const cy = cyRef.value
    const canvas = minimapCanvas.value
    if (!cy || !canvas) return
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    const ratio = window.devicePixelRatio || 1
    if (canvas.width !== Math.round(width * ratio)) canvas.width = Math.round(width * ratio)
    if (canvas.height !== Math.round(height * ratio)) canvas.height = Math.round(height * ratio)
    const ctx = canvas.getContext('2d')
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.clearRect(0, 0, width, height)
    const nodes = cy.nodes(':visible')
    if (!nodes.length) return
    const box = nodes.boundingBox({ includeLabels: false })
    const scale = Math.min((width - PADDING * 2) / (box.w || 1), (height - PADDING * 2) / (box.h || 1))
    transform = { scale, x0: (width - box.w * scale) / 2 - box.x1 * scale, y0: (height - box.h * scale) / 2 - box.y1 * scale }
    drawEdges(ctx, cy, transform)
    drawNodes(ctx, nodes, transform)
    ctx.globalAlpha = 1
    const extent = cy.extent()
    const view = [transform.x0 + extent.x1 * scale, transform.y0 + extent.y1 * scale, extent.w * scale, extent.h * scale]
    ctx.fillStyle = 'rgba(79, 70, 229, 0.12)'
    ctx.strokeStyle = 'rgba(79, 70, 229, 0.6)'
    ctx.lineWidth = 1.5
    ctx.fillRect(...view)
    ctx.strokeRect(...view)
  }

  const scheduleMinimap = () => {
    if (!frame) frame = requestAnimationFrame(draw)
  }

  const toModel = (e) => {
    const rect = minimapCanvas.value.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left - transform.x0) / transform.scale,
      y: (e.clientY - rect.top - transform.y0) / transform.scale,
    }
  }

  const isInsideView = (cy, { x, y }) => {
    const extent = cy.extent()
    return x >= extent.x1 && x <= extent.x2 && y >= extent.y1 && y <= extent.y2
  }

  const centerOn = (cy, { x, y }) => {
    const zoom = cy.zoom()
    cy.pan({ x: cy.width() / 2 - x * zoom, y: cy.height() / 2 - y * zoom })
  }

  const handlePointerDown = (e) => {
    const cy = cyRef.value
    if (!cy || !transform || e.button !== 0) return
    e.preventDefault()
    e.target.setPointerCapture(e.pointerId)
    const point = toModel(e)
    const extent = cy.extent()
    grabOffset = isInsideView(cy, point)
      ? { x: point.x - (extent.x1 + extent.x2) / 2, y: point.y - (extent.y1 + extent.y2) / 2 }
      : { x: 0, y: 0 }
    centerOn(cy, { x: point.x - grabOffset.x, y: point.y - grabOffset.y })
  }

  const handlePointerMove = (e) => {
    const cy = cyRef.value
    if (!cy || !transform) return
    const point = toModel(e)
    if (!grabOffset) {
      minimapCanvas.value.style.cursor = isInsideView(cy, point) ? 'move' : 'pointer'
      return
    }
    centerOn(cy, { x: point.x - grabOffset.x, y: point.y - grabOffset.y })
  }

  const handlePointerUp = () => {
    grabOffset = null
  }

  const handleWheel = (e) => {
    const cy = cyRef.value
    if (!cy) return
    e.preventDefault()
    const factor = e.deltaY > 0 ? 1 / WHEEL_ZOOM_FACTOR : WHEEL_ZOOM_FACTOR
    cy.zoom({ level: cy.zoom() * factor, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } })
  }

  useEventListener(minimapCanvas, 'pointerdown', handlePointerDown)
  useEventListener(minimapCanvas, 'pointermove', handlePointerMove)
  useEventListener(minimapCanvas, ['pointerup', 'pointercancel'], handlePointerUp)
  useEventListener(minimapCanvas, 'wheel', handleWheel, { passive: false })
  useEventListener(minimapCanvas, 'dblclick', () => onFit())
  watch([minimapCanvas, isDark], scheduleMinimap)
  tryOnScopeDispose(() => cancelAnimationFrame(frame))

  return { minimapCanvas, scheduleMinimap }
}

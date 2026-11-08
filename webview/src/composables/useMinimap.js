const PADDING = 8

export function useMinimap(cyRef, isDark) {
  const minimapCanvas = ref(null)
  let frame = 0
  let transform = null

  const nodeColor = (node) => {
    if (node.selected()) return '#ff7a00'
    if (node.data('isRoot')) return '#e06c75'
    if (node.data('isCluster')) return isDark.value ? '#e5c07b' : '#f59e0b'
    return node.data('color') || '#61afef'
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
    const x0 = (width - box.w * scale) / 2 - box.x1 * scale
    const y0 = (height - box.h * scale) / 2 - box.y1 * scale
    transform = { scale, x0, y0 }
    ctx.strokeStyle = isDark.value ? '#4b5563' : '#cbd5e1'
    ctx.lineWidth = 1
    ctx.beginPath()
    cy.edges(':visible').forEach((edge) => {
      const source = edge.source().position()
      const target = edge.target().position()
      ctx.moveTo(x0 + source.x * scale, y0 + source.y * scale)
      ctx.lineTo(x0 + target.x * scale, y0 + target.y * scale)
    })
    ctx.stroke()
    nodes.forEach((node) => {
      const { x, y } = node.position()
      const w = Math.max(2, node.outerWidth() * scale)
      const h = Math.max(2, node.outerHeight() * scale)
      ctx.fillStyle = nodeColor(node)
      ctx.fillRect(x0 + x * scale - w / 2, y0 + y * scale - h / 2, w, h)
    })
    const extent = cy.extent()
    const view = [x0 + extent.x1 * scale, y0 + extent.y1 * scale, extent.w * scale, extent.h * scale]
    ctx.fillStyle = 'rgba(79, 70, 229, 0.12)'
    ctx.strokeStyle = 'rgba(79, 70, 229, 0.6)'
    ctx.lineWidth = 1.5
    ctx.fillRect(...view)
    ctx.strokeRect(...view)
  }

  const scheduleMinimap = () => {
    if (!frame) frame = requestAnimationFrame(draw)
  }

  const panTo = (e) => {
    const cy = cyRef.value
    if (!cy || !transform) return
    const rect = minimapCanvas.value.getBoundingClientRect()
    const x = (e.clientX - rect.left - transform.x0) / transform.scale
    const y = (e.clientY - rect.top - transform.y0) / transform.scale
    const zoom = cy.zoom()
    cy.pan({ x: cy.width() / 2 - x * zoom, y: cy.height() / 2 - y * zoom })
  }

  const handlePointerDown = (e) => {
    e.preventDefault()
    e.target.setPointerCapture(e.pointerId)
    panTo(e)
  }

  const handlePointerMove = (e) => {
    if (e.buttons === 1) panTo(e)
  }

  useEventListener(minimapCanvas, 'pointerdown', handlePointerDown)
  useEventListener(minimapCanvas, 'pointermove', handlePointerMove)
  watch([minimapCanvas, isDark], scheduleMinimap)
  tryOnScopeDispose(() => cancelAnimationFrame(frame))

  return { minimapCanvas, scheduleMinimap }
}

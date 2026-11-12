import cytoscape from 'cytoscape'
import fcose from 'cytoscape-fcose'
import dagre from 'cytoscape-dagre'
import { debounce, isEqual, partition, uniqBy } from 'lodash-es'
import { getCytoscapeStyle } from '@/graph/graphStyles.js'
import { getLayoutOptions, LARGE_GRAPH_NODES } from '@/graph/graphLayouts.js'
import { placeAdded } from '@/graph/graphPlacement.js'
import { processRadialElems, toDisplayLabel } from '@/graph/graphDataProcessor.js'
import { useGraphEvents } from './useGraphEvents.js'

cytoscape.use(fcose)
cytoscape.use(dagre)
cytoscape.warnings(false)

const CLUSTER_THRESHOLD = 10
const FIT_MAX_ZOOM = 1
const FIT_PADDING = 50
const MIN_ZOOM = 0.02
const MAX_ZOOM = 4
const READABLE_ZOOM = 0.75
const ANIMATION_MS = 400
const ANIMATION_EASING = 'ease-out-cubic'
const ANIMATE_MAX_NODES = 300
const DOCK_ANIMATION_MS = 200
const PENDING_OFFSET_Y = 110
const PENDING_SPREAD = 160
const WHEEL_ZOOM_PER_PIXEL = 0.0014
const WHEEL_NOTCH_MIN = 40
const WHEEL_ACCEL_MS = 200
const WHEEL_ACCEL_STEP = 0.5
const WHEEL_ACCEL_MAX = 4

export function useGraphCytoscape(isDark, lastExpansionMode) {
  const cyRef = shallowRef(null)
  const cyContainer = ref(null)
  const expandedClusters = reactive(new Set())
  const pinnedNodes = reactive(new Set())
  const layoutType = useStorage('3d-mql-layout', 'radial')
  const lastExpandedNodeId = ref(null)
  const hasElements = ref(false)
  let activeLayout = null
  let settling = null
  let wheelHandler = null
  let wheelStreak = { at: 0, sign: 0, boost: 1 }
  const { tooltip, contextMenu, bindGraphEvents, hideTooltip, hideContextMenu } = useGraphEvents()

  const stopLayout = () => {
    const cy = cyRef.value
    const pending = settling
    settling = null
    activeLayout?.stop()
    activeLayout = null
    cy?.stop(true)
    cy?.nodes().stop(true)
    if (!cy || !pending) return
    cy.batch(() => cy.nodes().forEach((n) => pending.target[n.id()] && n.position(pending.target[n.id()])))
    if (pending.viewport) cy.viewport(pending.viewport)
  }

  const getPositions = () => {
    const positions = {}
    cyRef.value.nodes().forEach((n) => {
      positions[n.id()] = { ...n.position() }
    })
    return positions
  }

  const computePositions = () => {
    const options = {
      ...getLayoutOptions(layoutType.value, cyRef.value.nodes().length),
      randomize: true,
      animate: false,
      fit: false,
    }
    try {
      cyRef.value.layout(options).run()
    } catch {
      cyRef.value.layout({ ...options, name: 'cose' }).run()
    }
    return getPositions()
  }

  const boxOf = (nodes, positions) => {
    const box = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity }
    nodes.forEach((n) => {
      const { x, y } = positions[n.id()] || n.position()
      const w = n.outerWidth() / 2
      const h = n.outerHeight() / 2
      box.x1 = Math.min(box.x1, x - w)
      box.y1 = Math.min(box.y1, y - h)
      box.x2 = Math.max(box.x2, x + w)
      box.y2 = Math.max(box.y2, y + h)
    })
    return box
  }

  const fitViewport = (nodes, positions, maxZoom = FIT_MAX_ZOOM) => {
    const cy = cyRef.value
    if (!nodes.length) return null
    const box = boxOf(nodes, positions)
    const width = cy.width()
    const height = cy.height()
    const fitZoom = Math.min((width - FIT_PADDING * 2) / (box.x2 - box.x1), (height - FIT_PADDING * 2) / (box.y2 - box.y1))
    const zoom = Math.max(cy.minZoom(), Math.min(maxZoom, fitZoom))
    return {
      zoom,
      pan: { x: width / 2 - (zoom * (box.x1 + box.x2)) / 2, y: height / 2 - (zoom * (box.y1 + box.y2)) / 2 },
    }
  }

  const viewCenter = () => {
    const { x1, y1, x2, y2 } = cyRef.value.extent()
    return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 }
  }

  const junctionEnds = (n) => n.connectedEdges('[?isSplit]').connectedNodes().not(n).map((end) => end.id())

  const placePositions = (addedIds, anchorId) => {
    const cy = cyRef.value
    return placeAdded({
      boxes: cy.nodes().map((n) => ({
        id: n.id(),
        ...n.position(),
        w: n.outerWidth(),
        h: n.outerHeight(),
        ends: n.data('isJunction') ? junctionEnds(n) : null,
      })),
      addedIds,
      neighborsOf: (id) => cy.getElementById(id).neighborhood('node').map((n) => n.id()),
      anchorId,
      fallback: viewCenter(),
    })
  }

  const revealViewport = (anchorId, added, positions) => {
    const cy = cyRef.value
    const zoom = cy.zoom()
    const width = cy.width()
    const height = cy.height()
    const visible = cy.nodes(':visible')
    const focus = visible.filter((n) => n.id() === anchorId || added.has(n.id()))
    if (!focus.length) return null
    const toScreen = (box, pan) => ({
      x1: box.x1 * zoom + pan.x,
      y1: box.y1 * zoom + pan.y,
      x2: box.x2 * zoom + pan.x,
      y2: box.y2 * zoom + pan.y,
    })
    const seen = toScreen(boxOf(visible.filter((n) => !added.has(n.id())), {}), cy.pan())
    const isOverview = seen.x1 >= 0 && seen.y1 >= 0 && seen.x2 <= width && seen.y2 <= height
    const held = focus.getElementById(anchorId ?? '').renderedPosition()
    const pan = held
      ? { x: held.x - zoom * positions[anchorId].x, y: held.y - zoom * positions[anchorId].y }
      : cy.pan()
    const slide = (low, high, size) => Math.max(FIT_PADDING - low, 0) || Math.min(size - FIT_PADDING - high, 0)
    const frame = (group) => {
      const next = toScreen(boxOf(group, positions), pan)
      return next.x2 - next.x1 > width - FIT_PADDING * 2 || next.y2 - next.y1 > height - FIT_PADDING * 2
        ? fitViewport(group, positions, zoom)
        : { zoom, pan: { x: pan.x + slide(next.x1, next.x2, width), y: pan.y + slide(next.y1, next.y2, height) } }
    }
    const overview = isOverview && frame(visible)
    return overview && (zoom < READABLE_ZOOM || overview.zoom >= READABLE_ZOOM) ? overview : frame(focus)
  }

  const settle = (pending) => {
    if (settling === pending) settling = null
  }

  const runLayout = (
    { animate = true, fit = false, anchorId = null, originId = null, reveal = true } = {},
    { before = {}, addedIds = [] } = {},
  ) => {
    const cy = cyRef.value
    if (!cy?.nodes().length) return
    stopLayout()
    hideTooltip()
    const nodes = cy.nodes()
    const added = new Set(addedIds)
    const isAdded = (n) => added.has(n.id())
    const isDeep = (n) => isAdded(n) && n.neighborhood('node').every(isAdded)
    const isFresh = nodes.every(isAdded)
    const isFull = fit || isFresh || (added.size > nodes.length / 2 && nodes.some(isDeep))
    const isPlacing = !isFull && layoutType.value === 'radial'
    if (isPlacing && !added.size) return
    const current = getPositions()
    const target = isPlacing ? placePositions(addedIds, anchorId) : computePositions()
    const origin = isFresh ? target[cy.nodes('[?isRoot]').id()] : (before[originId] ?? before[anchorId])
    const startOf = (n) => {
      if (!isAdded(n)) return current[n.id()]
      const neighbor = n.neighborhood('node').filter((other) => !isAdded(other))
      return origin ?? current[neighbor.id()] ?? target[n.id()]
    }
    const start = Object.fromEntries(nodes.map((n) => [n.id(), startOf(n)]))
    cy.batch(() => nodes.forEach((n) => n.position(start[n.id()])))
    const viewport = isFull
      ? fitViewport(cy.nodes(':visible'), target)
      : reveal
        ? revealViewport(anchorId, added, target)
        : null
    if (!animate || nodes.length > ANIMATE_MAX_NODES) {
      cy.batch(() => nodes.forEach((n) => n.position(target[n.id()])))
      if (viewport) cy.viewport(viewport)
      return
    }
    if (isFresh && viewport) cy.viewport(viewport)
    const pending = { target, viewport }
    settling = pending
    activeLayout = cy.layout({
      name: 'preset',
      positions: (n) => target[n.id()],
      animate: true,
      animationDuration: ANIMATION_MS,
      animationEasing: ANIMATION_EASING,
      fit: false,
      ...(!isFresh && viewport),
      stop: () => settle(pending),
    })
    activeLayout.run()
  }

  const updateElements = (elems) => {
    const cy = cyRef.value
    const next = uniqBy(elems, 'data.id')
    const nextIds = new Set(next.map((e) => e.data.id))
    const removed = cy.elements().filter((el) => !nextIds.has(el.id()))
    const [kept, added] = partition(next, (el) => cy.getElementById(el.data.id).length)
    const [nodes, edges] = partition(added, { group: 'nodes' })
    cy.batch(() => {
      removed.remove()
      kept.forEach((el) => {
        const existing = cy.getElementById(el.data.id)
        if (Object.keys(el.data).some((key) => !isEqual(existing.data(key), el.data[key]))) existing.data(el.data)
      })
      if (nodes.length) cy.add(nodes)
      if (edges.length) cy.add(edges)
      cy.elements('[?isExploring]').data('isExploring', false)
    })
    return { addedIds: nodes.map((el) => el.data.id), isChanged: removed.length + added.length > 0 }
  }

  const pendingPosition = (id, overlay, positions) => {
    if (positions[id]) return positions[id]
    const anchorId = overlay.edges
      .map((edge) => (edge.source === id ? edge.target : edge.target === id ? edge.source : null))
      .find((other) => other && positions[other])
    const seed = anchorId ? { x: positions[anchorId].x, y: positions[anchorId].y + PENDING_OFFSET_Y } : viewCenter()
    return { x: seed.x + (Math.random() - 0.5) * PENDING_SPREAD, y: seed.y }
  }

  const syncGraph = (rawNodes, rawEdges, rootId, layout = null, overlay = { nodes: [], edges: [], pending: {} }) => {
    if (!cyRef.value) return
    stopLayout()
    clearPath()
    const positions = getPositions()
    const seedPos = (lastExpandedNodeId.value && positions[lastExpandedNodeId.value]) || { x: 0, y: 0 }
    const elems = processRadialElems(rawNodes, rawEdges, rootId, positions, seedPos, {
      expandedClusters,
      pinnedNodes,
      CLUSTER_THRESHOLD,
      lastExpandedNodeId: lastExpandedNodeId.value,
      lastExpansionMode: lastExpansionMode.value,
    })
    const pendingData = { inert: true, isPending: true }
    overlay.nodes.forEach((node) =>
      elems.push({
        group: 'nodes',
        data: { ...node, ...pendingData, originalId: node.id, displayLabel: toDisplayLabel(node.label) },
        position: { ...pendingPosition(node.id, overlay, positions) },
      }),
    )
    const ids = new Set(elems.map((el) => el.data.id))
    overlay.edges
      .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
      .forEach((edge) =>
        elems.push({ group: 'edges', data: { ...edge, ...pendingData, originalId: edge.id, displayName: edge.label } }),
      )
    elems.forEach((el) => {
      el.data.pending = overlay.pending[el.data.originalId] || ''
    })
    const { addedIds, isChanged } = updateElements(elems)
    const renderer = cyRef.value.renderer()
    renderer.hideEdgesOnViewport = renderer.textureOnViewport = cyRef.value.nodes().length > LARGE_GRAPH_NODES
    applyFilter()
    hasElements.value = cyRef.value.elements().length > 0
    if (layout && isChanged) Promise.resolve().then(() => runLayout(layout, { before: positions, addedIds }))
    return isChanged
  }

  const graphFilter = ref('')

  const applyFilter = () => {
    if (!cyRef.value) return
    const query = graphFilter.value.toLowerCase().trim()
    cyRef.value.batch(() => {
      cyRef.value
        .elements('.search-match, .search-neighbor, .search-dimmed')
        .removeClass('search-match search-neighbor search-dimmed')
      if (!query) return
      const matchedNodes = cyRef.value
        .nodes()
        .filter((n) => (n.data('label') || '').toLowerCase().includes(query) || n.id().toLowerCase().includes(query))
      const matchedEdges = cyRef.value.edges().filter((e) => (e.data('label') || '').toLowerCase().includes(query))
      const core = matchedNodes
        .union(matchedNodes.connectedEdges())
        .union(matchedEdges)
        .union(matchedEdges.connectedNodes())
      const neighbors = matchedNodes.neighborhood().union(matchedEdges.connectedNodes().neighborhood())
      cyRef.value.elements().addClass('search-dimmed')
      core.removeClass('search-dimmed').addClass('search-match')
      neighbors.not(core).removeClass('search-dimmed').addClass('search-neighbor')
    })
  }

  watch(graphFilter, applyFilter)

  const initCytoscape = (handlers) => {
    if (!cyContainer.value) return
    wheelHandler = (e) => {
      if (!cyRef.value || !(e.ctrlKey || e.altKey)) return
      e.preventDefault()
      e.stopImmediatePropagation()
      const sign = Math.sign(e.deltaY)
      const isNotch = Math.abs(e.deltaY) >= WHEEL_NOTCH_MIN
      const isStreak = isNotch && sign === wheelStreak.sign && e.timeStamp - wheelStreak.at < WHEEL_ACCEL_MS
      const boost = isStreak ? Math.min(wheelStreak.boost + WHEEL_ACCEL_STEP, WHEEL_ACCEL_MAX) : 1
      wheelStreak = { at: e.timeStamp, sign, boost }
      cyRef.value.zoom({
        level: cyRef.value.zoom() * 10 ** (-e.deltaY * WHEEL_ZOOM_PER_PIXEL * boost),
        renderedPosition: { x: e.offsetX, y: e.offsetY },
      })
    }
    cyContainer.value.addEventListener('wheel', wheelHandler, { passive: false, capture: true })
    cyRef.value = cytoscape({
      container: cyContainer.value,
      style: getCytoscapeStyle(isDark.value, layoutType.value),
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
    })
    cyRef.value.on('tap', (evt) => evt.target === cyRef.value && clearPath())
    bindGraphEvents(cyRef.value, cyContainer, handlers)
  }

  const resetView = () => runLayout({ fit: true })

  watch(layoutType, resetView)

  const animateViewport = (viewport) => {
    if (viewport) cyRef.value.animate({ ...viewport, duration: 300, easing: ANIMATION_EASING })
  }

  const fitView = () => {
    if (cyRef.value) animateViewport(fitViewport(cyRef.value.nodes(':visible'), getPositions()))
  }

  const focusElement = (id) => {
    const cy = cyRef.value
    const el = cy?.getElementById(id)
    if (!el?.length || !el.visible()) return false
    cy.$(':selected').unselect()
    el.select()
    const nodes = el.isNode() ? el : el.connectedNodes()
    animateViewport(fitViewport(nodes, getPositions(), Math.max(cy.zoom(), FIT_MAX_ZOOM)))
    return true
  }

  const clearPath = () =>
    cyRef.value?.elements('.path-match, .path-dimmed').removeClass('path-match path-dimmed')

  const shortestPath = (sourceId, targetId) => {
    const cy = cyRef.value
    if (!cy) return null
    const { found, path } = cy.elements(':visible').aStar({
      root: cy.getElementById(sourceId),
      goal: cy.getElementById(targetId),
    })
    return found ? path : null
  }

  const markElements = (elements) => {
    cyRef.value.batch(() => {
      cyRef.value.elements().addClass('path-dimmed')
      elements.removeClass('path-dimmed').addClass('path-match')
    })
    animateViewport(fitViewport(elements.nodes().union(elements.edges().connectedNodes()), getPositions()))
  }

  const findPath = (sourceId, targetId) => {
    clearPath()
    const path = shortestPath(sourceId, targetId)
    if (path) markElements(path)
    return !!path
  }

  const pathExpression = (sourceId, targetId) => {
    const path = shortestPath(sourceId, targetId)
    const isUnreal = (el) => el.data('isJunction') || el.data('isSplit') || el.data('inert') || el.data('virtual')
    if (!path || path.some(isUnreal)) return ''
    let at = sourceId
    return path
      .edges()
      .map((edge) => {
        const isForward = edge.data('source') === at
        at = isForward ? edge.data('target') : edge.data('source')
        return isForward ? `from[${edge.data('label')}].to` : `to[${edge.data('label')}].from`
      })
      .join('.')
  }

  const elementsOf = (ids) => {
    const wanted = new Set(ids)
    return cyRef.value.elements().filter((el) => wanted.has(el.data('originalId')))
  }

  const highlightIds = (ids) => {
    const wanted = new Set(ids)
    const isMember = (el) => el.data('childNodeIds')?.some((id) => wanted.has(id))
    const matched = cyRef.value.elements().filter((el) => wanted.has(el.data('originalId')) || isMember(el))
    clearPath()
    if (matched.length) markElements(matched)
  }

  const captureGhosts = (ids) => {
    const removed = elementsOf(ids)
    const ghostId = (id) => (removed.getElementById(id).length ? `ghost-${id}` : id)
    return removed.map((el) => ({
      group: el.group(),
      data: {
        ...el.data(),
        id: ghostId(el.id()),
        inert: true,
        ...(el.isEdge() && { source: ghostId(el.data('source')), target: ghostId(el.data('target')) }),
      },
      ...(el.isNode() && { position: { ...el.position() } }),
      classes: 'diff-removed',
      selectable: false,
    }))
  }

  const markDiff = ({ added, changed }, ghosts) => {
    const cy = cyRef.value
    const [nodes, edges] = partition(ghosts, { group: 'nodes' })
    cy.batch(() => {
      cy.add(nodes)
      cy.add(edges.filter((el) => cy.getElementById(el.data.source).length && cy.getElementById(el.data.target).length))
      elementsOf(added).addClass('diff-added')
      elementsOf(changed).addClass('diff-changed')
    })
  }

  const clearMarks = () => {
    const cy = cyRef.value
    if (!cy) return
    cy.batch(() => {
      cy.elements('.diff-removed').remove()
      cy.elements().removeClass('diff-added diff-changed')
    })
  }

  const destroyCy = () => {
    hideTooltip()
    hideContextMenu()
    stopLayout()
    if (cyContainer.value && wheelHandler) {
      cyContainer.value.removeEventListener('wheel', wheelHandler, { capture: true })
      wheelHandler = null
    }
    cyRef.value?.destroy()
    cyRef.value = null
  }

  let dockAnimatingUntil = 0

  const resizeGraph = () => {
    const cy = cyRef.value
    if (!cy || (performance.now() < dockAnimatingUntil && cy.nodes().length > ANIMATE_MAX_NODES)) return
    cy.resize()
  }

  const resizeAfterDock = debounce(resizeGraph, DOCK_ANIMATION_MS)

  const handleTransitionRun = (e) => {
    if (!e.propertyName.startsWith('margin')) return
    dockAnimatingUntil = performance.now() + DOCK_ANIMATION_MS
    resizeAfterDock()
  }

  useEventListener(document, 'transitionrun', handleTransitionRun)
  useResizeObserver(cyContainer, resizeGraph)
  watch([isDark, layoutType], () => cyRef.value?.style(getCytoscapeStyle(isDark.value, layoutType.value)))

  const toggleCluster = (clusterKey) =>
    expandedClusters.has(clusterKey) ? expandedClusters.delete(clusterKey) : expandedClusters.add(clusterKey)

  const resetClusters = () => {
    expandedClusters.clear()
    pinnedNodes.clear()
  }

  const pinNode = (id) => pinnedNodes.add(id)

  const collapseExpandedFromNode = (node) => {
    const keys = node
      .outgoers('edge')
      .map((e) => `${node.id()}::${e.data('label')}`)
      .filter((key) => expandedClusters.has(key))
    keys.forEach((key) => expandedClusters.delete(key))
    return keys.length > 0
  }

  return {
    cyRef,
    cyContainer,
    graphFilter,
    hasElements,
    expandedClusters,
    pinnedNodes,
    lastExpandedNodeId,
    tooltip,
    contextMenu,
    syncGraph,
    initCytoscape,
    resetView,
    fitView,
    focusElement,
    findPath,
    pathExpression,
    highlightIds,
    captureGhosts,
    markDiff,
    clearMarks,
    layoutType,
    destroyCy,
    toggleCluster,
    resetClusters,
    pinNode,
    collapseExpandedFromNode,
    hideTooltip,
    hideContextMenu,
  }
}

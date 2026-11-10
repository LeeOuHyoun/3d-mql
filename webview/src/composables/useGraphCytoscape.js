import cytoscape from 'cytoscape'
import fcose from 'cytoscape-fcose'
import dagre from 'cytoscape-dagre'
import { debounce, isEqual, partition, uniqBy } from 'lodash-es'
import { getCytoscapeStyle } from '@/graph/graphStyles.js'
import { getLayoutOptions } from '@/graph/graphLayouts.js'
import { processRadialElems } from '@/graph/graphDataProcessor.js'
import { useGraphEvents } from './useGraphEvents.js'

cytoscape.use(fcose)
cytoscape.use(dagre)
cytoscape.warnings(false)

const CLUSTER_THRESHOLD = 10
const FIT_MAX_ZOOM = 1
const FIT_PADDING = 50
const ANIMATION_MS = 400
const ANIMATION_EASING = 'ease-out-cubic'
const ANIMATE_MAX_NODES = 300
const DOCK_ANIMATION_MS = 200

export function useGraphCytoscape(isDark, lastExpansionMode) {
  const cyRef = shallowRef(null)
  const cyContainer = ref(null)
  const expandedClusters = reactive(new Set())
  const pinnedNodes = reactive(new Set())
  const layoutType = useStorage('3d-mql-layout', 'radial')
  const lastExpandedNodeId = ref(null)
  const hasElements = ref(false)
  let activeLayout = null
  let wheelHandler = null
  const { tooltip, contextMenu, bindGraphEvents, hideTooltip, hideContextMenu } = useGraphEvents()

  const stopLayout = () => {
    activeLayout?.stop()
    activeLayout = null
    cyRef.value?.stop(true)
    cyRef.value?.nodes().stop(true)
  }

  const getPositions = () => {
    const positions = {}
    cyRef.value.nodes().forEach((n) => {
      positions[n.id()] = { ...n.position() }
    })
    return positions
  }

  const computePositions = (randomize) => {
    const options = { ...getLayoutOptions(layoutType.value), randomize, animate: false, fit: false }
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

  const anchoredViewport = (anchor, positions) => {
    const cy = cyRef.value
    const zoom = cy.zoom()
    const rendered = anchor.renderedPosition()
    const target = positions[anchor.id()]
    const pan = { x: rendered.x - zoom * target.x, y: rendered.y - zoom * target.y }
    const group = anchor.closedNeighborhood('node:visible')
    const box = boxOf(group, positions)
    const inside =
      box.x1 * zoom + pan.x >= 0 &&
      box.y1 * zoom + pan.y >= 0 &&
      box.x2 * zoom + pan.x <= cy.width() &&
      box.y2 * zoom + pan.y <= cy.height()
    return inside ? { zoom, pan } : fitViewport(group, positions, zoom)
  }

  const runLayout = ({ animate = true, fit = false, anchorId = null } = {}) => {
    const cy = cyRef.value
    if (!cy?.nodes().length) return
    stopLayout()
    hideTooltip()
    const nodes = cy.nodes()
    const start = getPositions()
    const target = computePositions(fit)
    cy.batch(() => nodes.forEach((n) => n.position(start[n.id()])))
    const anchor = anchorId && cy.getElementById(anchorId)
    const viewport = fit
      ? fitViewport(cy.nodes(':visible'), target)
      : anchor?.length && anchor.visible()
        ? anchoredViewport(anchor, target)
        : null
    if (!animate || nodes.length > ANIMATE_MAX_NODES) {
      cy.batch(() => nodes.forEach((n) => n.position(target[n.id()])))
      if (viewport) cy.viewport(viewport)
      return
    }
    activeLayout = cy.layout({
      name: 'preset',
      positions: (n) => target[n.id()],
      animate: true,
      animationDuration: ANIMATION_MS,
      animationEasing: ANIMATION_EASING,
      fit: false,
    })
    activeLayout.run()
    if (viewport) cy.animate({ ...viewport, duration: ANIMATION_MS, easing: ANIMATION_EASING })
  }

  const updateElements = (elems) => {
    const cy = cyRef.value
    cy.batch(() => {
      const next = uniqBy(elems, 'data.id')
      const nextIds = new Set(next.map((e) => e.data.id))
      cy.elements()
        .filter((el) => !nextIds.has(el.id()))
        .remove()
      const added = []
      next.forEach((el) => {
        const existing = cy.getElementById(el.data.id)
        if (!existing.length) added.push(el)
        else if (Object.keys(el.data).some((key) => !isEqual(existing.data(key), el.data[key]))) existing.data(el.data)
      })
      const [nodes, edges] = partition(added, { group: 'nodes' })
      if (nodes.length) cy.add(nodes)
      if (edges.length) cy.add(edges)
      cy.elements('[?isExploring]').data('isExploring', false)
    })
  }

  const syncGraph = (rawNodes, rawEdges, rootId, layout = null) => {
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
    updateElements(elems)
    applyFilter()
    hasElements.value = cyRef.value.elements().length > 0
    if (!layout) return
    Promise.resolve().then(() => runLayout(layout))
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
    cyRef.value = cytoscape({
      container: cyContainer.value,
      style: getCytoscapeStyle(isDark.value, layoutType.value),
    })

    wheelHandler = (e) => {
      if (!cyRef.value || !(e.ctrlKey || e.altKey)) return
      e.preventDefault()
      e.stopPropagation()
      const zoomFactor = 0.3
      const direction = e.deltaY > 0 ? 1 / (1 + zoomFactor) : 1 + zoomFactor
      cyRef.value.zoom({
        level: cyRef.value.zoom() * direction,
        renderedPosition: { x: e.offsetX, y: e.offsetY },
      })
    }
    cyContainer.value.addEventListener('wheel', wheelHandler, { passive: false })
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

  const findPath = (sourceId, targetId) => {
    if (!cyRef.value) return false
    clearPath()
    const { found, path } = cyRef.value.elements(':visible').aStar({
      root: cyRef.value.getElementById(sourceId),
      goal: cyRef.value.getElementById(targetId),
    })
    if (!found) return false
    cyRef.value.batch(() => {
      cyRef.value.elements().addClass('path-dimmed')
      path.removeClass('path-dimmed').addClass('path-match')
    })
    animateViewport(fitViewport(path.nodes(), getPositions()))
    return true
  }

  const destroyCy = () => {
    hideTooltip()
    hideContextMenu()
    stopLayout()
    if (cyContainer.value && wheelHandler) {
      cyContainer.value.removeEventListener('wheel', wheelHandler)
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

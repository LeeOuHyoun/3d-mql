import cytoscape from 'cytoscape'
import fcose from 'cytoscape-fcose'
import dagre from 'cytoscape-dagre'
import navigator from 'cytoscape-navigator'
import 'cytoscape-navigator/cytoscape.js-navigator.css'
import { debounce, uniqBy, partition } from 'lodash-es'
import { getCytoscapeStyle } from '@/graph/graphStyles.js'
import { getLayoutOptions } from '@/graph/graphLayouts.js'
import { processRadialElems } from '@/graph/graphDataProcessor.js'
import { useGraphEvents } from './useGraphEvents.js'

cytoscape.use(fcose)
cytoscape.use(dagre)
navigator(cytoscape)
cytoscape.warnings(false)

const CLUSTER_THRESHOLD = 10
const FAST_MODE_THRESHOLD = 30
const FIT_MAX_ZOOM = 1
const USER_MAX_ZOOM = 1e50

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
    if (!activeLayout) return
    activeLayout.stop()
    activeLayout = null
  }

  const isFastMode = () => cyRef.value.nodes().length >= FAST_MODE_THRESHOLD

  const runLayout = (options, onStop) => {
    const start = (opts) => {
      const layout = cyRef.value.layout(opts)
      cyRef.value.maxZoom(FIT_MAX_ZOOM)
      layout.one('layoutstop', () => {
        cyRef.value?.maxZoom(USER_MAX_ZOOM)
        onStop?.()
      })
      activeLayout = layout
      layout.run()
    }
    try {
      start(options)
    } catch (e) {
      if (options.name === 'fcose') start({ ...options, name: 'cose', animate: false })
    }
  }

  const applyLayout = (animate = true, fit = true, centerNodeId = null) => {
    if (!cyRef.value) return
    stopLayout()
    const fastMode = isFastMode()
    const centerOnNode = () => {
      const targetNode = cyRef.value?.getElementById(centerNodeId)
      if (targetNode?.length > 0) cyRef.value.animate({ center: { eles: targetNode }, duration: 350, easing: 'ease-out' })
    }
    runLayout(
      getLayoutOptions(fastMode, animate && !fastMode, centerNodeId ? false : fit, layoutType.value),
      centerNodeId && centerOnNode,
    )
  }

  const animateLayout = (fit) => {
    const oldPositions = getPositions()
    runLayout(getLayoutOptions(isFastMode(), false, fit, layoutType.value), () => {
      const newPositions = getPositions()
      cyRef.value.batch(() => {
        cyRef.value.nodes().forEach((node) => {
          const oldPos = oldPositions[node.id()]
          const parentNode = lastExpandedNodeId.value && cyRef.value.getElementById(lastExpandedNodeId.value)
          if (oldPos) node.position(oldPos)
          else if (parentNode?.length > 0) node.position(parentNode.position())
        })
      })
      cyRef.value.nodes().forEach((node) => {
        const newPos = newPositions[node.id()]
        if (newPos) node.animate({ position: newPos }, { duration: 400, easing: 'ease-out-quad' })
      })
    })
  }

  const getPositions = () => {
    const p = {}
    cyRef.value.nodes().forEach((n) => {
      p[n.id()] = n.position()
    })
    return p
  }

  const updateElements = (elems) => {
    cyRef.value.batch(() => {
      const uniqueElems = uniqBy(elems, 'data.id')
      const currentElements = cyRef.value.elements()

      if (Math.abs(currentElements.length - uniqueElems.length) > FAST_MODE_THRESHOLD || uniqueElems.length > 100) {
        currentElements.remove()
        if (uniqueElems.length > 0) cyRef.value.add(uniqueElems)
      } else {
        const nextIds = new Set(uniqueElems.map((e) => e.data.id))
        const toRemove = currentElements.filter((el) => !nextIds.has(el.id()))
        if (toRemove.length > 0) cyRef.value.remove(toRemove)

        const toAdd = []
        uniqueElems.forEach((el) => {
          const existing = cyRef.value.getElementById(el.data.id)
          if (existing.length > 0) existing.data(el.data)
          else toAdd.push(el)
        })

        if (toAdd.length) {
          const [nodes, edges] = partition(toAdd, { group: 'nodes' })
          if (nodes.length) cyRef.value.add(nodes)
          if (edges.length) cyRef.value.add(edges)
        }
      }

      cyRef.value.elements().forEach((el) => el.data('isExploring', false))
    })
  }

  const syncGraph = (rawNodes, rawEdges, rootId, shouldLayout = true, animate = true, fit = true, isContextMenuAction = false) => {
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
    if (!shouldLayout) return
    Promise.resolve().then(() => {
      if (!cyRef.value) return
      if (isContextMenuAction) animateLayout(fit)
      else applyLayout(animate, fit, lastExpandedNodeId.value || null)
    })
  }

  const applyLoD = debounce(() => {
    if (!cyRef.value) return
    const zoom = cyRef.value.zoom()
    cyRef.value.batch(() => {
      cyRef.value.elements().removeClass('lod-far lod-mid')
      if (zoom < 0.2) cyRef.value.elements().addClass('lod-far')
      else if (zoom < 0.5) cyRef.value.elements().addClass('lod-mid')
    })
  }, 100)

  const graphFilter = ref('')

  const applyFilter = () => {
    if (!cyRef.value) return
    const query = graphFilter.value.toLowerCase().trim()
    cyRef.value.batch(() => {
      const all = cyRef.value.elements()
      all.removeClass('search-match search-neighbor search-dimmed')
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
      all.addClass('search-dimmed')
      core.removeClass('search-dimmed').addClass('search-match')
      neighbors.not(core).removeClass('search-dimmed').addClass('search-neighbor')
    })
  }

  watch(graphFilter, applyFilter)

  const navContainer = ref(null)
  let navInstance = null

  const initNav = () => {
    if (!cyRef.value || !navContainer.value) return
    navContainer.value.id = `cy-nav-${Date.now()}`
    navInstance = cyRef.value.navigator({
      container: `#${navContainer.value.id}`,
      viewLiveFramerate: 0,
      thumbnailEventFramerate: 30,
      thumbnailLiveFramerate: false,
      dblClickDelay: 200,
      removeCustomContainer: false,
      rerenderDelay: 50,
    })
  }

  const resizeNav = () => {
    if (!navInstance || !cyRef.value) return
    navInstance.resize()
    cyRef.value.emit('viewport')
    cyRef.value.notify({ type: 'render' })
  }

  const initCytoscape = (handlers) => {
    if (!cyContainer.value) return
    cyRef.value = cytoscape({
      container: cyContainer.value,
      style: getCytoscapeStyle(isDark.value),
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
    cyRef.value.on('zoom', applyLoD)
    cyRef.value.on('layoutstop', resizeNav)
    cyRef.value.on('tap', (evt) => evt.target === cyRef.value && clearPath())
    bindGraphEvents(cyRef.value, cyContainer, handlers)
    initNav()
  }

  const resetView = () => applyLayout(true)

  watch(layoutType, resetView)

  const fitView = () => {
    if (!cyRef.value) return
    cyRef.value.maxZoom(FIT_MAX_ZOOM)
    cyRef.value.animate({
      fit: { eles: cyRef.value.elements(':visible'), padding: 50 },
      duration: 300,
      complete: () => cyRef.value?.maxZoom(USER_MAX_ZOOM),
    })
  }

  const clearPath = () => cyRef.value?.elements().removeClass('path-match path-dimmed')

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
    cyRef.value.animate({ fit: { eles: path, padding: 80 }, duration: 350 })
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
    navInstance?.destroy()
    navInstance = null
    cyRef.value?.destroy()
    cyRef.value = null
  }

  useResizeObserver(
    cyContainer,
    debounce(() => {
      cyRef.value?.resize()
      resizeNav()
    }, 150),
  )
  watch(isDark, () => cyRef.value?.style(getCytoscapeStyle(isDark.value)))

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
    navContainer,
    graphFilter,
    hasElements,
    lastExpandedNodeId,
    tooltip,
    contextMenu,
    syncGraph,
    initCytoscape,
    resetView,
    fitView,
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

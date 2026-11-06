import cytoscape from 'cytoscape'
import fcose from 'cytoscape-fcose'
import { debounce, uniqBy, partition } from 'lodash-es'
import { getCytoscapeStyle } from '@/graph/graphStyles.js'
import { getLayoutOptions } from '@/graph/graphLayouts.js'
import { processRadialElems } from '@/graph/graphDataProcessor.js'
import { useGraphEvents } from './useGraphEvents.js'

cytoscape.use(fcose)
cytoscape.warnings(false)

const CLUSTER_THRESHOLD = 10
const FAST_MODE_THRESHOLD = 30

export function useGraphCytoscape(isDark, lastExpansionMode) {
  const cyRef = shallowRef(null)
  const cyContainer = ref(null)
  const expandedClusters = reactive(new Set())
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
      if (onStop) layout.one('layoutstop', onStop)
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
    runLayout(getLayoutOptions(fastMode, animate && !fastMode, centerNodeId ? false : fit), centerNodeId && centerOnNode)
  }

  const animateLayout = (fit) => {
    const oldPositions = getPositions()
    runLayout(getLayoutOptions(isFastMode(), false, fit), () => {
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
    const positions = getPositions()
    const seedPos = (lastExpandedNodeId.value && positions[lastExpandedNodeId.value]) || { x: 0, y: 0 }
    const elems = processRadialElems(rawNodes, rawEdges, rootId, positions, seedPos, {
      expandedClusters,
      CLUSTER_THRESHOLD,
      lastExpandedNodeId: lastExpandedNodeId.value,
      lastExpansionMode: lastExpansionMode.value,
    })
    updateElements(elems)
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
    bindGraphEvents(cyRef.value, cyContainer, handlers)
  }

  const resetView = () => applyLayout(true)

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

  useResizeObserver(
    cyContainer,
    debounce(() => cyRef.value?.resize(), 150),
  )
  watch(isDark, () => cyRef.value?.style(getCytoscapeStyle(isDark.value)))

  const toggleCluster = (clusterKey) =>
    expandedClusters.has(clusterKey) ? expandedClusters.delete(clusterKey) : expandedClusters.add(clusterKey)

  const resetClusters = () => expandedClusters.clear()

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
    hasElements,
    lastExpandedNodeId,
    tooltip,
    contextMenu,
    syncGraph,
    initCytoscape,
    resetView,
    destroyCy,
    toggleCluster,
    resetClusters,
    collapseExpandedFromNode,
    hideTooltip,
    hideContextMenu,
  }
}

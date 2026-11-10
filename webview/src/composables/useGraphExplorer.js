import { debounce } from 'lodash-es'
import { getState, onMessage, post, request, setState } from '@/api.js'
import { useTheme } from './useTheme.js'
import { useGraphCytoscape } from './useGraphCytoscape.js'
import { useRelationFilter } from './useRelationFilter.js'
import { useMqlConsole } from './useMqlConsole.js'

export const objectIdPattern = /^(\d+\.\d+\.\d+\.\d+|[0-9a-f]{32})$/i
const plainIdPattern = /^\d+\.\d+\.\d+\.\d+$/
const DETAIL_CACHE_SIZE = 300

export function useGraphExplorer() {
  const { isDark, toggleTheme } = useTheme()
  const lastExpansionMode = ref('forward')
  const {
    cyRef,
    cyContainer,
    minimapCanvas,
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
  } = useGraphCytoscape(isDark, lastExpansionMode)
  const errorMsg = ref('')

  const connection = ref({ state: 'connecting', message: '' })
  const reconnect = () => {
    detailCache.clear()
    post({ type: 'reconnect' })
  }

  tryOnScopeDispose(
    onMessage((message) => {
      if (message?.type === 'init' || message?.type === 'status') {
        connection.value = { state: message.state, message: message.message || '' }
      }
    }),
  )

  let rawNodes = {}
  let rawEdges = {}
  const rootId = ref('')
  const rootItem = shallowRef(null)
  const isLoading = ref(false)
  const relationFilterState = useRelationFilter(cyRef, rootId)
  const { hiddenRelations, relationFilter, resetRelations, refreshRelations } = relationFilterState

  const toNode = (o) => ({
    id: o.id,
    type: o.type,
    name: o.name,
    revision: o.revision,
    current: o.current,
    label: `${o.name} ${o.revision}\n(${o.type})`,
    isRoot: o.id === rootId.value,
  })

  const toEdge = (e) => ({ ...e, source: e.from, target: e.to, displayName: e.label, isReverse: e.reverse })

  const doSyncGraph = (layout = {}) => {
    syncGraph(rawNodes, rawEdges, rootId.value, layout)
    rootItem.value = rawNodes[rootId.value] ?? null
    refreshRelations()
    onSelectionChange()
    persist()
  }

  const mergeExpansion = (sourceId, direction, { nodes, edges }, replace = true) => {
    Object.keys(rawEdges).forEach((key) => {
      const e = rawEdges[key]
      const isOwn = e.isReverse ? e.to === sourceId : e.from === sourceId
      if (replace && isOwn && (direction === 'both' || e.isReverse === (direction === 'to'))) delete rawEdges[key]
    })
    nodes.forEach((n) => {
      rawNodes[n.id] ??= toNode(n)
    })
    edges.forEach((e) => {
      rawEdges[e.id] ??= toEdge(e)
    })
  }

  const expand = async (id, direction, options = null) => {
    cyRef.value?.getElementById(id).data('isExploring', true)
    isLoading.value = true
    errorMsg.value = ''
    try {
      mergeExpansion(id, direction, await request('expand', { ...options, id, direction }), !options)
      lastExpansionMode.value = direction === 'to' ? 'backward' : 'forward'
      lastExpandedNodeId.value = id
      doSyncGraph({ anchorId: id })
    } catch (e) {
      errorMsg.value = e.message
      cyRef.value?.nodes().data('isExploring', false)
    } finally {
      isLoading.value = false
    }
  }

  const expandDialogId = ref('')

  const submitExpandOptions = (options) => {
    const id = expandDialogId.value
    expandDialogId.value = ''
    expand(id, options.direction, options)
  }

  const linkExisting = async (ids) => {
    isLoading.value = true
    errorMsg.value = ''
    try {
      const results = await Promise.all(ids.map((id) => request('expand', { id, direction: 'both' })))
      const before = Object.keys(rawEdges).length
      results
        .flatMap((result) => result.edges)
        .forEach((e) => {
          if (rawNodes[e.from] && rawNodes[e.to]) rawEdges[e.id] ??= toEdge(e)
        })
      const added = Object.keys(rawEdges).length - before
      post({ type: 'notify', text: added ? `기존 노드 사이의 관계 ${added}건을 연결했습니다.` : '새로 연결할 관계가 없습니다.' })
      if (added) doSyncGraph()
    } catch (e) {
      errorMsg.value = e.message
    } finally {
      isLoading.value = false
    }
  }

  const clearGraph = () => {
    rawNodes = {}
    rawEdges = {}
    rootId.value = ''
    graphFilter.value = ''
    lastExpandedNodeId.value = null
    resetClusters()
    resetRelations()
    clearDetail()
    doSyncGraph(null)
  }

  const rootHistory = ref([])
  const historyIndex = ref(-1)

  const recordHistory = (summary) => {
    if (rootHistory.value[historyIndex.value]?.id === summary.id) return
    const entry = { id: summary.id, label: `${summary.name} ${summary.revision} (${summary.type})` }
    rootHistory.value = [...rootHistory.value.slice(0, historyIndex.value + 1), entry].slice(-30)
    historyIndex.value = rootHistory.value.length - 1
  }

  const goHistory = async (index) => {
    const entry = rootHistory.value[index]
    if (!entry || !(await loadRoot(entry.id, false))) return
    historyIndex.value = index
    persist()
  }

  const goBack = () => goHistory(historyIndex.value - 1)

  const goForward = () => goHistory(historyIndex.value + 1)

  const loadRoot = async (id, record = true) => {
    isLoading.value = true
    errorMsg.value = ''
    try {
      const [{ summary }, early] = await Promise.all([
        requestDetail('object', id),
        plainIdPattern.test(id) ? request('expand', { id, direction: 'both' }) : null,
      ])
      const expansion = early ?? (await request('expand', { id: summary.id, direction: 'both' }))
      clearGraph()
      rootId.value = summary.id
      rawNodes[summary.id] = toNode(summary)
      mergeExpansion(summary.id, 'both', expansion)
      lastExpansionMode.value = 'forward'
      if (record) recordHistory(summary)
      doSyncGraph({ fit: true })
      return true
    } catch (e) {
      errorMsg.value = e.message
      return false
    } finally {
      isLoading.value = false
    }
  }

  const searchForm = reactive({ type: '', name: '', revision: '' })
  const searchResults = ref([])
  const searchLimit = ref(0)
  const isSearching = ref(false)
  const isSearchPanelOpen = ref(false)

  const onSearch = async () => {
    const typeValue = searchForm.type.trim()
    if (objectIdPattern.test(typeValue) && !searchForm.name.trim()) {
      await loadRoot(typeValue)
      return
    }
    if (Object.values(searchForm).every((value) => !value.replaceAll('*', '').trim())) {
      errorMsg.value = 'Type · Name · Rev 중 하나 이상에 * 이외의 검색어를 입력하세요.'
      return
    }
    isSearching.value = true
    errorMsg.value = ''
    try {
      const { results, limit } = await request('search', { ...searchForm })
      searchResults.value = results
      searchLimit.value = limit
      isSearchPanelOpen.value = true
      persist()
    } catch (e) {
      errorMsg.value = e.message
    } finally {
      isSearching.value = false
    }
  }

  const selectedItem = ref(null)
  const detail = ref(null)
  const isDetailLoading = ref(false)
  const isDetailPanelOpen = useStorage('3d-mql-detail-panel-open', true)
  const detailCache = new Map()
  let detailTarget = null
  let isDetailBusy = false

  const requestDetail = async (method, id) => {
    const key = `${method}:${id}`
    if (detailCache.has(key)) return detailCache.get(key)
    const result = await request(method, { id })
    detailCache.set(key, result)
    if (detailCache.size > DETAIL_CACHE_SIZE) detailCache.delete(detailCache.keys().next().value)
    return result
  }

  const finishDetail = (result) => {
    detailTarget = null
    detail.value = result
    isDetailLoading.value = false
  }

  const loadDetail = async () => {
    const target = detailTarget
    if (isDetailBusy || !target) return
    isDetailBusy = true
    try {
      const result = await requestDetail(target.method, target.id)
      if (detailTarget === target) finishDetail(result)
    } catch (e) {
      if (detailTarget === target) {
        errorMsg.value = e.message
        finishDetail(null)
      }
    } finally {
      isDetailBusy = false
      loadDetail()
    }
  }

  const toSelectedItem = (el) => {
    const data = el.data()
    const members = (data.childNodeIds || []).map((id) => rawNodes[id]).filter(Boolean)
    return { ...data, members, isNode: el.isNode(), isEdge: el.isEdge() }
  }

  const showDetail = (el) => {
    const data = el.data()
    const method = el.isNode() ? 'object' : 'connection'
    const id = data.originalId || data.id
    const isCluster = data.isCluster || String(data.id).startsWith('edge-cluster')
    selectedItem.value = toSelectedItem(el)
    detailTarget = null
    detail.value = isCluster ? null : (detailCache.get(`${method}:${id}`) ?? null)
    isDetailLoading.value = !isCluster && !detail.value
    if (!isDetailLoading.value) return
    detailTarget = { method, id }
    loadDetail()
  }

  const clearDetail = () => {
    detailTarget = null
    selectedItem.value = null
    detail.value = null
    isDetailLoading.value = false
  }

  const selectionCount = ref(0)
  let tappedElement = null

  const onElementTap = (evt) => {
    tappedElement = evt.target
  }

  const onSelectionChange = debounce(() => {
    const cy = cyRef.value
    if (!cy) return
    const selected = cy.$(':selected')
    const tapped = tappedElement
    tappedElement = null
    selectionCount.value = selected.length
    const target = selected.length === 1 ? selected[0] : tapped?.inside() && tapped.selected() ? tapped : null
    if (target) showDetail(target)
    else if (selectedItem.value && !cy.getElementById(selectedItem.value.id).length) clearDetail()
  }, 50)

  const locateSelected = () => {
    if (focusElement(selectedItem.value?.id)) return
    post({ type: 'notify', text: '관계 필터로 숨겨져 있어 그래프에서 찾을 수 없습니다.' })
  }

  const { run: runInConsole, runCount } = useMqlConsole()

  watch(runCount, () => detailCache.clear())

  const refreshSelectedCluster = () => {
    const el = cyRef.value?.getElementById(selectedItem.value?.id)
    selectedItem.value = el?.length ? toSelectedItem(el) : null
  }

  const clusterAnchor = (clusterKey) => clusterKey?.split('::')[0]

  const pinClusterMember = (id) => {
    pinNode(id)
    doSyncGraph({ anchorId: clusterAnchor(selectedItem.value?.clusterKey) })
    refreshSelectedCluster()
  }

  const expandCluster = (clusterKey) => {
    toggleCluster(clusterKey)
    doSyncGraph({ anchorId: clusterAnchor(clusterKey) })
    refreshSelectedCluster()
  }

  const onNodeDblTap = (evt) => {
    const node = evt.target
    if (node.data('isCluster')) {
      toggleCluster(node.data('clusterKey'))
      doSyncGraph({ anchorId: clusterAnchor(node.data('clusterKey')) })
      return
    }
    if (node.outgoers('edge').length > 0 && collapseExpandedFromNode(node)) {
      lastExpandedNodeId.value = null
      doSyncGraph({ anchorId: node.id() })
      return
    }
    expand(node.id(), 'both')
  }

  const queryMethods = { copy: 'copy', run: 'query', insert: 'insert' }

  const runQuery = async (method, action, targets) => {
    try {
      const text = await request(method, { action, targets })
      if (method === 'query') runInConsole(text)
    } catch (e) {
      errorMsg.value = e.message
    }
  }

  const compareItems = ref([])

  const showPath = ([sourceId, targetId]) => {
    if (!findPath(sourceId, targetId)) errorMsg.value = '현재 그래프에 보이는 관계로는 두 객체가 연결되어 있지 않습니다.'
  }

  const onContextAction = (action) => {
    const menu = contextMenu.value
    hideContextMenu()
    if (!menu) return
    const id = menu.target.id()
    const [prefix, query] = action.split(':')
    if (query) runQuery(queryMethods[prefix], query, menu.targets.map((t) => t.data()))
    else if (action === 'expand') expand(id, 'from')
    else if (action === 'whereUsed') expand(id, 'to')
    else if (action === 'expandOptions') expandDialogId.value = id
    else if (action === 'setRoot') loadRoot(id)
    else if (action === 'linkExisting') linkExisting(menu.targets.map((t) => t.id()))
    else if (action === 'compare') compareItems.value = menu.targets.map((t) => t.data())
    else if (action === 'findPath') showPath(menu.targets.map((t) => t.id()))
  }

  const persist = debounce(() => {
    const cy = cyRef.value
    setState({
      rawNodes,
      rawEdges,
      rootId: rootId.value,
      searchForm: { ...searchForm },
      searchResults: searchResults.value,
      searchLimit: searchLimit.value,
      isSearchPanelOpen: isSearchPanelOpen.value,
      hiddenRelations: hiddenRelations.value,
      relationFilter: relationFilter.value,
      graphFilter: graphFilter.value,
      expandedClusters: [...expandedClusters],
      pinnedNodes: [...pinnedNodes],
      rootHistory: rootHistory.value,
      historyIndex: historyIndex.value,
      detailId: selectedItem.value?.id,
      positions: cy ? Object.fromEntries(cy.nodes().map((n) => [n.id(), n.position()])) : null,
      viewport: cy ? { zoom: cy.zoom(), pan: cy.pan() } : null,
    })
  }, 300)

  useEventListener(window, 'pagehide', () => persist.flush())
  watch([searchForm, isSearchPanelOpen, hiddenRelations, relationFilter, graphFilter, selectedItem], persist)

  const restoreLayout = ({ positions, viewport, detailId }) => {
    const cy = cyRef.value
    cy.batch(() => cy.nodes().forEach((n) => positions[n.id()] && n.position(positions[n.id()])))
    if (viewport) cy.viewport(viewport)
    const el = detailId && cy.getElementById(detailId)
    if (el?.length) showDetail(el)
  }

  const restore = () => {
    const saved = getState()
    if (!saved) return
    rawNodes = saved.rawNodes
    rawEdges = saved.rawEdges
    rootId.value = saved.rootId
    Object.assign(searchForm, saved.searchForm)
    searchResults.value = saved.searchResults
    searchLimit.value = saved.searchLimit
    isSearchPanelOpen.value = saved.isSearchPanelOpen
    hiddenRelations.value = saved.hiddenRelations ?? []
    relationFilter.value = saved.relationFilter ?? ''
    graphFilter.value = saved.graphFilter ?? ''
    saved.expandedClusters?.forEach((key) => expandedClusters.add(key))
    saved.pinnedNodes?.forEach((id) => pinnedNodes.add(id))
    rootHistory.value = saved.rootHistory ?? []
    historyIndex.value = saved.historyIndex ?? -1
    if (!saved.positions) {
      doSyncGraph({ animate: false, fit: true })
      return
    }
    doSyncGraph(null)
    restoreLayout(saved)
  }

  onMounted(() => {
    initCytoscape({ onNodeDblTap, onElementTap, onSelect: onSelectionChange, onUnselect: onSelectionChange })
    cyRef.value?.on('layoutstop dragfree viewport', persist)
    restore()
  })
  onBeforeUnmount(destroyCy)

  return {
    isDark,
    toggleTheme,
    cyContainer,
    minimapCanvas,
    graphFilter,
    hasElements,
    tooltip,
    contextMenu,
    hideTooltip,
    hideContextMenu,
    errorMsg,
    connection,
    reconnect,
    isLoading,
    searchForm,
    searchResults,
    searchLimit,
    isSearching,
    isSearchPanelOpen,
    onSearch,
    loadRoot,
    expand,
    clearGraph,
    resetView,
    fitView,
    layoutType,
    selectedItem,
    selectionCount,
    locateSelected,
    detail,
    isDetailLoading,
    isDetailPanelOpen,
    onContextAction,
    rootItem,
    relationFilterState,
    rootHistory,
    historyIndex,
    goHistory,
    goBack,
    goForward,
    expandDialogId,
    submitExpandOptions,
    compareItems,
    pinClusterMember,
    expandCluster,
  }
}

import { getState, onMessage, post, request, setState } from '@/api.js'
import { useTheme } from './useTheme.js'
import { useGraphCytoscape } from './useGraphCytoscape.js'
import { useRelationFilter } from './useRelationFilter.js'
import { useMqlConsole } from './useMqlConsole.js'

export const objectIdPattern = /^(\d+\.\d+\.\d+\.\d+|[0-9a-f]{32})$/i

export function useGraphExplorer() {
  const { isDark, toggleTheme } = useTheme()
  const lastExpansionMode = ref('forward')
  const {
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
  } = useGraphCytoscape(isDark, lastExpansionMode)
  const errorMsg = ref('')

  const connection = ref({ state: 'connecting', message: '' })
  const reconnect = () => post({ type: 'reconnect' })

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
  const isLoading = ref(false)
  const relationFilterState = useRelationFilter(cyRef, rootId)
  const { hiddenRelations, resetRelations, refreshRelations } = relationFilterState

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

  const doSyncGraph = (shouldLayout = true, animate = true, fit = true, isContextMenuAction = false) => {
    syncGraph(rawNodes, rawEdges, rootId.value, shouldLayout, animate, fit, isContextMenuAction)
    refreshRelations()
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

  const expand = async (id, direction, isContextMenuAction = false, options = null) => {
    cyRef.value?.getElementById(id).data('isExploring', true)
    isLoading.value = true
    errorMsg.value = ''
    try {
      mergeExpansion(id, direction, await request('expand', { ...options, id, direction }), !options)
      lastExpansionMode.value = direction === 'to' ? 'backward' : 'forward'
      lastExpandedNodeId.value = id
      doSyncGraph(true, true, true, isContextMenuAction)
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
    expand(id, options.direction, true, options)
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
      if (added) doSyncGraph(true, true, false, true)
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
    selectedItem.value = null
    detail.value = null
    doSyncGraph(false)
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
      const { summary } = await request('object', { id })
      const expansion = await request('expand', { id: summary.id, direction: 'both' })
      clearGraph()
      rootId.value = summary.id
      rawNodes[summary.id] = toNode(summary)
      mergeExpansion(summary.id, 'both', expansion)
      lastExpansionMode.value = 'forward'
      if (record) recordHistory(summary)
      doSyncGraph()
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
  const isDetailPanelOpen = ref(true)
  let detailSeq = 0

  const toSelectedItem = (el) => {
    const data = el.data()
    const members = (data.childNodeIds || []).map((id) => rawNodes[id]).filter(Boolean)
    return { ...data, members, isNode: el.isNode(), isEdge: el.isEdge() }
  }

  const onSelect = async (evt) => {
    const el = evt.target
    const data = el.data()
    const isCluster = data.isCluster || String(data.id).startsWith('edge-cluster')
    const seq = ++detailSeq
    selectedItem.value = toSelectedItem(el)
    detail.value = null
    isDetailLoading.value = !isCluster
    if (isCluster) return
    try {
      const result = await request(el.isNode() ? 'object' : 'connection', { id: data.originalId || data.id })
      if (seq === detailSeq) detail.value = result
    } catch (e) {
      if (seq === detailSeq) errorMsg.value = e.message
    } finally {
      if (seq === detailSeq) isDetailLoading.value = false
    }
  }

  const onUnselect = () => {
    if (cyRef.value?.$(':selected').length) return
    detailSeq++
    selectedItem.value = null
    detail.value = null
    isDetailLoading.value = false
  }

  const refreshSelectedCluster = () => {
    const el = cyRef.value?.getElementById(selectedItem.value?.id)
    selectedItem.value = el?.length ? toSelectedItem(el) : null
  }

  const pinClusterMember = (id) => {
    pinNode(id)
    doSyncGraph(true, true, false)
    refreshSelectedCluster()
  }

  const expandCluster = (clusterKey) => {
    toggleCluster(clusterKey)
    doSyncGraph(true, true, false)
    refreshSelectedCluster()
  }

  const onNodeDblTap = (evt) => {
    const node = evt.target
    if (node.data('isCluster')) {
      toggleCluster(node.data('clusterKey'))
      doSyncGraph(true, true, false)
      return
    }
    if (node.outgoers('edge').length > 0 && collapseExpandedFromNode(node)) {
      lastExpandedNodeId.value = null
      doSyncGraph(true, true, false)
      return
    }
    expand(node.id(), 'both')
  }

  const { run: runInConsole } = useMqlConsole()
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
    else if (action === 'expand') expand(id, 'from', true)
    else if (action === 'whereUsed') expand(id, 'to', true)
    else if (action === 'expandOptions') expandDialogId.value = id
    else if (action === 'setRoot') loadRoot(id)
    else if (action === 'linkExisting') linkExisting(menu.targets.map((t) => t.id()))
    else if (action === 'compare') compareItems.value = menu.targets.map((t) => t.data())
    else if (action === 'findPath') showPath(menu.targets.map((t) => t.id()))
  }

  const persist = () =>
    setState({
      rawNodes,
      rawEdges,
      rootId: rootId.value,
      searchForm: { ...searchForm },
      searchResults: searchResults.value,
      searchLimit: searchLimit.value,
      isSearchPanelOpen: isSearchPanelOpen.value,
      hiddenRelations: hiddenRelations.value,
      rootHistory: rootHistory.value,
      historyIndex: historyIndex.value,
    })

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
    rootHistory.value = saved.rootHistory ?? []
    historyIndex.value = saved.historyIndex ?? -1
    doSyncGraph(true, false)
  }

  onMounted(() => {
    initCytoscape({ onNodeDblTap, onSelect, onUnselect })
    restore()
  })
  onBeforeUnmount(destroyCy)

  return {
    isDark,
    toggleTheme,
    cyContainer,
    navContainer,
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
    detail,
    isDetailLoading,
    isDetailPanelOpen,
    onContextAction,
    rootId,
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

import { getState, onMessage, post, request, setState } from '@/api.js'
import { useTheme } from './useTheme.js'
import { useGraphCytoscape } from './useGraphCytoscape.js'

const objectIdPattern = /^(\d+\.\d+\.\d+\.\d+|[0-9a-f]{32})$/i

export function useGraphExplorer() {
  const { isDark, toggleTheme } = useTheme()
  const lastExpansionMode = ref('forward')
  const {
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

  const toNode = (o) => ({
    id: o.id,
    type: o.type,
    name: o.name,
    revision: o.revision,
    current: o.current,
    label: `${o.name} ${o.revision}\n(${o.type})`,
    isRoot: o.id === rootId.value,
  })

  const doSyncGraph = (shouldLayout = true, animate = true, fit = true, isContextMenuAction = false) => {
    syncGraph(rawNodes, rawEdges, rootId.value, shouldLayout, animate, fit, isContextMenuAction)
    persist()
  }

  const mergeExpansion = (sourceId, direction, { nodes, edges }) => {
    Object.keys(rawEdges).forEach((key) => {
      const e = rawEdges[key]
      const isOwn = e.isReverse ? e.to === sourceId : e.from === sourceId
      if (isOwn && (direction === 'both' || e.isReverse === (direction === 'to'))) delete rawEdges[key]
    })
    nodes.forEach((n) => {
      rawNodes[n.id] ??= toNode(n)
    })
    edges.forEach((e) => {
      rawEdges[e.id] ??= { ...e, source: e.from, target: e.to, displayName: e.label, isReverse: e.to === sourceId }
    })
  }

  const expand = async (id, direction, isContextMenuAction = false) => {
    cyRef.value?.getElementById(id).data('isExploring', true)
    isLoading.value = true
    errorMsg.value = ''
    try {
      mergeExpansion(id, direction, await request('expand', { id, direction }))
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

  const clearGraph = () => {
    rawNodes = {}
    rawEdges = {}
    rootId.value = ''
    lastExpandedNodeId.value = null
    resetClusters()
    selectedItem.value = null
    detail.value = null
    doSyncGraph(false)
  }

  const loadRoot = async (id) => {
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
      doSyncGraph()
    } catch (e) {
      errorMsg.value = e.message
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

  const onSelect = async (evt) => {
    const el = evt.target
    const data = el.data()
    const isCluster = data.isCluster || String(data.id).startsWith('edge-cluster')
    const seq = ++detailSeq
    selectedItem.value = { ...data, isNode: el.isNode(), isEdge: el.isEdge() }
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

  const { copy: copyText } = useClipboard({ legacy: true })

  const onContextAction = (action) => {
    const node = contextMenu.value?.node
    hideContextMenu()
    if (!node) return
    const id = node.id()
    if (action === 'expand') expand(id, 'from', true)
    else if (action === 'whereUsed') expand(id, 'to', true)
    else if (action === 'setRoot') loadRoot(id)
    else if (action === 'copyId') copyText(id)
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
    selectedItem,
    detail,
    isDetailLoading,
    isDetailPanelOpen,
    onContextAction,
    rootId,
  }
}

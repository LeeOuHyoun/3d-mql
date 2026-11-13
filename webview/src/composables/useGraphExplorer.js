import { countBy, debounce, isEqual, partition, pick, uniq, uniqWith, upperFirst } from 'lodash-es'
import { cachedRequest, clearRequestCache, getState, onMessage, post, request, setState } from '@/api.js'
import { useTheme } from './useTheme.js'
import { useGraphCytoscape } from './useGraphCytoscape.js'
import { useRelationFilter } from './useRelationFilter.js'
import { useMqlConsole } from './useMqlConsole.js'
import { isPending, pendingId, pendingKey, useChangeBasket } from './useChangeBasket.js'

export const objectIdPattern = /^(\d+\.\d+\.\d+\.\d+|[0-9a-f]{32})$/i
const plainIdPattern = /^\d+\.\d+\.\d+\.\d+$/
const DETAIL_CACHE_SIZE = 300
const ADD_LIMIT = 50
const LARGE_GRAPH_NODES = 2000
const STALE = Symbol('stale')
const diffKinds = [
  { key: 'added', label: '추가' },
  { key: 'removed', label: '삭제' },
  { key: 'changed', label: '변경' },
]
const modifyEvents = { name: 'ChangeName', revision: 'ChangeName', owner: 'ChangeOwner', description: 'ModifyDescription' }
const restoreFields = ['owner', 'description', 'organization', 'project']

const chipsOf = (kinds, values) => {
  const counts = countBy(values)
  return kinds.filter((kind) => counts[kind.key]).map((kind) => ({ ...kind, count: counts[kind.key] }))
}

export function useGraphExplorer() {
  const { isDark, toggleTheme } = useTheme()
  const lastExpansionMode = ref('forward')
  const {
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
    revealElement,
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
  } = useGraphCytoscape(isDark, lastExpansionMode)
  const errorMsg = ref('')

  const guarded =
    (action) =>
    async (...args) => {
      try {
        return await action(...args)
      } catch (e) {
        errorMsg.value = e.message
      }
    }

  const inFlight = new Map()

  const exclusive =
    (keyOf, action) =>
    (...args) => {
      const key = keyOf(...args)
      if (!inFlight.has(key)) inFlight.set(key, action(...args).finally(() => inFlight.delete(key)))
      return inFlight.get(key)
    }

  const connection = ref({ state: 'connecting', message: '' })
  const context = computed(() => {
    const text = connection.value.state === 'ready' ? connection.value.message : ''
    const user = /\b(?:user|person)\s+(.+?)(?=\s+(?:role|vault)\b|$)/i.exec(text)?.[1] ?? ''
    const vault = /\bvault\s+(.+?)(?=\s+(?:user|person|role)\b|$)/i.exec(text)?.[1] ?? ''
    return { user, vault, label: user ? [user, vault].filter(Boolean).join(' · ') : text }
  })
  const reconnect = () => {
    detailCache.clear()
    clearRequestCache()
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
  let explorations = []
  const rootId = ref('')
  const rootItem = shallowRef(null)
  const loadingCount = ref(0)
  const isLoading = computed(() => loadingCount.value > 0)

  const withLoading = async (run) => {
    loadingCount.value++
    try {
      return await run()
    } finally {
      loadingCount.value--
    }
  }

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

  const notice = shallowRef(null)

  const clearNotice = () => {
    if (!notice.value) return
    notice.value = null
    clearMarks()
  }

  const focusNotice = (item) => {
    if (focusElement(item.kind === 'removed' ? `ghost-${item.id}` : item.id)) return
    post({ type: 'notify', text: '그래프에 따로 그려지지 않은 항목입니다.' })
  }

  let isLargeWarned = false

  const warnLargeGraph = () => {
    const isLarge = Object.keys(rawNodes).length > LARGE_GRAPH_NODES
    if (isLarge && !isLargeWarned) {
      post({
        type: 'notify',
        warning: true,
        text: `그래프의 객체가 ${LARGE_GRAPH_NODES}개를 넘었습니다. 느려지면 그래프를 비우고 필요한 객체만 ID로 열어 보세요.`,
      })
    }
    isLargeWarned = isLarge
  }

  const doSyncGraph = (layout = {}) => {
    clearNotice()
    const isChanged = syncGraph(rawNodes, rawEdges, rootId.value, layout, basket.overlay.value)
    rootItem.value = rawNodes[rootId.value] ?? null
    refreshRelations()
    onSelectionChange()
    persist()
    warnLargeGraph()
    return isChanged
  }

  const rawGraph = () => ({ nodes: rawNodes, edges: rawEdges })

  const mergeExpansion = (sourceId, direction, { nodes, edges }, replace = true, target = rawGraph()) => {
    Object.keys(target.edges).forEach((key) => {
      const e = target.edges[key]
      const isOwn = e.isReverse ? e.to === sourceId : e.from === sourceId
      if (replace && isOwn && (direction === 'both' || e.isReverse === (direction === 'to'))) delete target.edges[key]
    })
    nodes.forEach((n) => {
      target.nodes[n.id] = { ...target.nodes[n.id], ...toNode(n) }
    })
    edges.forEach((e) => {
      target.edges[e.id] ??= toEdge(e)
    })
  }

  const explorers = {
    expand: {
      fetch: ({ id, direction, options }) => request('expand', { ...options, id, direction }),
      apply: ({ id, direction, options }, result, target) => {
        if (!target.nodes[id]) return result
        mergeExpansion(id, direction, result, !options, target)
        if (result.truncated) target.nodes[id] = { ...target.nodes[id], isTruncated: true }
        return result
      },
    },
    link: {
      fetch: async ({ ids }) => {
        const results = await Promise.allSettled(ids.map((id) => request('expand', { id, direction: 'both' })))
        const [found, failed] = partition(results, { status: 'fulfilled' })
        if (!found.length) throw failed[0].reason
        return found.map((result) => result.value)
      },
      apply: (entry, results, target) => {
        const before = Object.keys(target.edges).length
        results
          .flatMap((result) => result.edges)
          .forEach((e) => {
            if (target.nodes[e.from] && target.nodes[e.to]) target.edges[e.id] ??= toEdge(e)
          })
        return { added: Object.keys(target.edges).length - before, isPartial: results.some((result) => result.truncated) }
      },
    },
    connect: {
      fetch: ({ from, relType }) => request('expand', { id: from, direction: 'from', relType }),
      apply: ({ to, relType }, result, target) => {
        result.edges
          .filter((e) => e.to === to && e.label === relType && target.nodes[e.from] && target.nodes[to])
          .forEach((e) => {
            target.edges[e.id] ??= toEdge(e)
          })
      },
    },
    add: {
      fetch: ({ ids }) => Promise.all(ids.map((id) => requestDetail('object', id).catch(() => null))),
      apply: (entry, results, target) => {
        const objects = results.filter((result) => result && !target.nodes[result.summary.id])
        objects.forEach(({ summary }) => {
          target.nodes[summary.id] = { ...toNode(summary), isLoose: true }
        })
        return objects.map(({ summary }) => summary.id)
      },
    },
    attach: {
      fetch: async ({ id }) => {
        const { attached } = await request('connectionLinks', { id })
        const busIds = uniq(attached.flatMap((e) => [e.from, e.to]).filter(Boolean))
        return { attached, objects: await Promise.all(busIds.map((busId) => requestDetail('object', busId))) }
      },
      apply: (entry, { attached, objects }, target) => {
        const before = Object.keys(target.edges).length
        const hasEnd = (busId, relId) => !!(relId ? target.edges[relId] : target.nodes[busId])
        objects.forEach(({ summary }) => {
          target.nodes[summary.id] ??= toNode(summary)
        })
        attached.forEach((e) => {
          if (hasEnd(e.from, e.fromRel) && hasEnd(e.to, e.toRel)) target.edges[e.id] ??= toEdge(e)
        })
        return Object.keys(target.edges).length - before
      },
    },
  }

  const recordExploration = (entry) => {
    const index = explorations.findIndex((item) => isEqual(item, entry))
    if (index < 0) {
      explorations = [...explorations, entry]
      return
    }
    const [siblings, others] = partition(
      explorations.slice(index + 1),
      (item) => item.kind === 'expand' && item.id === entry.id,
    )
    explorations = [...explorations.slice(0, index), ...siblings, entry, ...others]
  }

  const explore = async (entry) => {
    await inFlight.get('refresh')
    const epoch = graphEpoch
    const { fetch, apply } = explorers[entry.kind]
    const fetched = await fetch(entry)
    if (epoch !== graphEpoch) return STALE
    const result = apply(entry, fetched, rawGraph())
    recordExploration(entry)
    return result
  }

  const expand = exclusive(
    (id, direction, options = null) => `expand:${id}:${direction}:${JSON.stringify(options)}`,
    (id, direction, options = null) =>
      withLoading(async () => {
        cyRef.value?.getElementById(id).data('isExploring', true)
        errorMsg.value = ''
        try {
          const result = await explore({ kind: 'expand', id, direction, options })
          if (result === STALE) return
          lastExpansionMode.value = direction === 'to' ? 'backward' : 'forward'
          lastExpandedNodeId.value = id
          if (!doSyncGraph({ anchorId: id })) post({ type: 'notify', text: '새로 표시할 연결이 없습니다.' })
          showTruncated(id, result)
        } catch (e) {
          errorMsg.value = e.message
          cyRef.value?.nodes().data('isExploring', false)
        }
      }),
  )

  const expandDialogId = ref('')

  const submitExpandOptions = (options) => {
    const id = expandDialogId.value
    expandDialogId.value = ''
    expand(id, options.direction, options)
  }

  const showTruncated = (id, { truncated, limit }) => {
    if (!truncated) return
    notice.value = {
      title: `연결이 많아 방향별 ${limit}건까지만 표시했습니다. 나머지는 ID로 검색해 여세요.`,
      chips: [],
      items: [],
      action: { label: '조건 좁혀 펼치기', run: () => (expandDialogId.value = id) },
    }
  }

  const partialNote = (isPartial) => (isPartial ? ' 연결이 많은 객체는 일부 관계만 확인했습니다.' : '')

  const linkExisting = exclusive(
    (ids) => `link:${[...ids].sort().join(',')}`,
    (ids) =>
      withLoading(async () => {
        errorMsg.value = ''
        try {
          const result = await explore({ kind: 'link', ids })
          if (result === STALE) return
          const { added, isPartial } = result
          const text = added ? `기존 노드 사이의 관계 ${added}건을 연결했습니다.` : '새로 연결할 관계가 없습니다.'
          post({ type: 'notify', text: `${text}${partialNote(isPartial)}` })
          if (added) doSyncGraph()
        } catch (e) {
          errorMsg.value = e.message
        }
      }),
  )

  let graphEpoch = 0

  const resetGraph = () => {
    rawNodes = {}
    rawEdges = {}
    explorations = []
    rootId.value = ''
    graphFilter.value = ''
    lastExpandedNodeId.value = null
    resetClusters()
    resetRelations()
    clearDetail()
    doSyncGraph(null)
  }

  const clearGraph = () => {
    graphEpoch += 1
    resetGraph()
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

  const loadedAt = ref(0)
  const isStale = ref(false)

  const markLoaded = () => {
    loadedAt.value = Date.now()
    isStale.value = false
  }

  const loadRoot = exclusive(
    (id) => `root:${id}`,
    (id, record = true) =>
      withLoading(async () => {
        const epoch = ++graphEpoch
        errorMsg.value = ''
        try {
          const [{ summary }, early] = await Promise.all([
            requestDetail('object', id),
            plainIdPattern.test(id) ? request('expand', { id, direction: 'both' }) : null,
          ])
          const expansion = early ?? (await request('expand', { id: summary.id, direction: 'both' }))
          if (epoch !== graphEpoch) return false
          resetGraph()
          rootId.value = summary.id
          rawNodes[summary.id] = toNode(summary)
          const entry = { kind: 'expand', id: summary.id, direction: 'both', options: null }
          explorers.expand.apply(entry, expansion, rawGraph())
          explorations = [entry]
          markLoaded()
          lastExpansionMode.value = 'forward'
          if (record) recordHistory(summary)
          doSyncGraph({ fit: true })
          showTruncated(summary.id, expansion)
          return true
        } catch (e) {
          if (epoch === graphEpoch) errorMsg.value = e.message
          return false
        }
      }),
  )

  const describeNode = (n) => `${n.name} ${n.revision} (${n.type})`

  const diffGraphs = (before, after) => {
    const endName = (graph, id, relId) => (relId ? 'connection' : (graph.nodes[id]?.name ?? id))
    const describeEdge = (graph) => (e) =>
      `${endName(graph, e.from, e.fromRel)} → ${e.label} → ${endName(graph, e.to, e.toRel)}`
    const only = (items, others, kind, describe) =>
      Object.values(items)
        .filter((item) => !others[item.id])
        .map((item) => ({ id: item.id, kind, label: describe(item) }))
    const describeChange = (was, now) =>
      was.label === now.label
        ? `${describeNode(now)} · ${was.current} → ${now.current}`
        : `${describeNode(was)} → ${describeNode(now)}`
    return [
      ...only(after.nodes, before.nodes, 'added', describeNode),
      ...only(after.edges, before.edges, 'added', describeEdge(after)),
      ...only(before.nodes, after.nodes, 'removed', describeNode),
      ...only(before.edges, after.edges, 'removed', describeEdge(before)),
      ...Object.values(after.nodes)
        .filter((now) => before.nodes[now.id])
        .filter((now) => before.nodes[now.id].current !== now.current || before.nodes[now.id].label !== now.label)
        .map((now) => ({ id: now.id, kind: 'changed', label: describeChange(before.nodes[now.id], now) })),
    ]
  }

  const refresh = exclusive(
    () => 'refresh',
    async () => {
      if (!rootId.value || isLoading.value) return
      const epoch = graphEpoch
      const snapshot = explorations
      errorMsg.value = ''
      await withLoading(async () => {
        try {
          detailCache.clear()
          clearRequestCache()
          const [{ summary }, results] = await Promise.all([
            requestDetail('object', rootId.value),
            Promise.all(snapshot.map((entry) => explorers[entry.kind].fetch(entry).catch(() => null))),
          ])
          if (epoch !== graphEpoch) return
          const before = rawGraph()
          const after = { nodes: { [summary.id]: toNode(summary) }, edges: {} }
          const pending = snapshot
            .map((entry, index) => ({ entry, result: results[index] }))
            .filter((item) => item.result)
          const isExpandable = ({ entry }) => entry.kind === 'expand' && !!after.nodes[entry.id]
          while (pending.length) {
            const isBlocked = pending[0].entry.kind === 'expand' && !isExpandable(pending[0])
            const [{ entry, result }] = pending.splice(isBlocked ? Math.max(pending.findIndex(isExpandable), 0) : 0, 1)
            explorers[entry.kind].apply(entry, result, after)
          }
          const items = diffGraphs(before, after)
          const idsOf = (kind) => items.filter((item) => item.kind === kind).map((item) => item.id)
          const ghosts = captureGhosts(idsOf('removed'))
          rawNodes = after.nodes
          rawEdges = after.edges
          markLoaded()
          doSyncGraph(idsOf('added').length ? { reveal: false } : null)
          if (!items.length) {
            post({ type: 'notify', text: '새로고침했습니다. 달라진 내용이 없습니다.' })
            return
          }
          markDiff({ added: idsOf('added'), changed: idsOf('changed') }, ghosts)
          notice.value = { title: '새로고침 결과', chips: chipsOf(diffKinds, items.map((item) => item.kind)), items }
        } catch (e) {
          if (epoch === graphEpoch) errorMsg.value = e.message
        }
      })
    },
  )

  const highlightObjects = (ids) => {
    const found = ids.filter((id) => rawNodes[id] || rawEdges[id])
    highlightIds(found)
    post({ type: 'notify', text: `결과의 ID ${ids.length}개 중 ${found.length}개가 그래프에 있습니다.` })
  }

  const addObjects = exclusive(
    (ids) => `add:${ids.join(',')}`,
    guarded(async (ids) => {
      const fresh = ids.filter((id) => !rawNodes[id] && !rawEdges[id])
      if (!rootId.value && fresh.length && !(await loadRoot(fresh[0]))) return
      const targets = fresh.filter((id) => !rawNodes[id]).slice(0, ADD_LIMIT)
      if (!targets.length) {
        post({ type: 'notify', text: '그래프에 새로 추가할 객체가 없습니다.' })
        return
      }
      await withLoading(async () => {
        const added = await explore({ kind: 'add', ids: targets })
        if (added === STALE) return
        const linked = added.length ? await explore({ kind: 'link', ids: added }) : null
        if (linked === STALE) return
        const capped = fresh.length > ADD_LIMIT ? ` (한 번에 최대 ${ADD_LIMIT}개)` : ''
        post({ type: 'notify', text: `그래프에 객체 ${added.length}개를 추가했습니다.${capped}${partialNote(linked?.isPartial)}` })
        if (added.length) doSyncGraph({})
      })
    }),
  )

  const attachConnections = exclusive(
    (edgeId) => `attach:${edgeId}`,
    guarded((edgeId) =>
      withLoading(async () => {
        const added = await explore({ kind: 'attach', id: edgeId })
        if (added === STALE) return
        post({
          type: 'notify',
          text: added ? `connection에 붙은 연결 ${added}건을 그래프에 표시했습니다.` : '그래프에 표시할 연결이 없습니다.',
        })
        if (!added) return
        const { from, to } = rawEdges[edgeId] ?? {}
        if (from) pinNode(from)
        if (to) pinNode(to)
        doSyncGraph({})
      }),
    ),
  )

  const searchForm = reactive({ type: '', name: '', revision: '', where: '' })
  const searchResults = ref([])
  const searchLimit = ref(0)
  const searchWhere = ref('')
  const isSearching = ref(false)
  const isSearchPanelOpen = ref(false)

  const onSearch = async () => {
    const typeValue = searchForm.type.trim()
    if (objectIdPattern.test(typeValue) && !searchForm.name.trim()) {
      await loadRoot(typeValue)
      return
    }
    if (Object.values(searchForm).every((value) => !value.replaceAll('*', '').trim())) {
      errorMsg.value = 'Type · Name · Rev · Where 중 하나 이상에 * 이외의 검색어를 입력하세요.'
      return
    }
    isSearching.value = true
    errorMsg.value = ''
    try {
      const { results, limit } = await request('search', { ...searchForm })
      searchResults.value = results
      searchLimit.value = limit
      searchWhere.value = searchForm.where.trim()
      isSearchPanelOpen.value = true
      persist()
      if (results.length === 1) loadRoot(results[0].id)
    } catch (e) {
      errorMsg.value = e.message
    } finally {
      isSearching.value = false
    }
  }

  const addSearchCondition = ({ expression, type }) => {
    searchForm.where = [searchForm.where.trim(), expression].filter(Boolean).join(' && ')
    if (!searchForm.type.replaceAll('*', '').trim()) searchForm.type = type
    post({ type: 'notify', text: `검색 조건에 추가했습니다: ${expression}` })
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
    const isEdge = el.isEdge() || !!data.isJunction
    return { ...data, members, isNode: !isEdge, isEdge }
  }

  const showDetail = (el) => {
    const item = toSelectedItem(el)
    const method = item.isNode ? 'object' : 'connection'
    const id = item.originalId || item.id
    const isCluster = item.isCluster || item.inert || item.virtual || String(item.id).startsWith('edge-cluster')
    selectedItem.value = item
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
    if (target && tapped && target.same(tapped)) isDetailPanelOpen.value = true
    if (target) showDetail(target)
    else if (selectedItem.value && !cy.getElementById(selectedItem.value.id).length) clearDetail()
  }, 16)

  const locateSelected = () => {
    if (focusElement(selectedItem.value?.id)) return
    post({ type: 'notify', text: '관계 필터로 숨겨져 있어 그래프에서 찾을 수 없습니다.' })
  }

  const revealSelected = () => {
    if (selectedItem.value) revealElement(selectedItem.value.id)
  }

  const { run: runInConsole, writeCount } = useMqlConsole()

  watch(writeCount, () => {
    isStale.value = true
    detailCache.clear()
    clearRequestCache()
  })

  const onApplied = async (createdIds = [], connected = []) => {
    const fresh = createdIds.filter((id) => !rawNodes[id])
    if (fresh.length) await addObjects(fresh)
    connected
      .filter(({ from, to }) => rawNodes[from] && rawNodes[to])
      .forEach(({ from, to, relType }) => recordExploration({ kind: 'connect', from, to, relType }))
    await refresh()
  }

  const basket = useChangeBasket(connection, onApplied, () => ({
    name: rootItem.value ? `${rootItem.value.name} ${rootItem.value.revision}` : '3d-mql',
    user: context.value.user,
  }))

  watch(basket.overlay, () => doSyncGraph(null))

  const nameOf = (id) => {
    const node = rawNodes[id] ?? basket.createOf(id)?.params.object
    return node ? `${node.name} ${node.revision}` : id
  }

  const policyOf = async (id) => {
    const { basics } = await requestDetail('object', id)
    return basics.find((field) => field.key === 'policy')?.value
  }

  const changeMeta = {
    connect: ({ from, to, relType }) => ({
      label: `connect · ${nameOf(from)} → ${relType} → ${nameOf(to)}`,
      edge: { from, to, relType },
      trigger: { source: { relationship: relType }, prefix: 'Create' },
    }),
    disconnect: ({ id, from, to, relType }) => ({
      label: `disconnect · ${nameOf(from)} → ${relType} → ${nameOf(to)}`,
      marks: [id],
      trigger: { source: { relationship: relType }, prefix: 'Delete' },
    }),
    modify: ({ target, id, fields, relType }) => ({
      label: `modify · ${target === 'connection' ? relType : nameOf(id)} · ${uniq(fields.map((field) => field.key)).join(', ')}`,
      marks: [id],
      trigger: {
        source: target === 'connection' ? { relationship: relType } : { type: rawNodes[id]?.type },
        prefix: uniq(fields.map((field) => (field.isAttribute ? 'ModifyAttribute' : modifyEvents[field.key]))),
      },
    }),
    create: ({ object }) => ({
      label: `create · ${object.name} ${object.revision} (${object.type})`,
      node: {
        ...pick(object, ['type', 'name', 'revision']),
        current: '',
        label: `${object.name} ${object.revision}\n(${object.type})`,
      },
      trigger: { source: { type: object.type }, prefix: 'Create' },
    }),
    delete: ({ id, connections }) => ({
      label: `delete · ${nameOf(id)}${connections ? ` · 연결 ${connections}건 함께 삭제` : ''}`,
      marks: [id],
      trigger: { source: { type: rawNodes[id]?.type }, prefix: 'Delete' },
    }),
  }

  const stateMeta = async ({ kind, id, signature }) => ({
    label: [kind, nameOf(id), signature].filter(Boolean).join(' · '),
    marks: [id],
    trigger: { source: { policy: await policyOf(id) }, state: rawNodes[id]?.current, prefix: upperFirst(kind) },
  })

  const metaOf = async (params) => ({ kind: params.kind, ...(await (changeMeta[params.kind] ?? stateMeta)(params)) })

  const stageChange = guarded(async (params) => basket.stageChange(params, await metaOf(params)))

  const restorableAttributes = async (attributes) => {
    const metas = await cachedRequest('attributes', { names: attributes.map((field) => field.key) }).catch(() => [])
    return attributes.filter((field, index) => field.value || metas[index]?.default)
  }

  const stageDisconnect = exclusive(
    (id) => `disconnect:${id}`,
    guarded(async (id) => {
      const { from, to, fromRel, toRel, label } = rawEdges[id]
      const { attributes } = await requestDetail('connection', id)
      await stageChange({
        kind: 'disconnect',
        id,
        from,
        to,
        fromRel,
        toRel,
        relType: label,
        attributes: await restorableAttributes(attributes),
      })
    }),
  )

  const connectDialog = shallowRef(null)

  const submitConnect = (params) => {
    connectDialog.value = null
    stageChange({ kind: 'connect', ...params })
  }

  const editTarget = shallowRef(null)

  const openEdit = (item, focus = null) => {
    const target = item.isEdge ? 'connection' : 'bus'
    const id = item.originalId || item.id
    const staged = basket.pendingChanges.value.find(
      (change) => change.kind === 'modify' && change.params?.target === target && change.params.id === id,
    )
    editTarget.value = {
      target,
      id,
      relType: item.label,
      title: item.isEdge ? item.label : `${item.name} ${item.revision} (${item.type})`,
      focus,
      staged: staged?.params.fields ?? [],
      key: staged?.key,
      detail: detailCache.get(`${item.isEdge ? 'connection' : 'object'}:${id}`),
    }
  }

  const editSelected = (focus) => {
    if (selectedItem.value) openEdit(selectedItem.value, focus)
  }

  const submitEdit = guarded(async ({ fields }) => {
    const { target, id, relType, key } = editTarget.value
    editTarget.value = null
    const params = { kind: 'modify', target, id, relType, fields }
    if (!key) return stageChange(params)
    if (!fields.length) return basket.removeChange(key)
    await basket.updateChange(key, params, await metaOf(params))
  })

  const relationOptions = () => ({
    edges: Object.values(rawEdges),
    relations: uniq(relationFilterState.relations.value.map((relation) => relation.label)),
  })

  const createDialog = shallowRef(null)

  const openCreate = (anchor = null, key = null) => {
    createDialog.value = {
      ...relationOptions(),
      anchor,
      key,
      draft: key ? basket.createOf(pendingId(key))?.params.object : null,
      defaults: { vault: context.value.vault, owner: context.value.user },
    }
  }

  const restageDependents = async (key) => {
    for (const change of basket.dependentsOf(key).filter(isPending)) {
      await basket.updateChange(change.key, change.params, await metaOf(change.params))
    }
  }

  const submitCreate = guarded(async ({ object, link }) => {
    const { key, anchor } = createDialog.value
    createDialog.value = null
    const params = { kind: 'create', object }
    if (key) {
      await basket.updateChange(key, params, await metaOf(params))
      await restageDependents(key)
      return
    }
    const createdKey = await stageChange(params)
    if (!link || !createdKey) return
    const ends = [anchor.id, pendingId(createdKey)]
    const [from, to] = link.isAnchorFrom ? ends : ends.reverse()
    await stageChange({ kind: 'connect', from, to, relType: link.relType, attributes: link.attributes })
  })

  const editPending = (id) => openCreate(null, pendingKey(id))

  const removePending = (id) => basket.removeChange(pendingKey(id))

  const stageDelete = exclusive(
    (id) => `delete:${id}`,
    guarded(async (id) => {
      if (id === rootId.value) {
        throw new Error('기준 객체는 삭제 문장을 담을 수 없습니다. 다른 객체를 기준 객체로 연 뒤 담으세요.')
      }
      if (basket.pendingChanges.value.some((change) => change.kind === 'delete' && change.params?.id === id)) {
        post({ type: 'notify', text: '이 객체의 삭제 문장이 이미 바구니에 있습니다.' })
        return
      }
      const [{ summary, basics, attributes }, connections] = await Promise.all([
        request('object', { id }),
        request('connectionCount', { id }),
      ])
      const valueOf = (key) => basics.find((field) => field.key === key)?.value ?? ''
      const object = {
        ...pick(summary, ['type', 'name', 'revision']),
        policy: valueOf('policy'),
        vault: valueOf('vault'),
        fields: basics.filter((field) => restoreFields.includes(field.key)),
        attributes: await restorableAttributes(attributes),
      }
      await stageChange({ kind: 'delete', id, object, connections })
    }),
  )

  const refreshSelectedCluster = () => {
    const el = cyRef.value?.getElementById(selectedItem.value?.id)
    selectedItem.value = el?.length ? toSelectedItem(el) : null
  }

  const clusterLayout = (cluster) => ({ anchorId: cluster?.clusterKey?.split('::')[0], originId: cluster?.id })

  const pinClusterMember = (id) => {
    pinNode(id)
    doSyncGraph(clusterLayout(selectedItem.value))
    refreshSelectedCluster()
  }

  const expandCluster = (clusterKey) => {
    toggleCluster(clusterKey)
    doSyncGraph(clusterLayout(selectedItem.value))
    refreshSelectedCluster()
  }

  const onNodeDblTap = (evt) => {
    const node = evt.target
    if (node.data('isJunction') || node.data('inert')) return
    if (node.data('isCluster')) {
      toggleCluster(node.data('clusterKey'))
      doSyncGraph(clusterLayout(node.data()))
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

  const runQuery = exclusive(
    (method, action, targets) => `${method}:${action}:${JSON.stringify(targets)}`,
    async (method, action, targets) => {
      if (!targets.length) return
      try {
        const text = await request(method, { action, targets })
        if (method === 'query') await runInConsole(text)
      } catch (e) {
        errorMsg.value = e.message
      }
    },
  )

  const targetData = (el) => ({ ...el.data(), id: el.data('originalId') || el.id() })

  const pathTargets = (menu) => {
    const pathTo = menu.target.id()
    const id = menu.kind === 'multi' ? menu.targets.find((t) => t.id() !== pathTo).id() : rootId.value
    const path = pathExpression(id, pathTo)
    if (!path) errorMsg.value = '두 객체를 잇는 실제 관계 경로가 현재 그래프에 보이지 않아 select 식을 만들 수 없습니다.'
    return path ? [{ id, path, pathTo }] : []
  }

  const compareItems = ref([])

  const showPath = ([sourceId, targetId]) => {
    if (!findPath(sourceId, targetId)) errorMsg.value = '현재 그래프에 보이는 관계로는 두 객체가 연결되어 있지 않습니다.'
  }

  const openConnectDialog = (items) => {
    connectDialog.value = { items, ...relationOptions() }
  }

  const onContextAction = (action) => {
    const menu = contextMenu.value
    hideContextMenu()
    if (!menu) return
    const { id } = targetData(menu.target)
    const [prefix, query] = action.split(':')
    if (query?.startsWith('path')) runQuery(queryMethods[prefix], query, pathTargets(menu))
    else if (query) runQuery(queryMethods[prefix], query, menu.targets.map(targetData))
    else if (action === 'expand') expand(id, 'from')
    else if (action === 'whereUsed') expand(id, 'to')
    else if (action === 'expandOptions') expandDialogId.value = id
    else if (action === 'setRoot') loadRoot(id)
    else if (action === 'linkExisting') linkExisting(menu.targets.map((t) => t.id()))
    else if (action === 'compare') compareItems.value = menu.targets.map((t) => t.data())
    else if (action === 'findPath') showPath(menu.targets.map((t) => t.id()))
    else if (action === 'connect') openConnectDialog(menu.targets.map((t) => t.data()))
    else if (action === 'disconnect') stageDisconnect(id)
    else if (action === 'edit') openEdit(toSelectedItem(menu.target))
    else if (action === 'createLinked') openCreate(menu.target.data())
    else if (action === 'delete') stageDelete(id)
    else if (action === 'editPending') editPending(id)
    else if (action === 'removePending') removePending(id)
  }

  let isStateDirty = false
  let idleWrite = 0

  const writeState = () => {
    const cy = cyRef.value
    isStateDirty = false
    setState({
      rawNodes,
      rawEdges,
      explorations,
      loadedAt: loadedAt.value,
      changes: basket.changes.value,
      rootId: rootId.value,
      searchForm: { ...searchForm },
      searchResults: searchResults.value,
      searchLimit: searchLimit.value,
      searchWhere: searchWhere.value,
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
  }

  const writeWhenIdle = debounce(() => {
    cancelIdleCallback(idleWrite)
    idleWrite = requestIdleCallback(writeState, { timeout: 1000 })
  }, 300)

  const persist = () => {
    isStateDirty = true
    writeWhenIdle()
  }

  const flushState = () => {
    if (isStateDirty) writeState()
  }

  useEventListener(window, 'pagehide', flushState)
  watch([searchForm, isSearchPanelOpen, hiddenRelations, relationFilter, graphFilter, selectedItem], persist)
  watch(basket.changes, persist, { deep: true })

  const restoreLayout = ({ positions, viewport, detailId }) => {
    const cy = cyRef.value
    cy.batch(() => cy.nodes().forEach((n) => positions[n.id()] && n.position(positions[n.id()])))
    if (viewport) cy.viewport(viewport)
    const el = detailId && cy.getElementById(detailId)
    if (el?.length) showDetail(el)
  }

  const ownExpansions = () =>
    uniqWith(
      Object.values(rawEdges).map((e) => ({
        kind: 'expand',
        id: e.isReverse ? e.to : e.from,
        direction: e.isReverse ? 'to' : 'from',
        options: null,
      })),
      isEqual,
    )

  const restore = () => {
    const saved = getState()
    if (!saved) return
    rawNodes = saved.rawNodes
    rawEdges = saved.rawEdges
    explorations = saved.explorations ?? ownExpansions()
    loadedAt.value = saved.loadedAt ?? 0
    isStale.value = !!saved.rootId
    basket.changes.value = saved.changes ?? []
    rootId.value = saved.rootId
    Object.assign(searchForm, saved.searchForm)
    searchResults.value = saved.searchResults
    searchLimit.value = saved.searchLimit
    searchWhere.value = saved.searchWhere ?? ''
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
    cyRef,
    cyContainer,
    graphFilter,
    hasElements,
    tooltip,
    contextMenu,
    hideTooltip,
    hideContextMenu,
    errorMsg,
    connection,
    context,
    reconnect,
    isLoading,
    searchForm,
    searchResults,
    searchLimit,
    searchWhere,
    isSearching,
    isSearchPanelOpen,
    onSearch,
    addSearchCondition,
    loadRoot,
    expand,
    clearGraph,
    refresh,
    loadedAt,
    isStale,
    notice,
    clearNotice,
    focusNotice,
    highlightObjects,
    addObjects,
    attachConnections,
    resetView,
    fitView,
    layoutType,
    selectedItem,
    selectionCount,
    locateSelected,
    revealSelected,
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
    basket,
    stageChange,
    stageDisconnect,
    connectDialog,
    submitConnect,
    editTarget,
    editSelected,
    submitEdit,
    createDialog,
    openCreate,
    submitCreate,
    editPending,
    removePending,
  }
}

import { groupBy, omit, partition } from 'lodash-es'

const truncateLabel = (str, maxLength = 23) => {
  if (!str) return ''
  return str
    .split('\n')
    .map((line) =>
      line
        .split(' ')
        .map((word) => (word.length <= maxLength ? word : word.slice(0, maxLength) + '...'))
        .join(' '),
    )
    .join('\n')
}

export const toDisplayLabel = (label) => truncateLabel((label || '').replace(/([_-])/g, '$1 '))

const buildClusterKey = (nodeId, label) => `${nodeId}::${label}`

const seedPosition = (positions, id, seedPos, spread) =>
  positions[id] || {
    x: seedPos.x + (Math.random() - 0.5) * spread,
    y: seedPos.y + (Math.random() - 0.5) * spread,
  }

const lastExpandedFlags = (id, { lastExpandedNodeId, lastExpansionMode }) => ({
  isLastExpandedForward: lastExpandedNodeId === id && lastExpansionMode === 'forward',
  isLastExpandedBackward: lastExpandedNodeId === id && lastExpansionMode === 'backward',
})

const midIdOf = (relId) => `mid-${relId}`

const pruneDangling = (elems) => {
  const nodeIds = new Set(elems.filter((el) => el.group === 'nodes').map((el) => el.data.id))
  const linked = elems.filter((el) => el.group === 'nodes' || (nodeIds.has(el.data.source) && nodeIds.has(el.data.target)))
  const edgeIds = new Set(linked.filter((el) => el.group === 'edges').map((el) => el.data.id))
  const hasHalves = (el) => edgeIds.has(`head-${el.data.originalId}`) && edgeIds.has(`tail-${el.data.originalId}`)
  const kept = linked.filter((el) => !el.data.isJunction || hasHalves(el))
  return kept.length === elems.length ? kept : pruneDangling(kept)
}

export const processRadialElems = (rawNodes, rawEdges, rootId, positions, seedPos, options) => {
  const { expandedClusters, pinnedNodes, CLUSTER_THRESHOLD } = options
  const elems = []
  const edges = Object.values(rawEdges)
  const midIds = new Set(edges.flatMap((e) => [e.fromRel, e.toRel]).filter(Boolean))
  const isPlain = (e) => !midIds.has(e.id) && !e.fromRel && !e.toRel
  const [reverseEdges, forwardEdges] = partition(edges.filter(isPlain), 'isReverse')
  const edgesBySourceLabel = groupBy(forwardEdges, (e) => buildClusterKey(e.from, e.label))
  const edgesByTargetLabel = groupBy(reverseEdges, (e) => buildClusterKey(e.to, e.label))
  const clusteredEdgeIds = new Set()
  const clusteredCount = {}
  const totalCount = {}

  edges.forEach((e) => {
    totalCount[e.to] = (totalCount[e.to] || 0) + 1
    totalCount[e.from] = (totalCount[e.from] || 0) + 1
  })

  const addCluster = (key, allEdges, isReverse) => {
    if (allEdges.length < CLUSTER_THRESHOLD || expandedClusters.has(key)) return
    const group = allEdges.filter((e) => !pinnedNodes.has(isReverse ? e.from : e.to))
    if (!group.length) return
    const first = group[0]
    const anchorId = isReverse ? first.to : first.from
    if (!rawNodes[anchorId]) return
    const memberIds = group.map((e) => (isReverse ? e.from : e.to))
    group.forEach((e) => clusteredEdgeIds.add(e.id))
    memberIds.forEach((id) => (clusteredCount[id] = (clusteredCount[id] || 0) + 1))
    const clusterId = `${isReverse ? 'cluster-rev' : 'cluster'}-${key}`
    const name = first.displayName || first.label || ''
    elems.push({
      group: 'nodes',
      data: {
        id: clusterId,
        label: `${isReverse ? 'Referenced By: ' : ''}${name}\n(${group.length})`,
        isCluster: true,
        clusterKey: key,
        clusterCount: group.length,
        childNodeIds: memberIds,
        displayLabel: `${isReverse ? 'Referenced By:\n' : ''}${toDisplayLabel(name)}\n(${group.length})`,
        type: rawNodes[memberIds[0]]?.type,
        originalId: clusterId,
        ...lastExpandedFlags(clusterId, options),
      },
      position: { ...seedPosition(positions, clusterId, seedPos, isReverse ? 40 : 20) },
    })
    elems.push({
      group: 'edges',
      data: {
        id: `edge-${clusterId}`,
        source: isReverse ? clusterId : anchorId,
        target: isReverse ? anchorId : clusterId,
        label: first.label,
        displayName: name,
        originalId: `edge-${clusterId}`,
        isReverse,
      },
    })
  }

  Object.entries(edgesBySourceLabel).forEach(([key, group]) => addCluster(key, group, false))
  Object.entries(edgesByTargetLabel).forEach(([key, group]) => addCluster(key, group, true))

  Object.values(rawNodes).forEach((n) => {
    if (n.id !== rootId && !n.isLoose && (totalCount[n.id] || 0) === (clusteredCount[n.id] || 0)) return
    elems.push({
      group: 'nodes',
      data: {
        ...n,
        displayLabel: toDisplayLabel(n.label),
        originalId: n.id,
        ...lastExpandedFlags(n.id, options),
      },
      position: { ...seedPosition(positions, n.id, seedPos, 20) },
    })
  })

  edges.forEach((e) => {
    if (clusteredEdgeIds.has(e.id)) return
    const source = e.fromRel ? midIdOf(e.fromRel) : e.from
    const target = e.toRel ? midIdOf(e.toRel) : e.to
    if (!midIds.has(e.id)) {
      elems.push({ group: 'edges', data: { ...e, source, target, originalId: e.id } })
      return
    }
    const midId = midIdOf(e.id)
    const ends = [positions[source], positions[target]]
    const center = ends.every(Boolean) ? { x: (ends[0].x + ends[1].x) / 2, y: (ends[0].y + ends[1].y) / 2 } : seedPos
    elems.push({
      group: 'nodes',
      data: {
        ...omit(e, ['source', 'target']),
        id: midId,
        originalId: e.id,
        isJunction: true,
        displayLabel: toDisplayLabel(e.label),
      },
      position: { ...seedPosition(positions, midId, center, 0) },
    })
    elems.push({ group: 'edges', data: { ...e, id: `head-${e.id}`, source, target: midId, originalId: e.id, isSplit: true } })
    elems.push({
      group: 'edges',
      data: { ...e, id: `tail-${e.id}`, source: midId, target, originalId: e.id, isSplit: true, isTail: true },
    })
  })

  return pruneDangling(elems)
}

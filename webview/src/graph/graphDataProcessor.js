import { groupBy, partition } from 'lodash-es'

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

const toDisplayLabel = (label) => truncateLabel((label || '').replace(/([_-])/g, '$1 '))

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

export const processRadialElems = (rawNodes, rawEdges, rootId, positions, seedPos, options) => {
  const { expandedClusters, CLUSTER_THRESHOLD } = options
  const elems = []
  const nodeIds = new Set()
  const edges = Object.values(rawEdges)
  const [reverseEdges, forwardEdges] = partition(edges, 'isReverse')
  const edgesBySourceLabel = groupBy(forwardEdges, (e) => buildClusterKey(e.from, e.label))
  const edgesByTargetLabel = groupBy(reverseEdges, (e) => buildClusterKey(e.to, e.label))
  const clusteredEdgeIds = new Set()
  const clusteredCount = {}
  const totalCount = {}

  edges.forEach((e) => {
    totalCount[e.to] = (totalCount[e.to] || 0) + 1
    totalCount[e.from] = (totalCount[e.from] || 0) + 1
  })

  const addCluster = (key, group, isReverse) => {
    if (group.length < CLUSTER_THRESHOLD || expandedClusters.has(key)) return
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
    nodeIds.add(clusterId)
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
    if (n.id !== rootId && (totalCount[n.id] || 0) === (clusteredCount[n.id] || 0)) return
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
    nodeIds.add(n.id)
  })

  edges.forEach((e) => {
    if (!clusteredEdgeIds.has(e.id) && nodeIds.has(e.from) && nodeIds.has(e.to)) {
      elems.push({ group: 'edges', data: { ...e, originalId: e.id } })
    }
  })

  return elems.filter((el) => el.group === 'nodes' || (nodeIds.has(el.data.source) && nodeIds.has(el.data.target)))
}

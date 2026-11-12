export const EDGE_LENGTH = 120
export const LARGE_GRAPH_NODES = 1000

export const getLayoutOptions = (layoutType, nodeCount = 0) => {
  if (layoutType === 'flow-tb' || layoutType === 'flow-lr') {
    return {
      name: 'dagre',
      rankDir: layoutType === 'flow-tb' ? 'TB' : 'LR',
      nodeSep: 50,
      rankSep: 100,
      spacingFactor: 1.2,
      nodeDimensionsIncludeLabels: true,
    }
  }

  return {
    name: 'fcose',
    quality: 'default',
    nodeDimensionsIncludeLabels: true,
    nodeRepulsion: 4500,
    idealEdgeLength: EDGE_LENGTH,
    edgeElasticity: 0.45,
    nestingFactor: 0.1,
    gravity: 0.25,
    numIter: nodeCount > LARGE_GRAPH_NODES ? 300 : 1000,
  }
}

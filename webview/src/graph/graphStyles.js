export const getCytoscapeStyle = (isDarkVal) => [
  {
    selector: 'node',
    style: {
      content: 'data(displayLabel)',
      'text-valign': 'center',
      'text-halign': 'center',
      'background-color': '#61afef',
      color: '#fff',
      'font-size': '12px',
      'min-zoomed-font-size': 5,
      width: 180,
      height: 50,
      padding: '12px',
      shape: 'round-rectangle',
      'text-wrap': 'wrap',
      'text-max-width': 160,
      'text-overflow': 'ellipsis',
      'border-width': 2,
      'border-color': '#4b8bca',
      'transition-property': 'background-color, line-color, target-arrow-color',
      'transition-duration': '0.3s',
      opacity: 1,
    },
  },
  {
    selector: 'node[color]',
    style: {
      'background-color': 'data(color)',
      'border-color': 'data(color)',
    },
  },
  {
    selector: 'node[?isExploring]',
    style: {
      'border-width': 4,
      'border-color': '#e5c07b',
      'border-style': 'dashed',
    },
  },
  {
    selector: 'edge',
    style: {
      label: 'data(displayName)',
      'font-size': '9px',
      'min-zoomed-font-size': 5,
      color: isDarkVal ? '#abb2bf' : '#4b5563',
      width: 1.5,
      'line-color': isDarkVal ? '#4b5563' : '#d1d5db',
      'target-arrow-color': isDarkVal ? '#4b5563' : '#d1d5db',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      'text-rotation': 'autorotate',
      'text-background-opacity': 0.8,
      'text-background-color': isDarkVal ? '#282c34' : '#ffffff',
      'text-background-padding': '2px',
      opacity: 1,
    },
  },
  {
    selector: 'node[?isRoot]',
    style: {
      'border-width': 4,
      'border-color': '#e06c75',
      'font-weight': 'bold',
      opacity: 1,
    },
  },
  {
    selector: 'node[?isCluster]',
    style: {
      shape: 'round-rectangle',
      'background-color': isDarkVal ? '#5c6370' : '#e5e7eb',
      color: isDarkVal ? '#e5c07b' : '#92400e',
      'border-width': 3,
      'border-color': isDarkVal ? '#e5c07b' : '#f59e0b',
      'border-style': 'dashed',
      'font-weight': 'bold',
      'font-size': '11px',
      width: 200,
      height: 50,
      opacity: 1,
    },
  },
  {
    selector: 'node[?isLastExpandedForward]',
    style: {
      'border-width': 4,
      'border-color': '#61afef',
      'background-color': '#E1F5FE',
      color: '#0277BD',
      'border-style': 'solid',
      opacity: 1,
    },
  },
  {
    selector: 'node[?isLastExpandedBackward]',
    style: {
      'border-width': 4,
      'border-color': isDarkVal ? '#56b6c2' : '#0891b2',
      'background-color': isDarkVal ? '#2c3e50' : '#E0F7FA',
      color: isDarkVal ? '#56b6c2' : '#006064',
      'border-style': 'solid',
      opacity: 1,
    },
  },
  {
    selector: 'node:selected',
    style: {
      'border-width': 4,
      'border-color': '#ff7a00',
      'border-style': 'solid',
      'z-index': 1000,
    },
  },
  {
    selector: 'edge:selected',
    style: {
      width: 3,
      'line-color': '#ff7a00',
      'target-arrow-color': '#ff7a00',
      'z-index': 999,
    },
  },
  {
    selector: 'edge[?isReverse]',
    style: {
      'line-color': isDarkVal ? '#56b6c2' : '#0891b2',
      'target-arrow-color': isDarkVal ? '#56b6c2' : '#0891b2',
      'line-style': 'dashed',
      'line-dash-pattern': [6, 3],
      width: 2,
    },
  },
  {
    selector: 'node.search-match, edge.search-match',
    style: {
      opacity: 1,
      'z-index': 999,
    },
  },
  {
    selector: 'node.search-neighbor, edge.search-neighbor',
    style: {
      opacity: 0.6,
      'z-index': 998,
    },
  },
  {
    selector: 'node.search-dimmed, edge.search-dimmed',
    style: {
      opacity: 0.1,
      'z-index': 1,
    },
  },
  {
    selector: 'node.hover-dimmed, edge.hover-dimmed, node.path-dimmed, edge.path-dimmed',
    style: {
      opacity: 0.1,
    },
  },
  {
    selector: 'node.hover-match, edge.hover-match',
    style: {
      opacity: 1,
      'z-index': 999,
    },
  },
  {
    selector: 'node.path-match',
    style: {
      opacity: 1,
      'border-width': 4,
      'border-color': '#c678dd',
      'border-style': 'solid',
      'z-index': 999,
    },
  },
  {
    selector: 'edge.path-match',
    style: {
      opacity: 1,
      width: 4,
      'line-color': '#c678dd',
      'target-arrow-color': '#c678dd',
      'z-index': 999,
    },
  },
  {
    selector: '.filtered-out',
    style: {
      display: 'none',
    },
  },
]

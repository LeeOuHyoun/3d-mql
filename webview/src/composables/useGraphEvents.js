const kindOf = (target, isJunction) => {
  if (target.data('isPending')) return target.isNode() ? 'pendingNode' : 'pendingEdge'
  if (target.isEdge() || isJunction) return 'edge'
  return target.data('isCluster') ? 'cluster' : 'node'
}

export function useGraphEvents() {
  const tooltip = shallowRef(null)
  const contextMenu = shallowRef(null)

  const hideTooltip = () => {
    tooltip.value = null
  }

  const hideContextMenu = () => {
    contextMenu.value = null
  }

  const bindGraphEvents = (cy, container, { onNodeDblTap, onElementTap, onSelect, onUnselect }) => {
    const containerRect = () => container.value.getBoundingClientRect()

    const showNodeTooltip = (node) => {
      const rect = containerRect()
      const box = node.renderedBoundingBox({ includeLabels: false })
      tooltip.value = { x: rect.left + (box.x1 + box.x2) / 2, y: rect.top + box.y1, data: node.data() }
    }

    cy.on('dbltap', 'node', onNodeDblTap)
    cy.on('tap', 'node, edge', onElementTap)
    cy.on('select', 'node, edge', onSelect)
    cy.on('unselect', 'node, edge', onUnselect)
    cy.on('mouseover', 'node', (evt) => showNodeTooltip(evt.target))
    cy.on('mouseout', 'node', hideTooltip)
    cy.on('grab', 'node', hideTooltip)
    cy.on('zoom pan', () => {
      hideTooltip()
      hideContextMenu()
    })
    cy.on('tapstart', hideContextMenu)
    cy.on('cxttap', 'node, edge', (evt) => {
      const target = evt.target
      const isPending = !!target.data('isPending')
      if (target.id().startsWith('edge-cluster') || (target.data('inert') && !isPending) || target.data('virtual')) return
      const isJunction = !!target.data('isJunction')
      const selected = cy.nodes(':selected').filter((n) => !n.data('isCluster') && !n.data('isJunction'))
      const isMulti = target.isNode() && !isJunction && target.selected() && selected.length > 1
      const kind = isMulti ? 'multi' : kindOf(target, isJunction)
      const rect = containerRect()
      hideTooltip()
      contextMenu.value = {
        x: rect.left + evt.renderedPosition.x,
        y: rect.top + evt.renderedPosition.y,
        target,
        kind,
        targets: isMulti ? selected.toArray() : [target],
      }
    })
  }

  return {
    tooltip,
    contextMenu,
    bindGraphEvents,
    hideTooltip,
    hideContextMenu,
  }
}

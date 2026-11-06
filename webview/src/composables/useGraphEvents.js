export function useGraphEvents() {
  const tooltip = shallowRef(null)
  const contextMenu = shallowRef(null)

  const hideTooltip = () => {
    tooltip.value = null
  }

  const hideContextMenu = () => {
    contextMenu.value = null
  }

  const bindGraphEvents = (cy, container, { onNodeDblTap, onSelect, onUnselect }) => {
    const containerRect = () => container.value.getBoundingClientRect()

    const showNodeTooltip = (node) => {
      const rect = containerRect()
      const box = node.renderedBoundingBox({ includeLabels: false })
      tooltip.value = { x: rect.left + (box.x1 + box.x2) / 2, y: rect.top + box.y1, data: node.data() }
    }

    cy.on('dbltap', 'node', onNodeDblTap)
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
    cy.on('cxttap', 'node', (evt) => {
      const node = evt.target
      if (node.data('isCluster')) return
      const rect = containerRect()
      hideTooltip()
      contextMenu.value = { x: rect.left + evt.renderedPosition.x, y: rect.top + evt.renderedPosition.y, node }
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

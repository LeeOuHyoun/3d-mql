import { countBy, debounce, sortBy, uniqBy, union, without, xor } from 'lodash-es'

const palette = ['#3b82f6', '#16a34a', '#d97706', '#9333ea', '#dc2626', '#0891b2', '#c2410c', '#4f46e5', '#db2777', '#65a30d']
const edgeKey = (e) => (e.data('isReverse') ? `rev:${e.data('label')}` : e.data('label'))
const valueOf = (node, field) => node.data(field) || '-'

export function useRelationFilter(cyRef, rootId) {
  const relations = ref([])
  const hiddenRelations = ref([])
  const relationFilter = ref('')

  const updateRelations = () => {
    const edges = cyRef.value.edges()
    const counts = countBy(edges.map(edgeKey))
    const items = edges.map((e) => ({ key: edgeKey(e), label: e.data('label'), isReverse: !!e.data('isReverse') }))
    relations.value = sortBy(uniqBy(items, 'key'), ['label', 'isReverse']).map((item) => ({
      ...item,
      count: counts[item.key],
    }))
  }

  const applyVisibility = () => {
    const cy = cyRef.value
    if (!cy) return
    const hidden = new Set(hiddenRelations.value)
    const isHidden = (e) => hidden.has(edgeKey(e))
    cy.batch(() => {
      cy.elements('.filtered-out').removeClass('filtered-out')
      if (!hidden.size) return
      const edges = cy.edges().filter(isHidden)
      const nodes = cy.nodes().filter((n) => n.id() !== rootId.value && n.connectedEdges().every(isHidden))
      edges.union(nodes).addClass('filtered-out')
    })
  }

  const filteredRelations = computed(() => {
    const query = relationFilter.value.toLowerCase().trim()
    return query ? relations.value.filter((r) => r.label.toLowerCase().includes(query)) : relations.value
  })

  const toggleRelation = (key) => {
    hiddenRelations.value = xor(hiddenRelations.value, [key])
  }

  const showOnlyRelation = (key) => {
    hiddenRelations.value = relations.value.map((r) => r.key).filter((k) => k !== key)
  }

  const setAllRelations = (visible) => {
    const keys = filteredRelations.value.map((r) => r.key)
    hiddenRelations.value = visible ? without(hiddenRelations.value, ...keys) : union(hiddenRelations.value, keys)
  }

  const resetRelations = () => {
    hiddenRelations.value = []
    relationFilter.value = ''
  }

  watch(hiddenRelations, applyVisibility)

  const colorBy = useStorage('3d-mql-color-by', 'none')
  const legend = ref([])

  const applyColors = () => {
    const cy = cyRef.value
    if (!cy) return
    const nodes = cy.nodes().filter((n) => !n.data('isCluster'))
    const field = colorBy.value
    if (field === 'none') {
      cy.nodes('[color]').removeData('color')
      legend.value = []
      return
    }
    const counts = countBy(nodes.map((n) => valueOf(n, field)))
    const values = sortBy(Object.keys(counts))
    const colors = Object.fromEntries(values.map((value, i) => [value, palette[i % palette.length]]))
    cy.batch(() =>
      nodes.forEach((n) => {
        const color = colors[valueOf(n, field)]
        if (n.data('color') !== color) n.data('color', color)
      }),
    )
    legend.value = values.map((value) => ({ value, color: colors[value], count: counts[value] }))
  }

  watch(colorBy, applyColors)

  const applyHighlight = debounce((select) => {
    const cy = cyRef.value
    if (!cy) return
    const matched = select?.(cy)
    cy.batch(() => {
      cy.elements('.hover-match, .hover-dimmed').removeClass('hover-match hover-dimmed')
      if (!matched) return
      cy.elements().not(matched).addClass('hover-dimmed')
      matched.addClass('hover-match')
    })
  }, 40)

  const highlightRelation = (key) =>
    applyHighlight((cy) => {
      const edges = cy.edges().filter((e) => edgeKey(e) === key)
      return edges.union(edges.connectedNodes())
    })

  const highlightLegend = (value) =>
    applyHighlight((cy) => cy.nodes().filter((n) => !n.data('isCluster') && valueOf(n, colorBy.value) === value))

  const clearHighlight = () => applyHighlight(null)

  const refreshRelations = () => {
    if (!cyRef.value) return
    updateRelations()
    applyVisibility()
    applyColors()
  }

  return {
    relations,
    filteredRelations,
    hiddenRelations,
    relationFilter,
    toggleRelation,
    showOnlyRelation,
    setAllRelations,
    resetRelations,
    colorBy,
    legend,
    highlightRelation,
    highlightLegend,
    clearHighlight,
    refreshRelations,
  }
}

import { countBy, sortBy, uniqBy, union, without, xor } from 'lodash-es'

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
    const isVisible = (e) => !hidden.has(edgeKey(e))
    cy.batch(() => {
      cy.edges().forEach((e) => e.style('display', isVisible(e) ? 'element' : 'none'))
      cy.nodes().forEach((n) => {
        const visible = !hidden.size || n.id() === rootId.value || n.connectedEdges().some(isVisible)
        n.style('display', visible ? 'element' : 'none')
      })
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
      nodes.removeData('color')
      legend.value = []
      return
    }
    const counts = countBy(nodes.map((n) => valueOf(n, field)))
    const values = sortBy(Object.keys(counts))
    const colors = Object.fromEntries(values.map((value, i) => [value, palette[i % palette.length]]))
    cy.batch(() => nodes.forEach((n) => n.data('color', colors[valueOf(n, field)])))
    legend.value = values.map((value) => ({ value, color: colors[value], count: counts[value] }))
  }

  watch(colorBy, applyColors)

  const highlight = (matched) => {
    const cy = cyRef.value
    if (!cy || !matched) return
    cy.batch(() => {
      cy.elements().removeClass('hover-match').addClass('hover-dimmed')
      matched.removeClass('hover-dimmed').addClass('hover-match')
    })
  }

  const highlightRelation = (key) => {
    const edges = cyRef.value?.edges().filter((e) => edgeKey(e) === key)
    highlight(edges?.union(edges.connectedNodes()))
  }

  const highlightLegend = (value) =>
    highlight(cyRef.value?.nodes().filter((n) => !n.data('isCluster') && valueOf(n, colorBy.value) === value))

  const clearHighlight = () => cyRef.value?.elements().removeClass('hover-match hover-dimmed')

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

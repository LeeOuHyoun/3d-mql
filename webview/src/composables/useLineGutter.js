export function useLineGutter(inputRef, text, isEnabled) {
  const mirrorRef = ref(null)
  const gutterRef = ref(null)
  const mirrorWidth = ref(0)
  const heights = ref([])
  const lines = computed(() => (isEnabled.value ? text.value.split('\n') : []))

  const syncScroll = () => {
    if (gutterRef.value && inputRef.value) gutterRef.value.scrollTop = inputRef.value.scrollTop
  }

  const measure = () => {
    const el = inputRef.value
    if (!el || !isEnabled.value) return
    const style = getComputedStyle(el)
    mirrorWidth.value = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    nextTick(() => {
      heights.value = [...(mirrorRef.value?.children ?? [])].map((row) => row.getBoundingClientRect().height)
      syncScroll()
    })
  }

  useResizeObserver(inputRef, measure)
  watch(lines, measure, { flush: 'post' })

  return { mirrorRef, gutterRef, mirrorWidth, lines, heights, syncScroll }
}

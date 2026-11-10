export function useLoader(source, fetcher) {
  const data = shallowRef(null)
  const error = ref('')
  const isLoading = ref(false)

  const load = async () => {
    const key = toValue(source)
    data.value = null
    error.value = ''
    isLoading.value = !!key
    if (!key) return
    try {
      const result = await fetcher()
      if (key === toValue(source)) data.value = result
    } catch (e) {
      if (key === toValue(source)) error.value = e.message
    } finally {
      if (key === toValue(source)) isLoading.value = false
    }
  }

  watch(() => toValue(source), load, { immediate: true })

  return { data, error, isLoading, reload: load }
}

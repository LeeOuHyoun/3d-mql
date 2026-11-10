import { request } from '@/api.js'

const PREVIEW_DEBOUNCE_MS = 250

export const toFields = (values) => Object.entries(values).map(([key, value]) => ({ key, value }))

export function useChangePreview(source) {
  const statements = ref([])
  const error = ref('')
  let latest = ''

  const update = async (list) => {
    const key = JSON.stringify(list)
    latest = key
    try {
      const results = await Promise.all(list.map((params) => request('change', params)))
      if (key !== latest) return
      statements.value = results.map((result) => result.forward)
      error.value = ''
    } catch (e) {
      if (key !== latest) return
      statements.value = []
      error.value = e.message
    }
  }

  watchDebounced(() => toValue(source), update, { debounce: PREVIEW_DEBOUNCE_MS, deep: true, immediate: true })

  return { statements, error }
}

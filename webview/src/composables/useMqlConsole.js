import { clamp } from 'lodash-es'
import { request } from '@/api.js'

const HISTORY_LIMIT = 100

const isOpen = useStorage('3d-mql-console-open', false)
const input = ref('')
const entries = ref([])
const pending = ref(0)
const isRunning = computed(() => pending.value > 0)
const runCount = ref(0)
let seq = 0

const history = useStorage('3d-mql-console-history', [])
let historyCursor = -1
let historyDraft = ''

const remember = (text) => {
  const pinned = history.value.find((item) => item.text === text)?.pinned ?? false
  let unpinned = 0
  history.value = [{ text, pinned }, ...history.value.filter((item) => item.text !== text)].filter(
    (item) => item.pinned || ++unpinned <= HISTORY_LIMIT,
  )
  historyCursor = -1
}

const recall = (step) => {
  if (!history.value.length) return
  if (historyCursor === -1) historyDraft = input.value
  historyCursor = clamp(historyCursor + step, -1, history.value.length - 1)
  input.value = historyCursor === -1 ? historyDraft : history.value[historyCursor].text
}

const togglePin = (text) => {
  history.value = history.value.map((item) => (item.text === text ? { ...item, pinned: !item.pinned } : item))
}

const removeHistory = (text) => {
  history.value = history.value.filter((item) => item.text !== text)
}

const run = async (command = input.value) => {
  const text = command.trim()
  if (!text) return
  isOpen.value = true
  input.value = text
  remember(text)
  pending.value++
  const entry = reactive({ id: ++seq, command: text, output: '', error: '', elapsed: 0, isGrid: false, isFolded: false })
  entries.value = [...entries.value.slice(-49), entry]
  const startedAt = Date.now()
  try {
    entry.output = String(await request('run', { command: text })).trim()
  } catch (e) {
    entry.error = e.message
  } finally {
    entry.elapsed = Date.now() - startedAt
    pending.value--
    runCount.value++
  }
  return entry
}

const clear = () => {
  entries.value = []
}

const openInEditor = (content) => request('openDocument', { content })

export const useMqlConsole = () => ({
  isOpen,
  input,
  entries,
  isRunning,
  runCount,
  run,
  clear,
  openInEditor,
  history,
  recall,
  togglePin,
  removeHistory,
})

import { request } from '@/api.js'

const isOpen = useStorage('3d-mql-console-open', false)
const input = ref('')
const entries = ref([])
const pending = ref(0)
const isRunning = computed(() => pending.value > 0)
const runCount = ref(0)
let seq = 0

const run = async (command = input.value) => {
  const text = command.trim()
  if (!text) return
  isOpen.value = true
  input.value = text
  pending.value++
  const entry = reactive({ id: ++seq, command: text, output: '', error: '', elapsed: 0 })
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
}

const clear = () => {
  entries.value = []
}

const openInEditor = (content) => request('openDocument', { content })

export const useMqlConsole = () => ({ isOpen, input, entries, isRunning, runCount, run, clear, openInEditor })

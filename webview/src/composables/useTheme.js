import { onMessage, post } from '@/api.js'

const isDark = ref(document.body.classList.contains('vscode-dark'))

watchEffect(() => document.documentElement.classList.toggle('dark', isDark.value))

onMessage((message) => {
  if (message?.type === 'init') isDark.value = message.dark
})

const toggleTheme = () => {
  isDark.value = !isDark.value
  post({ type: 'setTheme', dark: isDark.value })
}

export const useTheme = () => ({ isDark, toggleTheme })

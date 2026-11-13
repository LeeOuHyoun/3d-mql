import App from './App.vue'
import { post } from './api.js'
import './style.css'

const readonlyContext = JSON.stringify({ webviewSection: 'readonly', preventDefaultContextMenuItems: true })

document.addEventListener('contextmenu', (event) => {
  const root = document.documentElement
  if (event.target.closest?.(':read-write')) delete root.dataset.vscodeContext
  else root.dataset.vscodeContext = readonlyContext
})

createApp(App).mount('#app')
post({ type: 'ready' })

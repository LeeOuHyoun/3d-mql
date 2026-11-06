import App from './App.vue'
import { post } from './api.js'
import './style.css'

createApp(App).mount('#app')
post({ type: 'ready' })

import { Crosshair, CirclePlus } from '@lucide/vue'

const emeraldColor = 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/40'

export const graphOpenMenuItems = [
  { action: 'openRoot', label: '그래프에서 열기 (기준 객체)', icon: Crosshair, color: emeraldColor },
  { action: 'add', label: '그래프에 추가 (기준 객체 유지)', icon: CirclePlus, color: emeraldColor },
]

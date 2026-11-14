<script setup>
import {
  RefreshCw,
  Sun,
  Moon,
  Telescope,
  Snowflake,
  Network,
  Share2,
  Keyboard,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpLeft,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowDownRight,
  RotateCcw,
  Settings,
  Square,
  SquareCheck,
} from '@lucide/vue'
import { settingItems, useSettings } from '../composables/useSettings.js'

const props = defineProps({
  isDark: { type: Boolean, default: false },
  minimapPosition: { type: String, default: 'bottom-right' },
  isMenuBelow: { type: Boolean, default: false },
})
const isMinimapOpen = defineModel('isMinimapOpen', { type: Boolean, default: true })
const layoutType = defineModel('layoutType', { type: String, default: 'radial' })
const emit = defineEmits(['resetView', 'toggleTheme', 'shortcuts', 'minimapPosition', 'resetMinimap'])

const minimapPositions = [
  { value: 'top-left', title: '왼쪽 위 고정', icon: ArrowUpLeft },
  { value: 'top', title: '위쪽 고정', icon: ArrowUp },
  { value: 'top-right', title: '오른쪽 위 고정', icon: ArrowUpRight },
  { value: 'left', title: '왼쪽 고정', icon: ArrowLeft },
  { value: 'reset', title: '미니맵 위치 · 크기 초기화', icon: RotateCcw },
  { value: 'right', title: '오른쪽 고정', icon: ArrowRight },
  { value: 'bottom-left', title: '왼쪽 아래 고정', icon: ArrowDownLeft },
  { value: 'bottom', title: '아래쪽 고정', icon: ArrowDown },
  { value: 'bottom-right', title: '오른쪽 아래 고정', icon: ArrowDownRight },
]
const minimapMenuRef = ref(null)
const isMinimapMenuOpen = ref(false)

onClickOutside(minimapMenuRef, () => (isMinimapMenuOpen.value = false))
whenever(
  () => !isMinimapOpen.value,
  () => (isMinimapMenuOpen.value = false),
)

const toggleMinimapMenu = () => {
  isMinimapMenuOpen.value = isMinimapOpen.value && !isMinimapMenuOpen.value
}

const selectMinimapPosition = (value) => {
  if (value === 'reset') emit('resetMinimap')
  else emit('minimapPosition', value)
}

const settings = useSettings()
const settingsMenuRef = ref(null)
const isSettingsMenuOpen = ref(false)

onClickOutside(settingsMenuRef, () => (isSettingsMenuOpen.value = false))

const toggleSetting = (key) => {
  settings.value[key] = !settings.value[key]
}

const layouts = [
  { value: 'radial', title: 'Radial 레이아웃', icon: Snowflake },
  { value: 'flow-tb', title: 'Flowchart (세로)', icon: Network },
  { value: 'flow-lr', title: 'Flowchart (가로)', icon: Share2 },
]

const iconBtnClass =
  'h-6 w-6 flex items-center justify-center rounded-md border-none bg-transparent text-gray-500 dark:text-[#abb2bf] hover:bg-gray-200 dark:hover:bg-white/10 transition-colors cursor-pointer'
const activeClass = 'text-[#61afef]! bg-[#61afef]/10'
const dividerClass = 'w-px h-4 mx-1 shrink-0 bg-gray-200 dark:bg-[#3e4451]'
</script>

<template>
  <div class="flex items-center gap-1">
    <div class="flex items-center rounded-md bg-gray-100 dark:bg-white/5">
      <button
        v-for="layout in layouts"
        :key="layout.value"
        :class="[iconBtnClass, layoutType === layout.value && activeClass]"
        :title="layout.title"
        @click="layoutType = layout.value"
      >
        <component :is="layout.icon" :size="14" />
      </button>
    </div>
    <button :class="iconBtnClass" title="레이아웃 다시 정렬 · 화면 맞춤 (Shift+Alt+F)" @click="emit('resetView')">
      <RefreshCw :size="14" />
    </button>
    <div ref="minimapMenuRef" class="relative flex items-center">
      <button
        :class="[iconBtnClass, isMinimapOpen && activeClass]"
        title="미니맵 (Alt+M) · 우클릭: 위치 고정"
        @click="isMinimapOpen = !isMinimapOpen"
        @contextmenu.prevent="toggleMinimapMenu"
      >
        <Telescope :size="14" />
      </button>
      <div
        v-if="isMinimapMenuOpen"
        class="absolute left-1/2 -translate-x-1/2 z-30 w-max p-1 grid grid-cols-3 gap-1 rounded-lg border shadow-xl animate-pop-in bg-gray-50 dark:bg-[#21252b] border-gray-200 dark:border-[#3e4451]"
        :class="props.isMenuBelow ? 'top-full mt-1.5' : 'bottom-full mb-1.5'"
      >
        <button
          v-for="item in minimapPositions"
          :key="item.value"
          class="w-6 h-6 flex items-center justify-center rounded-md border cursor-pointer transition-colors"
          :class="
            props.minimapPosition === item.value
              ? 'border-[#61afef] bg-[#61afef] text-white'
              : 'border-gray-200 dark:border-[#3e4451] bg-white dark:bg-[#1e2227] text-gray-400 hover:text-[#61afef]'
          "
          :title="item.title"
          @click="selectMinimapPosition(item.value)"
        >
          <component :is="item.icon" :size="14" />
        </button>
      </div>
    </div>
    <div :class="dividerClass"></div>
    <button :class="iconBtnClass" title="단축키 안내 (Ctrl+Shift+L)" @click="emit('shortcuts')">
      <Keyboard :size="14" />
    </button>
    <div ref="settingsMenuRef" class="relative flex items-center">
      <button
        :class="[iconBtnClass, isSettingsMenuOpen && activeClass]"
        title="설정"
        @click="isSettingsMenuOpen = !isSettingsMenuOpen"
      >
        <Settings :size="14" />
      </button>
      <div
        v-if="isSettingsMenuOpen"
        class="absolute right-0 z-30 w-max py-1 rounded-lg border shadow-xl animate-pop-in text-xs bg-white dark:bg-[#282c34] border-gray-200 dark:border-[#3e4451]"
        :class="props.isMenuBelow ? 'top-full mt-1.5' : 'bottom-full mb-1.5'"
      >
        <button
          v-for="item in settingItems"
          :key="item.key"
          class="w-full px-3 py-2 flex items-start gap-2 border-none bg-transparent text-left font-semibold text-gray-700 dark:text-[#abb2bf] hover:bg-gray-100 dark:hover:bg-white/10 cursor-pointer whitespace-nowrap"
          @click="toggleSetting(item.key)"
        >
          <SquareCheck v-if="settings[item.key]" :size="14" class="shrink-0 text-[#61afef]" />
          <Square v-else :size="14" class="shrink-0 text-gray-400" />
          <span class="flex flex-col gap-0.5">
            {{ item.label }}
            <span v-if="item.hint" class="max-w-64 whitespace-normal font-normal text-[11px] text-gray-400 dark:text-[#5c6370]">{{ item.hint }}</span>
          </span>
        </button>
      </div>
    </div>
    <button :class="iconBtnClass" :title="props.isDark ? '라이트 모드' : '다크 모드'" @click="emit('toggleTheme')">
      <Sun v-if="props.isDark" :size="14" />
      <Moon v-else :size="14" />
    </button>
  </div>
</template>

<script setup>
import { X, Copy, Crosshair, ListFilter } from '@lucide/vue'
import ContextMenu from './ContextMenu.vue'
import { graphOpenMenuItems } from './graphOpenMenuItems.js'
import { usePanelResize } from '../composables/usePanelResize.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  results: { type: Array, default: () => [] },
  limit: { type: Number, default: 0 },
  where: { type: String, default: '' },
  root: { type: Object, default: null },
})
const emit = defineEmits(['select', 'add', 'close'])

const isLimited = computed(() => props.limit > 0 && props.results.length >= props.limit)
const rootMarkClass = 'bg-[#e06c75]/10 shadow-[inset_4px_0_0_#e06c75]'

const { width, onResizeStart } = usePanelResize('search', 288, 'right')

const { copy } = useClipboard({ legacy: true })
const menu = shallowRef(null)
const copyColor = 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/40'
const menuItems = [
  ...graphOpenMenuItems,
  { action: 'name', label: 'Copy Name', icon: Copy, color: copyColor, value: (item) => item.name },
  { action: 'tnr', label: 'Copy Type Name Rev', icon: Copy, color: copyColor, value: (item) => `${item.type} ${item.name} ${item.revision}` },
  { action: 'id', label: 'Copy ID', icon: Copy, color: copyColor, value: (item) => item.id },
]

const openMenu = (e, item) => {
  menu.value = { x: e.clientX, y: e.clientY, item }
}

const handleMenuAction = (action) => {
  const { item } = menu.value
  menu.value = null
  if (action === 'openRoot') emit('select', item.id)
  else if (action === 'add') emit('add', [item.id])
  else copy(menuItems.find((entry) => entry.action === action).value(item))
}
</script>

<template>
  <Transition name="dock-left">
    <div
      v-if="props.open"
      class="relative z-1 h-full border-r border-gray-200 dark:border-[#3e4451] bg-gray-50 dark:bg-[#21252b] flex flex-col shrink-0 overflow-hidden"
      :style="{ width: `${width}px`, '--panel-size': `${width}px` }"
      @contextmenu.prevent
    >
      <div
        class="absolute top-0 right-0 bottom-0 w-1 z-10 cursor-col-resize hover:bg-[#61afef]/40"
        @pointerdown.prevent="onResizeStart"
      ></div>
      <div
        class="px-4 py-3 border-b border-gray-200 dark:border-[#3e4451] flex items-center justify-between shrink-0 bg-white dark:bg-[#282c34]"
      >
        <h3 class="text-sm font-bold text-gray-900 dark:text-[#61afef] m-0">
          검색 결과 ({{ props.results.length }}{{ isLimited ? '+' : '' }})
        </h3>
        <button
          class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 bg-transparent border-none rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
          @click="emit('close')"
        >
          <X :size="14" />
        </button>
      </div>
      <div
        v-if="props.root"
        :class="['px-4 py-2 border-b border-gray-200 dark:border-[#3e4451] shrink-0 flex items-start gap-2', rootMarkClass]"
        :title="props.root.id"
      >
        <Crosshair :size="14" class="mt-0.5 shrink-0 text-[#e06c75]" />
        <div class="min-w-0 flex flex-col gap-0.5">
          <span class="text-[10px] font-semibold text-[#e06c75]">현재 기준 객체</span>
          <span class="text-xs font-semibold text-gray-800 dark:text-[#abb2bf] break-all">
            {{ props.root.name }} <span class="text-gray-400">{{ props.root.revision }}</span>
          </span>
          <span class="text-[11px] text-gray-500 dark:text-[#5c6370] truncate">{{ props.root.type }}</span>
        </div>
      </div>
      <div
        v-if="props.where"
        class="px-4 py-2 flex items-start gap-2 text-[11px] bg-[#61afef]/10 border-b border-gray-200 dark:border-[#3e4451] shrink-0"
        :title="props.where"
      >
        <ListFilter :size="14" class="mt-0.5 shrink-0 text-[#4b8bca] dark:text-[#61afef]" />
        <div class="min-w-0 flex flex-col gap-0.5">
          <span class="text-[10px] font-semibold text-[#4b8bca] dark:text-[#61afef]">Where 조건 적용</span>
          <span class="font-mono text-gray-700 dark:text-[#abb2bf] break-all line-clamp-3">{{ props.where }}</span>
        </div>
      </div>
      <div
        v-if="isLimited"
        class="px-4 py-2 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border-b border-gray-200 dark:border-[#3e4451] shrink-0"
      >
        최대 {{ props.limit }}건까지만 표시합니다. 조건을 좁혀 다시 검색하세요.
      </div>
      <div class="flex-1 overflow-auto">
        <div v-if="!props.results.length" class="p-4 text-xs text-gray-400 italic text-center">결과가 없습니다.</div>
        <button
          v-for="item in props.results"
          :key="item.id"
          class="w-full text-left px-4 py-2 border-b border-gray-100 dark:border-[#3e4451] cursor-pointer flex flex-col gap-0.5"
          :class="item.id === props.root?.id ? rootMarkClass : 'bg-transparent hover:bg-[#61afef]/10'"
          :title="item.id"
          @click="emit('select', item.id)"
          @contextmenu.prevent="openMenu($event, item)"
        >
          <span class="text-xs font-semibold text-gray-800 dark:text-[#abb2bf] break-all">
            {{ item.name }} <span class="text-gray-400">{{ item.revision }}</span>
          </span>
          <span class="flex items-center gap-2 text-[11px] text-gray-500 dark:text-[#5c6370]">
            <span class="truncate">{{ item.type }}</span>
            <span
              v-if="item.current"
              class="shrink-0 px-1.5 rounded bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
            >
              {{ item.current }}
            </span>
          </span>
        </button>
      </div>
      <ContextMenu v-if="menu" :menu="menu" :items="menuItems" @action="handleMenuAction" @close="menu = null" />
    </div>
  </Transition>
</template>

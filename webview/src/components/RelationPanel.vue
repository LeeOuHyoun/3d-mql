<script setup>
import { X, Eye } from '@lucide/vue'
import { usePanelResize } from '../composables/usePanelResize.js'

const props = defineProps({
  state: { type: Object, required: true },
})
const emit = defineEmits(['close'])

const {
  filteredRelations,
  hiddenRelations,
  relationFilter,
  toggleRelation,
  showOnlyRelation,
  setAllRelations,
  colorBy,
  legend,
  highlightRelation,
  highlightLegend,
  clearHighlight,
} = props.state

const { width, onResizeStart } = usePanelResize('relation', 260, 'right')

const handleLabelClick = (e, item) => {
  if (e.ctrlKey || e.altKey) showOnlyRelation(item.key)
  else toggleRelation(item.key)
}

const colorModes = [
  { value: 'none', label: '없음' },
  { value: 'type', label: 'Type' },
  { value: 'current', label: 'State' },
]

const sectionClass =
  'px-4 py-1.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-[#5c6370] bg-gray-100 dark:bg-[#2c313a]'
const linkBtnClass = 'px-1 border-none bg-transparent text-[11px] normal-case text-[#61afef] hover:underline cursor-pointer'
const rowClass = 'px-4 py-1 flex items-center gap-2 text-xs hover:bg-[#61afef]/10'
</script>

<template>
  <div
    class="relative h-full border-r border-gray-200 dark:border-[#3e4451] bg-gray-50 dark:bg-[#21252b] flex flex-col shrink-0 overflow-hidden"
    :style="{ width: `${width}px` }"
  >
    <div
      class="absolute top-0 right-0 bottom-0 w-1 z-10 cursor-col-resize hover:bg-[#61afef]/40"
      @pointerdown.prevent="onResizeStart"
    ></div>
    <div
      class="px-4 py-3 border-b border-gray-200 dark:border-[#3e4451] flex items-center justify-between shrink-0 bg-white dark:bg-[#282c34]"
    >
      <h3 class="text-sm font-bold text-gray-900 dark:text-[#61afef] m-0">관계 필터 · 범례</h3>
      <button
        class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 bg-transparent border-none rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
        @click="emit('close')"
      >
        <X :size="14" />
      </button>
    </div>
    <div class="px-4 py-2 border-b border-gray-200 dark:border-[#3e4451] shrink-0">
      <input
        v-model="relationFilter"
        placeholder="관계 필터"
        spellcheck="false"
        class="w-full h-7 px-2 text-xs rounded-md border border-gray-200 dark:border-[#3e4451] bg-white dark:bg-[#282c34] text-gray-800 dark:text-[#abb2bf] outline-none focus:border-[#61afef]"
      />
    </div>
    <div class="flex-1 overflow-auto">
      <div :class="sectionClass">
        <span>Relations ({{ filteredRelations.length }})</span>
        <span>
          <button :class="linkBtnClass" @click="setAllRelations(true)">모두 표시</button>
          <button :class="linkBtnClass" @click="setAllRelations(false)">모두 숨김</button>
        </span>
      </div>
      <div v-if="!filteredRelations.length" class="p-4 text-xs text-gray-400 italic text-center">관계가 없습니다.</div>
      <div
        v-for="item in filteredRelations"
        :key="item.key"
        :class="[rowClass, 'group']"
        @mouseenter="highlightRelation(item.key)"
        @mouseleave="clearHighlight"
      >
        <input
          type="checkbox"
          class="accent-[#61afef] cursor-pointer"
          :checked="!hiddenRelations.includes(item.key)"
          @change="toggleRelation(item.key)"
        />
        <span
          class="shrink-0 w-4 text-center font-bold"
          :class="item.isReverse ? 'text-cyan-600 dark:text-cyan-400' : 'text-sky-600 dark:text-sky-400'"
          :title="item.isReverse ? 'Where Used (To)' : 'Expand (From)'"
        >
          {{ item.isReverse ? '←' : '→' }}
        </span>
        <span
          class="flex-1 min-w-0 truncate cursor-pointer text-gray-800 dark:text-[#abb2bf]"
          :title="`${item.label} (Ctrl/Alt + 클릭: 이 관계만 보기)`"
          @click="handleLabelClick($event, item)"
        >
          {{ item.label }}
        </span>
        <span class="text-[11px] text-gray-400">{{ item.count }}</span>
        <button
          class="p-0.5 flex items-center border-none bg-transparent text-gray-400 hover:text-[#61afef] cursor-pointer invisible group-hover:visible"
          title="이 관계만 보기"
          @click="showOnlyRelation(item.key)"
        >
          <Eye :size="12" />
        </button>
      </div>
      <div :class="[sectionClass, 'mt-2']">
        <span>범례</span>
        <span class="flex gap-0.5">
          <button
            v-for="mode in colorModes"
            :key="mode.value"
            :class="[linkBtnClass, colorBy === mode.value && 'font-bold underline']"
            @click="colorBy = mode.value"
          >
            {{ mode.label }}
          </button>
        </span>
      </div>
      <div v-if="colorBy === 'none'" class="p-4 text-xs text-gray-400 italic text-center">
        Type 또는 State를 선택하면 노드 색상이 구분됩니다.
      </div>
      <div
        v-for="item in legend"
        :key="item.value"
        :class="rowClass"
        @mouseenter="highlightLegend(item.value)"
        @mouseleave="clearHighlight"
      >
        <span class="w-3 h-3 rounded-sm shrink-0" :style="{ background: item.color }"></span>
        <span class="flex-1 min-w-0 truncate text-gray-800 dark:text-[#abb2bf]" :title="item.value">{{ item.value }}</span>
        <span class="text-[11px] text-gray-400">{{ item.count }}</span>
      </div>
    </div>
  </div>
</template>

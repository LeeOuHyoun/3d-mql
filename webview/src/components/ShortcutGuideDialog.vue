<script setup>
import { Search, Settings2 } from '@lucide/vue'
import { upperFirst } from 'lodash-es'
import { request } from '../api.js'
import BaseDialog from './BaseDialog.vue'

const emit = defineEmits(['close'])

const toKeys = (key) => key.split('+').map(upperFirst)

const { state: commands } = useAsyncState(request('keybindings'), [])

const fixedGroups = [
  {
    title: '그래프 마우스 조작',
    shortcuts: [
      { keys: [['Click']], description: '노드 · 관계 상세 정보 보기' },
      { keys: [['Double Click']], description: '노드 연결 확장 (Expand)' },
      { keys: [['Right Click']], description: '컨텍스트 메뉴' },
      { keys: [['Ctrl', 'Click'], ['Shift', 'Click']], description: '다중 선택' },
      { keys: [['Shift', 'Drag']], description: '영역 다중 선택' },
      { keys: [['Ctrl', 'Wheel'], ['Alt', 'Wheel']], description: '큰 단위로 확대 / 축소' },
    ],
  },
  {
    title: 'MQL 콘솔',
    shortcuts: [
      { keys: [['Ctrl', 'Enter']], description: 'MQL 명령 실행' },
      { keys: [['Ctrl', '↑'], ['Ctrl', '↓']], description: '이전 / 다음 명령 불러오기' },
      { keys: [['Ctrl', 'F']], description: '결과에서 찾기' },
      { keys: [['Enter'], ['Shift', 'Enter']], description: '다음 / 이전 찾기 결과로 이동' },
      { keys: [['Click']], description: '결과의 Object ID 메뉴 (그래프에서 열기 · print · expand)' },
    ],
  },
  {
    title: '관계 필터 · 범례',
    shortcuts: [{ keys: [['Ctrl', 'Click'], ['Alt', 'Click']], description: '관계 이름 클릭 시 그 관계만 보기' }],
  },
  {
    title: '공통',
    shortcuts: [{ keys: [['Esc']], description: '메뉴 · 다이얼로그 · 전체 화면 닫기' }],
  },
]

const groups = computed(() => [
  {
    title: 'VS Code 단축키 (그래프 패널 활성 시)',
    shortcuts: commands.value.map((item) => ({ keys: item.key ? [toKeys(item.key)] : [], description: item.title })),
  },
  ...fixedGroups,
])

const keyword = ref('')

const filteredGroups = computed(() => {
  const query = keyword.value.toLowerCase().trim()
  if (!query) return groups.value
  const matches = (shortcut) =>
    [shortcut.description, ...shortcut.keys.map((keys) => keys.join('+'))].some((text) =>
      text.toLowerCase().includes(query),
    )
  return groups.value
    .map((group) => ({ ...group, shortcuts: group.shortcuts.filter(matches) }))
    .filter((group) => group.shortcuts.length)
})

const openKeybindings = () => request('openKeybindings')

const kbdClass =
  'px-1.5 py-0.5 text-[11px] font-mono font-bold rounded border shadow-sm bg-gray-100 dark:bg-[#21252b] border-gray-300 dark:border-[#3e4451] text-gray-800 dark:text-gray-200'
const dividerClass = 'text-[11px] text-gray-400 dark:text-[#5c6370]'
</script>

<template>
  <BaseDialog title="단축키 안내 (Ctrl+Shift+L)" width-class="w-[40rem]" @close="emit('close')">
    <div class="px-4 py-2 border-b border-gray-200 dark:border-[#3e4451] shrink-0">
      <div class="relative flex items-center">
        <Search :size="12" class="absolute left-2 text-gray-400 pointer-events-none" />
        <input
          v-model="keyword"
          placeholder="설명 또는 키로 검색"
          spellcheck="false"
          class="w-full h-7 pl-6 pr-2 text-xs rounded-md border border-gray-200 dark:border-[#3e4451] bg-white dark:bg-[#21252b] text-gray-800 dark:text-[#abb2bf] outline-none focus:border-[#61afef]"
        />
      </div>
    </div>
    <div class="flex-1 min-h-0 overflow-auto p-4 flex flex-col gap-4">
      <div v-if="!filteredGroups.length" class="text-gray-400 italic text-center">검색 결과가 없습니다.</div>
      <div v-for="group in filteredGroups" :key="group.title" class="flex flex-col gap-1">
        <div class="pb-1 mb-1 border-b border-gray-100 dark:border-[#3e4451] font-bold text-[#61afef]">
          {{ group.title }}
        </div>
        <div
          v-for="shortcut in group.shortcuts"
          :key="shortcut.description"
          class="px-1.5 py-1 flex items-center justify-between gap-3 rounded hover:bg-gray-50 dark:hover:bg-white/5"
        >
          <span class="min-w-0 text-gray-700 dark:text-[#abb2bf]">{{ shortcut.description }}</span>
          <span class="shrink-0 flex items-center gap-1.5">
            <span v-if="!shortcut.keys.length" :class="dividerClass">미지정</span>
            <template v-for="(keys, index) in shortcut.keys" :key="index">
              <span v-if="index" :class="dividerClass">/</span>
              <span class="flex items-center gap-1">
                <template v-for="(key, keyIndex) in keys" :key="key">
                  <span v-if="keyIndex" :class="dividerClass">+</span>
                  <kbd :class="kbdClass">{{ key }}</kbd>
                </template>
              </span>
            </template>
          </span>
        </div>
      </div>
    </div>
    <div
      class="px-4 py-2 border-t border-gray-200 dark:border-[#3e4451] flex items-center justify-between gap-3 shrink-0 text-[11px] text-gray-400"
    >
      <span>VS Code 단축키는 기본값 기준이며, 직접 변경한 키는 반영되지 않습니다.</span>
      <button
        class="shrink-0 flex items-center gap-1 border-none bg-transparent text-[#61afef] hover:underline cursor-pointer"
        @click="openKeybindings"
      >
        <Settings2 :size="12" />
        키 바인딩 편집
      </button>
    </div>
  </BaseDialog>
</template>

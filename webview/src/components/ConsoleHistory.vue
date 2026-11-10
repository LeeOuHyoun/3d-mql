<script setup>
import { X, Pin, PinOff, Search } from '@lucide/vue'
import { sortBy } from 'lodash-es'
import { useMqlConsole } from '../composables/useMqlConsole.js'

const emit = defineEmits(['close'])

const { input, history, run, togglePin, removeHistory } = useMqlConsole()

const keyword = ref('')

const items = computed(() => {
  const query = keyword.value.toLowerCase().trim()
  const filtered = query ? history.value.filter((item) => item.text.toLowerCase().includes(query)) : history.value
  return sortBy(filtered, (item) => !item.pinned)
})

const iconBtnClass =
  'p-0.5 flex items-center border-none bg-transparent rounded text-gray-400 hover:text-[#61afef] cursor-pointer'
</script>

<template>
  <div class="w-64 shrink-0 border-l border-gray-200 dark:border-[#3e4451] flex flex-col bg-white dark:bg-[#282c34] text-xs">
    <div class="px-2 py-1.5 flex items-center gap-1 border-b border-gray-200 dark:border-[#3e4451] shrink-0">
      <div class="relative flex-1 flex items-center">
        <Search :size="12" class="absolute left-2 text-gray-400 pointer-events-none" />
        <input
          v-model="keyword"
          placeholder="명령 기록 검색"
          spellcheck="false"
          class="w-full h-6 pl-6 pr-2 rounded-md border border-gray-200 dark:border-[#3e4451] bg-white dark:bg-[#21252b] text-gray-800 dark:text-[#abb2bf] outline-none focus:border-[#61afef]"
        />
      </div>
      <button :class="iconBtnClass" title="기록 닫기" @click="emit('close')">
        <X :size="14" />
      </button>
    </div>
    <div class="flex-1 min-h-0 overflow-auto">
      <div v-if="!items.length" class="p-3 text-gray-400 italic text-center">명령 기록이 없습니다.</div>
      <div
        v-for="item in items"
        :key="item.text"
        class="group px-2 py-1 flex items-start gap-1 border-b border-gray-100 dark:border-[#3e4451]/60 hover:bg-[#61afef]/10 cursor-pointer"
        title="클릭: 입력창에 넣기 · 더블클릭: 실행"
        @click="input = item.text"
        @dblclick="run(item.text)"
      >
        <span class="flex-1 min-w-0 font-mono text-[11px] line-clamp-2 break-all text-gray-800 dark:text-[#abb2bf]">{{ item.text }}</span>
        <button
          :class="[iconBtnClass, !item.pinned && 'invisible group-hover:visible', item.pinned && 'text-[#e5c07b]!']"
          :title="item.pinned ? '고정 해제' : '고정'"
          @click.stop="togglePin(item.text)"
        >
          <PinOff v-if="item.pinned" :size="12" />
          <Pin v-else :size="12" />
        </button>
        <button :class="[iconBtnClass, 'invisible group-hover:visible']" title="기록에서 제거" @click.stop="removeHistory(item.text)">
          <X :size="12" />
        </button>
      </div>
    </div>
  </div>
</template>

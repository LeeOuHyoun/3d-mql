<script setup>
import { X, ChevronRight } from '@lucide/vue'

const props = defineProps({
  notice: { type: Object, required: true },
})
const emit = defineEmits(['focus', 'close'])

const isListOpen = ref(false)
const kindClass = {
  added: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  replicate: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  removed: 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  changed: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  float: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  none: 'bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-[#abb2bf]',
  unknown: 'bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-[#abb2bf]',
}
const labelOf = computed(() => Object.fromEntries(props.notice.chips.map((chip) => [chip.key, chip.label])))
const chipClass = 'shrink-0 px-1.5 rounded font-semibold'
const iconBtnClass =
  'p-0.5 flex items-center border-none bg-transparent rounded text-gray-400 hover:text-[#61afef] cursor-pointer'
</script>

<template>
  <div
    class="absolute top-2 left-2 z-10 max-w-[70%] flex flex-col rounded-lg border border-black/10 dark:border-white/10 shadow-md text-xs bg-white/95 dark:bg-[#21252b]/95 text-gray-700 dark:text-[#abb2bf]"
  >
    <div class="px-2.5 py-1.5 flex items-center gap-1.5">
      <button
        v-if="props.notice.items.length"
        :class="iconBtnClass"
        :title="isListOpen ? '목록 접기' : '목록 펼치기'"
        @click="isListOpen = !isListOpen"
      >
        <ChevronRight :size="14" class="transition-transform" :class="isListOpen && 'rotate-90'" />
      </button>
      <span class="font-semibold truncate">{{ props.notice.title }}</span>
      <span v-for="chip in props.notice.chips" :key="chip.key" :class="[chipClass, kindClass[chip.key]]">
        {{ chip.label }} {{ chip.count }}
      </span>
      <button :class="iconBtnClass" title="표시 지우기" @click="emit('close')">
        <X :size="14" />
      </button>
    </div>
    <div v-if="isListOpen" class="max-h-56 overflow-auto border-t border-black/10 dark:border-white/10">
      <button
        v-for="item in props.notice.items"
        :key="`${item.kind}-${item.id}`"
        class="w-full px-2.5 py-1 flex items-start gap-1.5 text-left border-none bg-transparent text-inherit cursor-pointer hover:bg-[#61afef]/10"
        :title="item.id"
        @click="emit('focus', item)"
      >
        <span :class="[chipClass, kindClass[item.kind]]">{{ labelOf[item.kind] }}</span>
        <span class="break-all">{{ item.label }}</span>
      </button>
    </div>
  </div>
</template>

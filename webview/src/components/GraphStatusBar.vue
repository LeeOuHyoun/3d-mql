<script setup>
import { PlugZap, Terminal, ListChecks, PackagePlus } from '@lucide/vue'

const props = defineProps({
  connection: { type: Object, required: true },
  context: { type: Object, required: true },
  changeCount: { type: Number, default: 0 },
})
const isConsoleOpen = defineModel('isConsoleOpen', { type: Boolean, default: false })
const emit = defineEmits(['reconnect', 'basket', 'create'])

const statusMap = {
  connecting: { label: '연결 중', dot: 'bg-amber-400 animate-pulse' },
  ready: { label: '연결됨', dot: 'bg-emerald-500' },
  failed: { label: '연결 실패', dot: 'bg-red-500' },
  ended: { label: '세션 종료', dot: 'bg-gray-400' },
}
const status = computed(() => statusMap[props.connection.state] || statusMap.connecting)

const iconBtnClass =
  'h-6 w-6 flex items-center justify-center rounded-md border-none bg-transparent text-gray-500 dark:text-[#abb2bf] hover:bg-gray-200 dark:hover:bg-white/10 transition-colors cursor-pointer'
const activeClass = 'text-[#61afef]! bg-[#61afef]/10'
const dividerClass = 'w-px h-4 mx-1 shrink-0 bg-gray-200 dark:bg-[#3e4451]'
</script>

<template>
  <div
    class="h-8 px-3 flex items-center gap-1 border-t border-gray-200 dark:border-[#3e4451] bg-gray-50 dark:bg-[#21252b] shrink-0 text-xs"
  >
    <slot name="start" />
    <div class="ml-auto min-w-0 flex items-center gap-1">
      <button :class="iconBtnClass" title="새 객체 만들기" @click="emit('create')">
        <PackagePlus :size="14" />
      </button>
      <button
        :class="[iconBtnClass, 'relative', props.changeCount && activeClass]"
        title="변경 바구니"
        @click="emit('basket')"
      >
        <ListChecks :size="14" />
        <span
          v-if="props.changeCount"
          class="absolute -top-1 -right-1 min-w-3.5 h-3.5 px-0.5 rounded-full bg-[#61afef] text-white text-center text-[9px] leading-3.5 font-bold"
        >
          {{ props.changeCount }}
        </span>
      </button>
      <div :class="dividerClass"></div>
      <button
        :class="[iconBtnClass, isConsoleOpen && activeClass]"
        title="MQL 콘솔 (Alt+B)"
        @click="isConsoleOpen = !isConsoleOpen"
      >
        <Terminal :size="14" />
      </button>
      <div :class="dividerClass"></div>
      <div class="min-w-0 flex items-center gap-1.5 text-gray-500 dark:text-[#abb2bf]" :title="props.connection.message">
        <span class="w-2 h-2 shrink-0 rounded-full" :class="status.dot"></span>
        <span class="truncate">{{ props.context.label || status.label }}</span>
      </div>
      <button :class="iconBtnClass" title="MQL 재연결" @click="emit('reconnect')">
        <PlugZap :size="14" />
      </button>
    </div>
  </div>
</template>

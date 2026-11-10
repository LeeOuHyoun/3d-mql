<script setup>
import { clamp } from 'lodash-es'

const props = defineProps({
  items: { type: Array, required: true },
  index: { type: Number, default: 0 },
  caret: { type: Object, required: true },
})
const emit = defineEmits(['pick'])

const listRef = ref(null)
const { width, height } = useElementSize(listRef, undefined, { box: 'border-box' })
const { width: windowWidth, height: windowHeight } = useWindowSize()
const left = computed(() => clamp(props.caret.x, 8, Math.max(8, windowWidth.value - width.value - 8)))
const top = computed(() => {
  const below = props.caret.bottom + 2
  return below + height.value > windowHeight.value - 8 ? Math.max(8, props.caret.top - height.value - 2) : below
})

watch(
  () => props.index,
  () => nextTick(() => listRef.value?.querySelector('[data-active]')?.scrollIntoView({ block: 'nearest' })),
)
</script>

<template>
  <div
    ref="listRef"
    role="listbox"
    class="fixed z-50 py-1 min-w-48 max-w-[36rem] max-h-56 overflow-auto rounded-md border shadow-xl font-mono text-[11px] bg-white dark:bg-[#282c34] border-gray-200 dark:border-[#3e4451]"
    :style="{ left: `${left}px`, top: `${top}px` }"
    @mousedown.prevent
  >
    <button
      v-for="(item, at) in props.items"
      :key="at"
      type="button"
      role="option"
      :aria-selected="at === props.index"
      :data-active="at === props.index ? '' : undefined"
      :title="item.text"
      class="block w-full px-2 py-0.5 text-left truncate border-none cursor-pointer"
      :class="[
        at === props.index ? 'bg-[#61afef]/20' : 'bg-transparent hover:bg-gray-100 dark:hover:bg-white/5',
        item.isTemplate ? 'italic text-violet-600 dark:text-[#c678dd]' : 'text-gray-700 dark:text-[#abb2bf]',
      ]"
      @mousedown.prevent="emit('pick', at)"
    >
      {{ item.text }}
    </button>
  </div>
</template>

<script setup>
import { partition } from 'lodash-es'

const MAX_OPTIONS = 100
const LIST_MAX_HEIGHT = 224
const LIST_GAP = 4

defineOptions({ inheritAttrs: false })

const props = defineProps({
  options: { type: Array, default: () => [] },
})
const value = defineModel({ type: String, default: '' })

const inputRef = ref(null)
const listRef = ref(null)
const isOpen = ref(false)
const query = ref('')
const activeIndex = ref(-1)

const matches = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  if (!keyword) return props.options
  const found = props.options.filter((name) => name.toLowerCase().includes(keyword))
  return partition(found, (name) => name.toLowerCase().startsWith(keyword)).flat()
})
const visibleOptions = computed(() => matches.value.slice(0, MAX_OPTIONS))
const isShown = computed(() => isOpen.value && visibleOptions.value.length > 0)

const { top, bottom, left, width, update: updateBounding } = useElementBounding(inputRef)
const { height: windowHeight } = useWindowSize()
const listStyle = computed(() => {
  const spaceBelow = windowHeight.value - bottom.value - LIST_GAP * 2
  const spaceAbove = top.value - LIST_GAP * 2
  const isAbove = spaceBelow < LIST_MAX_HEIGHT && spaceAbove > spaceBelow
  return {
    left: `${left.value}px`,
    width: `${width.value}px`,
    maxHeight: `${Math.min(LIST_MAX_HEIGHT, isAbove ? spaceAbove : spaceBelow)}px`,
    ...(isAbove
      ? { bottom: `${windowHeight.value - top.value + LIST_GAP}px` }
      : { top: `${bottom.value + LIST_GAP}px` }),
  }
})

const open = () => {
  updateBounding()
  query.value = ''
  activeIndex.value = -1
  isOpen.value = true
}

const close = () => {
  isOpen.value = false
}

const handleClick = () => {
  if (!isOpen.value) open()
}

const handleInput = (e) => {
  query.value = e.target.value
  activeIndex.value = -1
  isOpen.value = true
}

const select = (name) => {
  value.value = name
  close()
}

const moveActive = (step) => {
  if (!isOpen.value) return open()
  const count = visibleOptions.value.length
  if (!count) return
  activeIndex.value = activeIndex.value < 0 ? (step > 0 ? 0 : count - 1) : (activeIndex.value + step + count) % count
}

const handleKeydown = (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    moveActive(e.key === 'ArrowDown' ? 1 : -1)
  } else if (e.key === 'Enter' && isShown.value && activeIndex.value >= 0) {
    e.preventDefault()
    select(visibleOptions.value[activeIndex.value])
  } else if (e.key === 'Escape' || e.key === 'Tab') {
    if (e.key === 'Escape' && isShown.value) e.stopPropagation()
    close()
  }
}

watch(activeIndex, async (index) => {
  await nextTick()
  listRef.value?.children[index]?.scrollIntoView({ block: 'nearest' })
})
</script>

<template>
  <input
    ref="inputRef"
    v-model="value"
    v-bind="$attrs"
    autocomplete="off"
    :aria-expanded="isShown"
    @focus="open"
    @click="handleClick"
    @blur="close"
    @input="handleInput"
    @keydown="handleKeydown"
  />
  <Teleport to="body">
    <ul
      v-if="isShown"
      ref="listRef"
      class="fixed z-[60] m-0 p-1 list-none overflow-auto rounded-md border shadow-xl text-xs bg-white dark:bg-[#21252b] border-gray-200 dark:border-[#3e4451] text-gray-800 dark:text-[#abb2bf]"
      :style="listStyle"
      @mousedown.prevent
    >
      <li
        v-for="(name, index) in visibleOptions"
        :key="name"
        class="px-2 py-1 rounded truncate cursor-pointer"
        :class="index === activeIndex ? 'bg-[#61afef]/15 text-[#61afef]' : 'hover:bg-gray-100 dark:hover:bg-white/5'"
        :title="name"
        @click="select(name)"
      >
        {{ name }}
      </li>
      <li v-if="matches.length > MAX_OPTIONS" class="px-2 py-1 text-gray-400 dark:text-[#5c6370]">
        외 {{ matches.length - MAX_OPTIONS }}개 · 더 입력하면 좁혀집니다
      </li>
    </ul>
  </Teleport>
</template>

<script setup>
const props = defineProps({
  menu: { type: Object, required: true },
  items: { type: Array, required: true },
})
const emit = defineEmits(['action', 'close'])
const menuRef = ref(null)

onClickOutside(menuRef, () => emit('close'))

const handleEscape = (e) => {
  if (e.key !== 'Escape') return
  e.preventDefault()
  e.stopPropagation()
  emit('close')
}

useEventListener(window, 'keydown', handleEscape, { capture: true })
useEventListener(window, 'scroll', () => emit('close'), { capture: true, passive: true })
</script>

<template>
  <div
    ref="menuRef"
    class="fixed z-50 ml-1 py-1 min-w-44 rounded-lg border shadow-xl text-xs bg-white dark:bg-[#282c34] border-gray-200 dark:border-[#3e4451]"
    :style="{ left: `${props.menu.x}px`, top: `${props.menu.y}px` }"
    @contextmenu.prevent
  >
    <button
      v-for="item in props.items"
      :key="item.action"
      class="w-full flex items-center gap-2 px-3 py-2 font-semibold border-none bg-transparent cursor-pointer whitespace-nowrap transition-colors"
      :class="item.color"
      @click="emit('action', item.action)"
    >
      <component :is="item.icon" :size="14" />
      {{ item.label }}
    </button>
  </div>
</template>

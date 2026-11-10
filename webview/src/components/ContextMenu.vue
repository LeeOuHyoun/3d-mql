<script setup>
import ContextMenuItem from './ContextMenuItem.vue'

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

const { width, height } = useElementSize(menuRef, undefined, { box: 'border-box' })
const { width: windowWidth, height: windowHeight } = useWindowSize()
const left = computed(() => Math.max(0, Math.min(props.menu.x, windowWidth.value - width.value - 8)))
const top = computed(() => Math.max(0, Math.min(props.menu.y, windowHeight.value - height.value - 8)))
const isSubmenuFlipped = computed(() => left.value + width.value * 2 > windowWidth.value)

const openKey = ref('')

const handleSelect = (item) => {
  if (item.children) openKey.value = item.action
  else emit('action', item.action)
}

const emitAction = (action) => emit('action', action)

const panelClass =
  'py-1 min-w-44 rounded-lg border shadow-xl text-xs bg-white dark:bg-[#282c34] border-gray-200 dark:border-[#3e4451]'
</script>

<template>
  <div
    ref="menuRef"
    :class="['fixed z-50 ml-1 origin-top-left animate-pop-in', panelClass]"
    :style="{ left: `${left}px`, top: `${top}px` }"
    @contextmenu.prevent
  >
    <div v-for="item in props.items" :key="item.action" class="relative" @mouseenter="openKey = item.action">
      <ContextMenuItem :item="item" @select="handleSelect" @action="emitAction" />
      <div
        v-if="item.children && openKey === item.action"
        :class="[
          'absolute -top-1 animate-pop-in',
          isSubmenuFlipped ? 'right-full mr-1 origin-top-right' : 'left-full ml-1 origin-top-left',
          panelClass,
        ]"
      >
        <ContextMenuItem
          v-for="child in item.children"
          :key="child.action"
          :item="child"
          @select="handleSelect"
          @action="emitAction"
        />
      </div>
    </div>
  </div>
</template>

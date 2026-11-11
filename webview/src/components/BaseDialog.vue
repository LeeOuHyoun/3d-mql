<script>
const openDialogs = []
</script>

<script setup>
import { X } from '@lucide/vue'

const props = defineProps({
  title: { type: String, required: true },
  widthClass: { type: String, default: 'w-96' },
})
const emit = defineEmits(['close'])

const token = Symbol('dialog')
openDialogs.push(token)
tryOnScopeDispose(() => openDialogs.splice(openDialogs.indexOf(token), 1))

const handleEscape = (e) => {
  if (e.key !== 'Escape' || openDialogs.at(-1) !== token || e.target.getAttribute?.('aria-expanded') === 'true') return
  e.preventDefault()
  e.stopPropagation()
  emit('close')
}

useEventListener(window, 'keydown', handleEscape, { capture: true })
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" @click.self="emit('close')">
    <div
      class="max-w-full max-h-[85vh] flex flex-col rounded-xl border shadow-2xl text-xs bg-white dark:bg-[#282c34] border-gray-200 dark:border-[#3e4451] text-gray-800 dark:text-[#abb2bf]"
      :class="props.widthClass"
    >
      <div class="px-4 py-3 border-b border-gray-200 dark:border-[#3e4451] flex items-center justify-between shrink-0">
        <h3 class="text-sm font-bold text-gray-900 dark:text-[#61afef] m-0 truncate">{{ props.title }}</h3>
        <button
          class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 bg-transparent border-none rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
          @click="emit('close')"
        >
          <X :size="14" />
        </button>
      </div>
      <slot />
    </div>
  </div>
</template>

<script setup>
import { ChevronRight } from '@lucide/vue'

const props = defineProps({
  item: { type: Object, required: true },
})
const emit = defineEmits(['select', 'action'])

const buttonClass = 'flex items-center gap-2 py-2 font-semibold border-none bg-transparent text-inherit cursor-pointer whitespace-nowrap'
</script>

<template>
  <div class="flex items-center pr-1 transition-colors" :class="props.item.color">
    <button :class="[buttonClass, 'flex-1 pl-3 pr-2']" @click="emit('select', props.item)">
      <component :is="props.item.icon" v-if="props.item.icon" :size="14" />
      <span class="flex-1 text-left">{{ props.item.label }}</span>
      <ChevronRight v-if="props.item.children" :size="12" />
    </button>
    <button
      v-for="extra in props.item.extras"
      :key="extra.action"
      :class="[buttonClass, 'px-1.5 rounded opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10']"
      :title="extra.title"
      @click="emit('action', extra.action)"
    >
      <component :is="extra.icon" :size="13" />
    </button>
  </div>
</template>

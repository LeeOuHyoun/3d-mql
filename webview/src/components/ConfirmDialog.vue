<script setup>
import { TriangleAlert } from '@lucide/vue'
import BaseDialog from './BaseDialog.vue'

const props = defineProps({
  title: { type: String, required: true },
  message: { type: String, default: '' },
  items: { type: Array, default: () => [] },
  confirmLabel: { type: String, default: '확인' },
})
const emit = defineEmits(['confirm', 'close'])
</script>

<template>
  <BaseDialog :title="props.title" width-class="w-[32rem]" @close="emit('close')">
    <div class="p-4 flex flex-col gap-3 min-h-0">
      <div class="flex items-start gap-2 text-red-600 dark:text-red-400">
        <TriangleAlert :size="16" class="shrink-0 mt-px" />
        <span class="whitespace-pre-wrap">{{ props.message }}</span>
      </div>
      <ul v-if="props.items.length" class="m-0 pl-5 max-h-48 overflow-auto break-all flex flex-col gap-1">
        <li v-for="item in props.items" :key="item">{{ item }}</li>
      </ul>
      <div class="flex justify-end gap-2 pt-1">
        <button
          type="button"
          class="h-7 px-3 rounded-md border border-gray-200 dark:border-[#3e4451] bg-transparent text-xs cursor-pointer"
          @click="emit('close')"
        >
          취소
        </button>
        <button
          type="button"
          class="h-7 px-3 rounded-md border-none bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer"
          @click="emit('confirm')"
        >
          {{ props.confirmLabel }}
        </button>
      </div>
    </div>
  </BaseDialog>
</template>

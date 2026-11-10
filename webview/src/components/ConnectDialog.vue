<script setup>
import { toFields } from '../composables/useChangePreview.js'
import BaseDialog from './BaseDialog.vue'
import RelationshipFields from './RelationshipFields.vue'

const props = defineProps({
  items: { type: Array, required: true },
  edges: { type: Array, default: () => [] },
  relations: { type: Array, default: () => [] },
})
const emit = defineEmits(['submit', 'close'])

const isSwapped = ref(false)
const relType = ref('')
const attributes = ref({})
const relName = computed(() => relType.value.trim())

const handleSubmit = () => {
  if (!relName.value) return
  const [from, to] = isSwapped.value ? [...props.items].reverse() : props.items
  emit('submit', { from: from.id, to: to.id, relType: relName.value, attributes: toFields(attributes.value) })
}
</script>

<template>
  <BaseDialog title="연결(connect) 문장 만들기" width-class="w-[34rem]" @close="emit('close')">
    <form class="flex-1 min-h-0 overflow-auto p-4 flex flex-col gap-3" @submit.prevent="handleSubmit">
      <RelationshipFields
        v-model:swapped="isSwapped"
        v-model:rel-type="relType"
        v-model:attributes="attributes"
        :items="props.items"
        :edges="props.edges"
        :relations="props.relations"
      />
      <div class="flex justify-end gap-2 pt-1">
        <button
          type="button"
          class="h-7 px-3 rounded-md border border-gray-200 dark:border-[#3e4451] bg-transparent text-xs cursor-pointer"
          @click="emit('close')"
        >
          취소
        </button>
        <button
          type="submit"
          :disabled="!relName"
          class="h-7 px-3 rounded-md border-none bg-[#61afef] hover:bg-[#4b8bca] text-white text-xs font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-default"
        >
          바구니에 담기
        </button>
      </div>
    </form>
  </BaseDialog>
</template>

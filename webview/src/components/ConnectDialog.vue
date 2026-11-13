<script setup>
import { toFields } from '../composables/useChangePreview.js'
import BaseDialog from './BaseDialog.vue'
import RelationshipFields from './RelationshipFields.vue'

const props = defineProps({
  items: { type: Array, required: true },
  edges: { type: Array, default: () => [] },
  relations: { type: Array, default: () => [] },
  isBusy: { type: Boolean, default: false },
})
const emit = defineEmits(['submit', 'close'])

const isSwapped = ref(false)
const relType = ref('')
const attributes = ref({})
const relName = computed(() => relType.value.trim())

const hasPendingEnd = props.items.some((item) => item.isPending)
const immediateBlock = computed(() =>
  hasPendingEnd
    ? '바구니에 담긴 새 객체가 있어 바로 연결할 수 없습니다. 바구니에 담아 함께 실행하세요.'
    : props.isBusy
      ? '바구니를 실행하는 동안에는 바로 연결할 수 없습니다.'
      : '',
)

const handleSubmit = (isImmediate) => {
  if (!relName.value || (isImmediate && immediateBlock.value)) return
  const [from, to] = isSwapped.value ? [...props.items].reverse() : props.items
  emit(
    'submit',
    { from: from.id, to: to.id, relType: relName.value, attributes: toFields(attributes.value) },
    isImmediate,
  )
}

const buttonClass =
  'h-7 px-3 rounded-md text-xs font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-default'
</script>

<template>
  <BaseDialog title="연결(connect) 문장 만들기" width-class="w-[34rem]" @close="emit('close')">
    <form class="flex-1 min-h-0 overflow-auto p-4 flex flex-col gap-3" @submit.prevent="handleSubmit(false)">
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
          type="button"
          :disabled="!relName || !!immediateBlock"
          :title="immediateBlock || '바구니를 거치지 않고 이 연결 문장만 곧바로 실행합니다. 실행 기록에 남아 되돌릴 수 있습니다.'"
          :class="[buttonClass, 'border border-[#61afef] bg-transparent text-[#61afef] hover:bg-[#61afef]/10']"
          @click="handleSubmit(true)"
        >
          바로 연결
        </button>
        <button
          type="submit"
          :disabled="!relName"
          :class="[buttonClass, 'border-none bg-[#61afef] hover:bg-[#4b8bca] text-white']"
        >
          바구니에 담기
        </button>
      </div>
    </form>
  </BaseDialog>
</template>

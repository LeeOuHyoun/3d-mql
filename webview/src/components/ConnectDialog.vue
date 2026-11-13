<script setup>
import { toFields } from '../composables/useChangePreview.js'
import BaseDialog from './BaseDialog.vue'
import ChangeActions from './ChangeActions.vue'
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

const pendingBlock = props.items.some((item) => item.isPending)
  ? '바구니에 담긴 새 객체가 있어 바로 실행할 수 없습니다. 바구니에 담아 함께 실행하세요.'
  : ''

const handleSubmit = (isImmediate) => {
  if (!relName.value) return
  const [from, to] = isSwapped.value ? [...props.items].reverse() : props.items
  emit(
    'submit',
    { from: from.id, to: to.id, relType: relName.value, attributes: toFields(attributes.value) },
    isImmediate,
  )
}
</script>

<template>
  <BaseDialog title="연결(connect)" width-class="w-[34rem]" @close="emit('close')">
    <form class="flex-1 min-h-0 overflow-auto p-4 flex flex-col gap-3" @submit.prevent="handleSubmit(true)">
      <RelationshipFields
        v-model:swapped="isSwapped"
        v-model:rel-type="relType"
        v-model:attributes="attributes"
        :items="props.items"
        :edges="props.edges"
        :relations="props.relations"
      />
      <div class="flex justify-end gap-2 pt-1">
        <ChangeActions
          :can-submit="!!relName"
          :is-busy="props.isBusy"
          :block-reason="pendingBlock"
          @basket="handleSubmit(false)"
          @close="emit('close')"
        />
      </div>
    </form>
  </BaseDialog>
</template>

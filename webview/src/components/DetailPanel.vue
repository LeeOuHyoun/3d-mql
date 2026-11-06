<script setup>
import { X, Copy, Check, Loader2, Network, CornerRightUp } from '@lucide/vue'
import { usePanelResize } from '../composables/usePanelResize.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  item: { type: Object, default: null },
  detail: { type: Object, default: null },
  isLoading: { type: Boolean, default: false },
})
const emit = defineEmits(['close', 'expand'])

const { copy, copied } = useClipboard({ legacy: true })
const copiedKey = ref('')

const handleCopy = (text, key) => {
  copy(text)
  copiedKey.value = key
}

const itemId = computed(() => props.item?.originalId || props.item?.id || '')
const propertyFilter = ref('')

watch(itemId, () => {
  propertyFilter.value = ''
})

const matches = ({ key, value }) => {
  const query = propertyFilter.value.toLowerCase().trim()
  return !query || key.toLowerCase().includes(query) || value.toLowerCase().includes(query)
}

const sections = computed(() =>
  [
    { title: 'Basic', fields: props.detail?.basics || [] },
    { title: 'Attributes', fields: props.detail?.attributes || [] },
  ].map((section) => ({ ...section, fields: section.fields.filter(matches) })),
)

const { width, onResizeStart } = usePanelResize('detail', 320, 'left')

const actionBtnClass =
  'flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-semibold rounded-md border transition-all active:scale-[0.98] cursor-pointer'
</script>

<template>
  <div
    v-if="props.open"
    class="relative h-full border-l border-gray-200 dark:border-[#3e4451] bg-gray-50 dark:bg-[#21252b] flex flex-col shrink-0 overflow-hidden"
    :style="{ width: `${width}px` }"
  >
    <div
      class="absolute top-0 left-0 bottom-0 w-1 z-10 cursor-col-resize hover:bg-[#61afef]/40"
      @pointerdown.prevent="onResizeStart"
    ></div>
    <div
      class="px-4 py-3 border-b border-gray-200 dark:border-[#3e4451] flex items-center justify-between shrink-0 bg-white dark:bg-[#282c34]"
    >
      <h3 class="text-sm font-bold text-gray-900 dark:text-[#61afef] m-0 truncate">
        {{ props.item?.isEdge ? 'Edge Properties' : 'Node Properties' }}
      </h3>
      <button
        class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 bg-transparent border-none rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
        @click="emit('close')"
      >
        <X :size="14" />
      </button>
    </div>

    <div v-if="!props.item" class="flex-1 flex items-center justify-center p-4 text-xs text-gray-400 italic">
      노드나 관계를 선택하면 상세 정보가 표시됩니다.
    </div>
    <div v-else-if="props.item.isCluster" class="p-4 text-xs text-gray-500 dark:text-[#abb2bf]">
      Cluster · {{ props.item.clusterCount }} items<br />
      <span class="text-gray-400">더블클릭하면 펼칩니다.</span>
    </div>
    <template v-else>
      <div
        class="px-4 py-3 border-b border-gray-200 dark:border-[#3e4451] bg-white dark:bg-[#282c34] shrink-0 flex flex-col gap-2"
      >
        <div class="text-xs text-gray-800 dark:text-[#abb2bf] break-all">
          <div class="font-bold text-[13px] text-[#4b8bca] dark:text-[#61afef]">
            {{ props.item.isEdge ? props.item.label : `${props.item.name} ${props.item.revision}` }}
          </div>
          <div v-if="props.item.isNode" class="text-gray-500">{{ props.item.type }} · {{ props.item.current }}</div>
          <div class="font-mono text-[11px] text-gray-400">{{ itemId }}</div>
        </div>
        <div class="flex gap-2">
          <button
            :class="[actionBtnClass, 'border-transparent bg-[#34495e] hover:bg-[#2c3e50] text-white']"
            @click="handleCopy(itemId, 'id')"
          >
            <Check v-if="copied && copiedKey === 'id'" :size="14" class="text-green-400" />
            <Copy v-else :size="14" />
            Copy ID
          </button>
        </div>
        <div v-if="props.item.isNode" class="flex gap-2">
          <button
            :class="[
              actionBtnClass,
              'bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800 hover:bg-sky-100 dark:hover:bg-sky-900/40',
            ]"
            @click="emit('expand', itemId, 'from')"
          >
            <Network :size="14" />
            Expand (From)
          </button>
          <button
            :class="[
              actionBtnClass,
              'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800 hover:bg-cyan-100 dark:hover:bg-cyan-900/40',
            ]"
            @click="emit('expand', itemId, 'to')"
          >
            <CornerRightUp :size="14" />
            Where Used (To)
          </button>
        </div>
      </div>
      <div class="px-4 py-2 border-b border-gray-200 dark:border-[#3e4451] shrink-0">
        <input
          v-model="propertyFilter"
          placeholder="속성 필터"
          spellcheck="false"
          class="w-full h-7 px-2 text-xs rounded-md border border-gray-200 dark:border-[#3e4451] bg-white dark:bg-[#282c34] text-gray-800 dark:text-[#abb2bf] outline-none focus:border-[#61afef]"
        />
      </div>
      <div class="flex-1 overflow-auto">
        <div v-if="props.isLoading" class="flex items-center justify-center gap-2 p-4 text-xs text-gray-400">
          <Loader2 :size="14" class="animate-spin" />
          불러오는 중...
        </div>
        <template v-else>
          <div v-for="section in sections" :key="section.title">
            <div
              class="sticky top-0 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-[#5c6370] bg-gray-100 dark:bg-[#2c313a]"
            >
              {{ section.title }} ({{ section.fields.length }})
            </div>
            <div
              v-for="(field, index) in section.fields"
              :key="`${section.title}-${field.key}-${index}`"
              class="px-4 py-1.5 border-b border-gray-100 dark:border-[#3e4451]/60 flex gap-2 text-xs"
            >
              <span class="w-28 shrink-0 text-gray-500 dark:text-[#5c6370] break-all">{{ field.key }}</span>
              <span
                class="flex-1 min-w-0 break-all whitespace-pre-wrap text-gray-800 dark:text-[#abb2bf] cursor-pointer hover:text-[#61afef]"
                title="클릭하여 복사"
                @click="handleCopy(field.value, `${section.title}-${field.key}-${index}`)"
              >
                {{ field.value || '-' }}
                <Check
                  v-if="copied && copiedKey === `${section.title}-${field.key}-${index}`"
                  :size="12"
                  class="inline text-green-500"
                />
              </span>
            </div>
          </div>
        </template>
      </div>
    </template>
  </div>
</template>

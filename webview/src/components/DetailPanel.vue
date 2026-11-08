<script setup>
import { X, Copy, Check, Loader2, Network, CornerRightUp, Crosshair, Pin, Expand } from '@lucide/vue'
import { request } from '@/api.js'
import { usePanelResize } from '../composables/usePanelResize.js'
import { objectIdPattern } from '../composables/useGraphExplorer.js'
import ContextMenu from './ContextMenu.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  item: { type: Object, default: null },
  detail: { type: Object, default: null },
  isLoading: { type: Boolean, default: false },
})
const emit = defineEmits(['close', 'expand', 'openRoot', 'pin', 'expandCluster'])

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
  tab.value = 'properties'
})

const includesQuery = (...values) => {
  const query = propertyFilter.value.toLowerCase().trim()
  return !query || values.some((value) => (value || '').toLowerCase().includes(query))
}

const matches = ({ key, value }) => includesQuery(key, value)

const sections = computed(() =>
  [
    { title: 'Basic', fields: props.detail?.basics || [] },
    { title: 'Attributes', fields: props.detail?.attributes || [] },
  ].map((section) => ({ ...section, fields: section.fields.filter(matches) })),
)

const tabs = [
  { value: 'properties', label: 'Properties' },
  { value: 'history', label: 'History' },
  { value: 'states', label: 'States' },
]
const tab = ref('properties')
const extra = ref(null)
const isExtraLoading = ref(false)

watch(tab, async (value) => {
  const id = itemId.value
  if (value === 'properties' || extra.value?.id === id) return
  isExtraLoading.value = true
  try {
    const result = await request('objectExtra', { id })
    if (id === itemId.value) extra.value = { id, ...result }
  } catch (e) {
    if (id === itemId.value) extra.value = { id, error: e.message, states: [], history: [] }
  } finally {
    isExtraLoading.value = false
  }
})

const filteredHistory = computed(() => (extra.value?.history || []).filter((line) => includesQuery(line)))

const filteredMembers = computed(() =>
  (props.item?.members || []).filter((m) => includesQuery(m.name, m.revision, m.type, m.current, m.id)),
)

const valueMenu = shallowRef(null)
const valueMenuItems = [
  {
    action: 'openRoot',
    label: '기준 객체로 보기',
    icon: Crosshair,
    color: 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/40',
  },
  {
    action: 'copy',
    label: '값 복사',
    icon: Copy,
    color: 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/40',
  },
]

const openValueMenu = (e, value) => {
  if (objectIdPattern.test(value.trim())) valueMenu.value = { x: e.clientX, y: e.clientY, value: value.trim() }
}

const handleValueMenuAction = (action) => {
  const { value } = valueMenu.value
  valueMenu.value = null
  if (action === 'openRoot') emit('openRoot', value)
  else copy(value)
}

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
    <template v-else-if="props.item.isCluster">
      <div
        class="px-4 py-3 border-b border-gray-200 dark:border-[#3e4451] bg-white dark:bg-[#282c34] shrink-0 flex flex-col gap-2 text-xs"
      >
        <div class="font-bold text-[13px] text-[#4b8bca] dark:text-[#61afef] break-all">
          {{ (props.item.label || '').replace(/\n/g, ' ') }}
        </div>
        <button
          :class="[
            actionBtnClass,
            'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/40',
          ]"
          @click="emit('expandCluster', props.item.clusterKey)"
        >
          <Expand :size="14" />
          모두 펼치기 ({{ props.item.members.length }})
        </button>
      </div>
      <div class="px-4 py-2 border-b border-gray-200 dark:border-[#3e4451] shrink-0">
        <input
          v-model="propertyFilter"
          placeholder="객체 필터"
          spellcheck="false"
          class="w-full h-7 px-2 text-xs rounded-md border border-gray-200 dark:border-[#3e4451] bg-white dark:bg-[#282c34] text-gray-800 dark:text-[#abb2bf] outline-none focus:border-[#61afef]"
        />
      </div>
      <div class="flex-1 overflow-auto">
        <div
          v-for="member in filteredMembers"
          :key="member.id"
          class="group px-4 py-2 border-b border-gray-100 dark:border-[#3e4451]/60 flex items-start gap-2 text-xs"
        >
          <div class="flex-1 min-w-0 break-all">
            <div class="font-semibold text-gray-800 dark:text-[#abb2bf]">
              {{ member.name }} <span class="text-gray-400">{{ member.revision }}</span>
            </div>
            <div class="text-[11px] text-gray-500">{{ member.type }} · {{ member.current }}</div>
            <div class="font-mono text-[11px] text-gray-400">{{ member.id }}</div>
          </div>
          <div class="flex shrink-0 invisible group-hover:visible">
            <button
              class="p-1 flex border-none bg-transparent text-gray-400 hover:text-[#61afef] cursor-pointer"
              title="그래프에 꺼내기"
              @click="emit('pin', member.id)"
            >
              <Pin :size="13" />
            </button>
            <button
              class="p-1 flex border-none bg-transparent text-gray-400 hover:text-emerald-500 cursor-pointer"
              title="기준 객체로 보기"
              @click="emit('openRoot', member.id)"
            >
              <Crosshair :size="13" />
            </button>
            <button
              class="p-1 flex border-none bg-transparent text-gray-400 hover:text-amber-500 cursor-pointer"
              title="ID 복사"
              @click="handleCopy(member.id, `member-${member.id}`)"
            >
              <Check v-if="copied && copiedKey === `member-${member.id}`" :size="13" class="text-green-500" />
              <Copy v-else :size="13" />
            </button>
          </div>
        </div>
      </div>
    </template>
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
      <div v-if="props.item.isNode" class="flex border-b border-gray-200 dark:border-[#3e4451] shrink-0 text-xs">
        <button
          v-for="item in tabs"
          :key="item.value"
          class="flex-1 py-1.5 border-0 border-b-2 border-solid bg-transparent font-semibold cursor-pointer"
          :class="
            tab === item.value
              ? 'border-[#61afef] text-[#4b8bca] dark:text-[#61afef]'
              : 'border-transparent text-gray-500 dark:text-[#5c6370]'
          "
          @click="tab = item.value"
        >
          {{ item.label }}
        </button>
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
        <div
          v-if="tab === 'properties' ? props.isLoading : isExtraLoading"
          class="flex items-center justify-center gap-2 p-4 text-xs text-gray-400"
        >
          <Loader2 :size="14" class="animate-spin" />
          불러오는 중...
        </div>
        <div v-else-if="tab !== 'properties' && extra?.error" class="p-4 text-xs text-red-500 whitespace-pre-wrap">
          {{ extra.error }}
        </div>
        <template v-else-if="tab === 'history'">
          <div
            v-for="(line, index) in filteredHistory"
            :key="index"
            class="px-4 py-1.5 border-b border-gray-100 dark:border-[#3e4451]/60 font-mono text-[11px] break-all whitespace-pre-wrap text-gray-800 dark:text-[#abb2bf]"
          >
            {{ line }}
          </div>
          <div v-if="!filteredHistory.length" class="p-4 text-xs text-gray-400 italic text-center">기록이 없습니다.</div>
        </template>
        <template v-else-if="tab === 'states'">
          <div
            v-for="(state, index) in extra?.states || []"
            :key="state"
            class="px-4 py-1.5 border-b border-gray-100 dark:border-[#3e4451]/60 flex items-center gap-2 text-xs"
            :class="state === extra.current && 'bg-emerald-50 dark:bg-emerald-900/20'"
          >
            <span class="w-5 text-right text-gray-400">{{ index + 1 }}</span>
            <span
              class="flex-1"
              :class="state === extra.current ? 'font-bold text-emerald-700 dark:text-emerald-300' : 'text-gray-800 dark:text-[#abb2bf]'"
            >
              {{ state }}
            </span>
            <span v-if="state === extra.current" class="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
              CURRENT
            </span>
          </div>
        </template>
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
                title="클릭하여 복사 · ID 값은 우클릭으로 열기"
                @click="handleCopy(field.value, `${section.title}-${field.key}-${index}`)"
                @contextmenu.prevent="openValueMenu($event, field.value)"
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
    <ContextMenu
      v-if="valueMenu"
      :menu="valueMenu"
      :items="valueMenuItems"
      @action="handleValueMenuAction"
      @close="valueMenu = null"
    />
  </div>
</template>

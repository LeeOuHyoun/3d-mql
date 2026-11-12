<script setup>
import {
  X,
  Copy,
  Check,
  Loader2,
  ChevronsDown,
  CornerRightUp,
  Crosshair,
  Pin,
  Expand,
  LocateFixed,
  Funnel,
  Pencil,
  Unlink,
  Undo2,
} from '@lucide/vue'
import { cachedRequest, request } from '@/api.js'
import { usePanelResize } from '../composables/usePanelResize.js'
import { objectIdPattern } from '../composables/useGraphExplorer.js'
import ContextMenu from './ContextMenu.vue'
import DetailStates from './DetailStates.vue'
import DetailTriggers from './DetailTriggers.vue'
import DetailDefinition from './DetailDefinition.vue'
import DetailLinks from './DetailLinks.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  item: { type: Object, default: null },
  selectionCount: { type: Number, default: 0 },
  detail: { type: Object, default: null },
  isLoading: { type: Boolean, default: false },
})
const emit = defineEmits([
  'close',
  'opened',
  'locate',
  'expand',
  'openRoot',
  'pin',
  'expandCluster',
  'where',
  'change',
  'edit',
  'editPending',
  'removePending',
  'disconnect',
  'attach',
])

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

const nodeTabs = [
  { value: 'properties', label: 'Properties' },
  { value: 'history', label: 'History' },
  { value: 'states', label: 'States' },
  { value: 'triggers', label: 'Triggers' },
]
const edgeTabs = [
  { value: 'properties', label: 'Properties' },
  { value: 'definition', label: 'Definition' },
  { value: 'links', label: 'Links' },
  { value: 'triggers', label: 'Triggers' },
]
const extraTabs = ['history', 'states']
const filterTabs = ['properties', 'history']
const tabs = computed(() => (props.item?.isEdge ? edgeTabs : nodeTabs))
const isReal = computed(
  () => !props.item?.inert && !props.item?.virtual && !String(props.item?.id).startsWith('edge-cluster'),
)
const isEditable = computed(() => !!props.item && isReal.value && !props.item.isCluster)
const tab = ref('properties')
const extra = ref(null)
const isExtraLoading = ref(false)

const loadExtra = async () => {
  const id = itemId.value
  if (!extraTabs.includes(tab.value) || extra.value?.id === id) return
  isExtraLoading.value = true
  try {
    const result = await request('objectExtra', { id })
    if (id === itemId.value) extra.value = { id, ...result }
  } catch (e) {
    if (id === itemId.value) extra.value = { id, error: e.message, states: [], history: [] }
  } finally {
    if (id === itemId.value) isExtraLoading.value = false
  }
}

watch(tab, loadExtra)
watch(
  () => props.detail,
  () => {
    extra.value = null
    loadExtra()
  },
)

const emitStateChange = (params) => emit('change', { ...params, id: itemId.value })

const triggerSource = computed(() =>
  props.item?.isEdge
    ? { relationship: props.item.label }
    : { type: props.item?.type, policy: props.detail?.basics.find((field) => field.key === 'policy')?.value },
)

const filteredHistory = computed(() => (extra.value?.history || []).filter((line) => includesQuery(line)))

const filteredMembers = computed(() =>
  (props.item?.members || []).filter((m) => includesQuery(m.name, m.revision, m.type, m.current, m.id)),
)

const symbolics = shallowRef(null)
const adminTypes = computed(() =>
  props.item?.isEdge ? { type: 'relationship' } : { type: 'type', policy: 'policy', vault: 'vault' },
)

const symbolicKey = (section, field) => {
  if (section === 'Attributes') return `attribute ${field.key}`
  return adminTypes.value[field.key] ? `${adminTypes.value[field.key]} ${field.value}` : ''
}

watch(
  () => props.detail,
  async (detail) => {
    symbolics.value = null
    if (!detail) return
    const names = [
      ...detail.basics.map((field) => symbolicKey('Basic', field)),
      ...detail.attributes.map((field) => symbolicKey('Attributes', field)),
    ].filter(Boolean)
    const result = await cachedRequest('symbolics', { names }).catch(() => null)
    if (detail === props.detail) symbolics.value = result
  },
  { immediate: true },
)

const symbolicLabel = (section, field) => {
  const key = section === 'Basic' && symbolicKey(section, field)
  return key && symbolics.value ? symbolics.value[key] || '심볼릭 미등록' : ''
}

const modifiableBasics = ['name', 'revision', 'description', 'owner']
const menuColors = {
  emerald: 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/40',
  amber: 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/40',
  sky: 'text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/40',
  violet: 'text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/40',
}
const valueMenu = shallowRef(null)

watch(itemId, () => (valueMenu.value = null))

const openValueMenu = (e, section, field) => {
  const key = symbolicKey(section, field)
  valueMenu.value = { x: e.clientX, y: e.clientY, section, field, symbolic: (key && symbolics.value?.[key]) || '' }
}

const valueMenuItems = computed(() => {
  const menu = valueMenu.value
  if (!menu) return []
  const { value } = menu.field
  const canModify = menu.section === 'Attributes' || (props.item.isNode && modifiableBasics.includes(menu.field.key))
  return [
    objectIdPattern.test(value.trim()) && {
      action: 'openRoot',
      label: '기준 객체로 보기',
      icon: Crosshair,
      color: menuColors.emerald,
    },
    { action: 'copy', label: '값 복사', icon: Copy, color: menuColors.amber },
    menu.symbolic && {
      action: 'symbolic',
      label: `심볼릭 이름 복사 (${menu.symbolic})`,
      icon: Copy,
      color: menuColors.amber,
    },
    props.item.isNode &&
      !value.includes('\n') && {
        action: 'where',
        label: '이 값으로 검색 조건 만들기',
        icon: Funnel,
        color: menuColors.sky,
      },
    canModify && { action: 'modify', label: '값 수정 문장 만들기…', icon: Pencil, color: menuColors.violet },
  ].filter(Boolean)
})

const whereOf = ({ section, field }) => {
  const mark = field.value.includes("'") ? '"' : "'"
  const name = section === 'Attributes' ? `attribute[${field.key}]` : field.key
  return `${name}==${mark}${field.value}${mark}`
}

const valueActions = {
  openRoot: (menu) => emit('openRoot', menu.field.value.trim()),
  copy: (menu) => copy(menu.field.value),
  symbolic: (menu) => copy(menu.symbolic),
  where: (menu) => emit('where', { expression: whereOf(menu), type: props.item.type }),
  modify: (menu) => emit('edit', { key: menu.field.key, isAttribute: menu.section === 'Attributes' }),
}

const handleValueMenuAction = (action) => {
  const menu = valueMenu.value
  valueMenu.value = null
  valueActions[action](menu)
}

const { width, onResizeStart } = usePanelResize('detail', 320, 'left')

const headerBtnClass =
  'p-1 flex shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 bg-transparent border-none rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer'

const actionBtnClass =
  'flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-semibold rounded-md border transition-all active:scale-[0.98] cursor-pointer'
</script>

<template>
  <Transition name="dock-right" @after-enter="emit('opened')">
    <div
      v-if="props.open"
      class="relative h-full border-l border-gray-200 dark:border-[#3e4451] bg-gray-50 dark:bg-[#21252b] flex flex-col shrink-0 overflow-hidden"
      :style="{ width: `${width}px`, '--panel-size': `${width}px` }"
    >
      <div
        class="absolute top-0 left-0 bottom-0 w-1 z-10 cursor-col-resize hover:bg-[#61afef]/40"
        @pointerdown.prevent="onResizeStart"
      ></div>
      <div
        class="px-4 py-3 border-b border-gray-200 dark:border-[#3e4451] flex items-center justify-between shrink-0 bg-white dark:bg-[#282c34]"
      >
        <h3 class="flex-1 min-w-0 text-sm font-bold text-gray-900 dark:text-[#61afef] m-0 truncate">
          {{ props.item?.isEdge ? 'Edge Properties' : 'Node Properties' }}
        </h3>
        <span
          v-if="props.selectionCount > 1"
          class="shrink-0 mr-1 px-1.5 rounded text-[11px] font-semibold bg-[#ff7a00]/15 text-[#c25e00] dark:text-[#ffa040]"
          title="선택한 노드를 우클릭하면 일괄 작업 메뉴가 열립니다."
        >
          {{ props.selectionCount }}개 선택됨
        </span>
        <button
          v-if="isEditable"
          :class="headerBtnClass"
          title="편집 (수정 문장을 변경 바구니에 담음)"
          @click="emit('edit', null)"
        >
          <Pencil :size="14" />
        </button>
        <button
          v-if="props.item"
          :class="headerBtnClass"
          title="그래프에서 찾기"
          @click="emit('locate')"
        >
          <LocateFixed :size="14" />
        </button>
        <button :class="headerBtnClass" title="닫기" @click="emit('close')">
          <X :size="14" />
        </button>
      </div>

      <div v-if="!props.item" class="flex-1 flex items-center justify-center p-4 text-xs text-gray-400 italic">
        노드나 관계를 선택하면 상세 정보가 표시됩니다.
      </div>
      <div
        v-else-if="props.item.isPending"
        class="px-4 py-3 border-b border-gray-200 dark:border-[#3e4451] bg-white dark:bg-[#282c34] shrink-0 flex flex-col gap-2 text-xs"
      >
        <div class="break-all text-gray-800 dark:text-[#abb2bf]">
          <div class="font-bold text-[13px] text-emerald-600 dark:text-emerald-400">
            {{ props.item.isEdge ? props.item.label : `${props.item.name} ${props.item.revision}` }}
          </div>
          <div v-if="props.item.isNode" class="text-gray-500">{{ props.item.type }}</div>
        </div>
        <div class="text-gray-500">
          변경 바구니에 담긴 {{ props.item.isEdge ? '연결 예정 관계' : '생성 예정 객체' }}입니다. 바구니를 실행하면
          만들어집니다.
        </div>
        <div class="flex gap-2">
          <button
            v-if="props.item.isNode"
            :class="[
              actionBtnClass,
              'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800 hover:bg-violet-100 dark:hover:bg-violet-900/40',
            ]"
            @click="emit('editPending', itemId)"
          >
            <Pencil :size="14" />
            생성 문장 고치기
          </button>
          <button
            :class="[
              actionBtnClass,
              'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40',
            ]"
            @click="emit('removePending', itemId)"
          >
            <Undo2 :size="14" />
            바구니에서 빼기
          </button>
        </div>
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
            <div v-if="props.item.virtual" class="text-[11px] text-gray-400">
              말단 전개(recurse to end)로 만든 가상 연결입니다. 실제 connection이 아닙니다.
            </div>
            <div v-else class="font-mono text-[11px] text-gray-400">{{ itemId }}</div>
          </div>
          <div v-if="!props.item.virtual" class="flex gap-2">
            <button
              :class="[actionBtnClass, 'border-transparent bg-[#34495e] hover:bg-[#2c3e50] text-white']"
              @click="handleCopy(itemId, 'id')"
            >
              <Check v-if="copied && copiedKey === 'id'" :size="14" class="text-green-400" />
              <Copy v-else :size="14" />
              Copy ID
            </button>
            <button
              v-if="props.item.isEdge && isReal"
              :class="[
                actionBtnClass,
                'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40',
              ]"
              title="연결 해제 문장과 되돌리는 문장을 변경 바구니에 담습니다."
              @click="emit('disconnect', itemId)"
            >
              <Unlink :size="14" />
              연결 해제 문장
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
              <ChevronsDown :size="14" />
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
        <div v-if="isReal" class="flex border-b border-gray-200 dark:border-[#3e4451] shrink-0 text-xs">
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
        <div v-if="filterTabs.includes(tab)" class="px-4 py-2 border-b border-gray-200 dark:border-[#3e4451] shrink-0">
          <input
            v-model="propertyFilter"
            placeholder="속성 필터"
            spellcheck="false"
            class="w-full h-7 px-2 text-xs rounded-md border border-gray-200 dark:border-[#3e4451] bg-white dark:bg-[#282c34] text-gray-800 dark:text-[#abb2bf] outline-none focus:border-[#61afef]"
          />
        </div>
        <div class="flex-1 overflow-auto">
          <DetailTriggers
            v-if="tab === 'triggers'"
            :source="triggerSource"
            :current="props.item.current"
            @openRoot="emit('openRoot', $event)"
          />
          <DetailDefinition v-else-if="tab === 'definition'" :name="props.item.label" />
          <DetailLinks v-else-if="tab === 'links'" :id="itemId" @attach="emit('attach', itemId)" />
          <div
            v-else-if="tab === 'properties' ? props.isLoading : isExtraLoading"
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
          <DetailStates v-else-if="tab === 'states' && extra" :id="itemId" :extra="extra" @change="emitStateChange" />
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
                  title="클릭하여 복사 · 우클릭: 값 메뉴"
                  @click="handleCopy(field.value, `${section.title}-${field.key}-${index}`)"
                  @contextmenu.prevent="openValueMenu($event, section.title, field)"
                >
                  {{ field.value || '-' }}
                  <Check
                    v-if="copied && copiedKey === `${section.title}-${field.key}-${index}`"
                    :size="12"
                    class="inline text-green-500"
                  />
                  <span
                    v-if="symbolicLabel(section.title, field)"
                    class="block font-mono text-[10px]"
                    :class="symbolics[symbolicKey(section.title, field)] ? 'text-gray-400' : 'text-amber-600 dark:text-amber-400'"
                  >
                    {{ symbolicLabel(section.title, field) }}
                  </span>
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
  </Transition>
</template>

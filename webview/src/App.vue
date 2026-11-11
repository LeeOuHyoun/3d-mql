<script setup>
import {
  X,
  Waypoints,
  ChevronsDown,
  CornerRightUp,
  Crosshair,
  Copy,
  Terminal,
  Play,
  TextCursorInput,
  SlidersHorizontal,
  Link2,
  GitCompareArrows,
  Route,
  Fullscreen,
  Minimize,
  Link,
  Unlink,
  Pencil,
  PackagePlus,
  Trash2,
  Undo2,
} from '@lucide/vue'
import { onMessage } from './api.js'
import { useGraphExplorer } from './composables/useGraphExplorer.js'
import { useMqlConsole } from './composables/useMqlConsole.js'
import { useMinimapLayout } from './composables/useMinimapLayout.js'
import GraphToolbar from './components/GraphToolbar.vue'
import GraphStatusBar from './components/GraphStatusBar.vue'
import SearchPanel from './components/SearchPanel.vue'
import RelationPanel from './components/RelationPanel.vue'
import DetailPanel from './components/DetailPanel.vue'
import GraphTooltip from './components/GraphTooltip.vue'
import GraphMinimap from './components/GraphMinimap.vue'
import BoxResizeHandles from './components/BoxResizeHandles.vue'
import GraphNotice from './components/GraphNotice.vue'
import ContextMenu from './components/ContextMenu.vue'
import MqlConsole from './components/MqlConsole.vue'
import ExpandDialog from './components/ExpandDialog.vue'
import CompareDialog from './components/CompareDialog.vue'
import ConnectDialog from './components/ConnectDialog.vue'
import ObjectEditDialog from './components/ObjectEditDialog.vue'
import ObjectCreateDialog from './components/ObjectCreateDialog.vue'
import ChangeBasketDialog from './components/ChangeBasketDialog.vue'
import ShortcutGuideDialog from './components/ShortcutGuideDialog.vue'

const {
  isDark,
  toggleTheme,
  cyContainer,
  cyRef,
  graphFilter,
  hasElements,
  tooltip,
  contextMenu,
  hideTooltip,
  hideContextMenu,
  errorMsg,
  connection,
  context,
  reconnect,
  isLoading,
  searchForm,
  searchResults,
  searchLimit,
  isSearching,
  isSearchPanelOpen,
  onSearch,
  addSearchCondition,
  loadRoot,
  expand,
  clearGraph,
  refresh,
  loadedAt,
  isStale,
  notice,
  clearNotice,
  focusNotice,
  highlightObjects,
  addObjects,
  attachConnections,
  resetView,
  fitView,
  layoutType,
  selectedItem,
  selectionCount,
  locateSelected,
  detail,
  isDetailLoading,
  isDetailPanelOpen,
  onContextAction,
  rootItem,
  relationFilterState,
  rootHistory,
  historyIndex,
  goHistory,
  goBack,
  goForward,
  expandDialogId,
  submitExpandOptions,
  compareItems,
  pinClusterMember,
  expandCluster,
  basket,
  stageChange,
  stageDisconnect,
  connectDialog,
  submitConnect,
  editTarget,
  editSelected,
  submitEdit,
  createDialog,
  openCreate,
  submitCreate,
  editPending,
  removePending,
} = useGraphExplorer()

const { changes, isBasketOpen, transaction, finishTransaction } = basket

const isMinimapOpen = useStorage('3d-mql-minimap-open', true)
const graphPane = ref(null)
const {
  minimapRef,
  minimapHandle,
  minimapStyle,
  minimapPosition,
  onMinimapResize,
  resetMinimapSize,
  setMinimapPosition,
  resetMinimap,
} = useMinimapLayout(graphPane)
const isRelationPanelOpen = useStorage('3d-mql-relation-panel-open', false)
const { isOpen: isConsoleOpen } = useMqlConsole()

const fullscreenPane = ref('')
const paneFullscreen = (pane) =>
  computed({
    get: () => fullscreenPane.value === pane,
    set: (value) => (fullscreenPane.value = value ? pane : ''),
  })
const isGraphFullscreen = paneFullscreen('graph')
const isConsoleFullscreen = paneFullscreen('console')
const toggleGraphFullscreen = useToggle(isGraphFullscreen)
const hasExitedGraphFullscreen = ref(false)

whenever(
  () => !isGraphFullscreen.value,
  () => (hasExitedGraphFullscreen.value = true),
)

const openRootFromConsole = (id) => {
  isConsoleFullscreen.value = false
  loadRoot(id)
}

const searchFromOutside = ({ type, name, revision }) => {
  isConsoleFullscreen.value = false
  Object.assign(searchForm, { type, name, revision, where: '' })
  onSearch()
}

const highlightFromConsole = (ids) => {
  isConsoleFullscreen.value = false
  highlightObjects(ids)
}

const addFromConsole = (ids) => {
  isConsoleFullscreen.value = false
  addObjects(ids)
}

const toggleConsoleFullscreen = () => {
  isConsoleOpen.value = true
  isConsoleFullscreen.value = !isConsoleFullscreen.value
}

onKeyStroke('Escape', () => (fullscreenPane.value = ''))
whenever(
  () => !isConsoleOpen.value,
  () => (isConsoleFullscreen.value = false),
  { flush: 'post' },
)

const isShortcutGuideOpen = ref(false)

const shortcuts = {
  clear: clearGraph,
  fit: fitView,
  relationPanel: useToggle(isRelationPanelOpen),
  detailPanel: useToggle(isDetailPanelOpen),
  minimap: useToggle(isMinimapOpen),
  console: useToggle(isConsoleOpen),
  back: goBack,
  forward: goForward,
  graphFullscreen: toggleGraphFullscreen,
  consoleFullscreen: toggleConsoleFullscreen,
  shortcuts: useToggle(isShortcutGuideOpen),
}

tryOnScopeDispose(onMessage((message) => message?.type === 'shortcut' && shortcuts[message.name]?.()))
tryOnScopeDispose(onMessage((message) => message?.type === 'openRoot' && openRootFromConsole(message.id)))
tryOnScopeDispose(onMessage((message) => message?.type === 'search' && searchFromOutside(message.query)))

const copyColor = 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/40'
const violetColor = 'text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/40'
const queryExtras = (action) => [
  { action: `run:${action}`, icon: Play, title: '콘솔에서 실행' },
  { action: `insert:${action}`, icon: TextCursorInput, title: '에디터에 삽입' },
]
const copyItem = (action, label) => ({ action: `copy:${action}`, label, icon: Copy, color: copyColor })
const queryItem = (action, label) => ({ ...copyItem(action, label), icon: Terminal, extras: queryExtras(action) })
const copyGroup = (label, children) => ({ action: 'copy', label, icon: Copy, color: copyColor, children })
const linkExistingItem = (label) => ({ action: 'linkExisting', label, icon: Link2, color: violetColor })
const busQueryItems = [
  queryItem('printBus', 'print bus'),
  queryItem('expandFrom', 'expand bus (from)'),
  queryItem('expandTo', 'expand bus (to)'),
]
const pathGroup = (label) => ({
  action: 'path',
  label,
  icon: Route,
  color: copyColor,
  children: [
    queryItem('pathPrint', 'print bus … select'),
    copyItem('pathExpr', 'select 식'),
    copyItem('pathColumn', '컬럼 식 $<…>'),
    copyItem('pathWhere', 'where 조건'),
  ],
})
const redColor = 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/40'
const removePendingItem = { action: 'removePending', label: '바구니에서 빼기', icon: Undo2, color: redColor }

const graphMenuItems = {
  node: [
    { action: 'expand', label: 'Expand (From)', icon: ChevronsDown, color: 'text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/40' },
    { action: 'whereUsed', label: 'Where Used (To)', icon: CornerRightUp, color: 'text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/40' },
    { action: 'expandOptions', label: 'Expand 옵션...', icon: SlidersHorizontal, color: 'text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/40' },
    { action: 'setRoot', label: '기준 객체로 보기', icon: Crosshair, color: 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/40' },
    linkExistingItem('Link Existing Nodes'),
    { action: 'edit', label: '편집 (수정 문장 만들기)...', icon: Pencil, color: violetColor },
    { action: 'createLinked', label: '새 객체 만들어 연결...', icon: PackagePlus, color: violetColor },
    pathGroup('기준 객체에서 여기까지의 select 식'),
    copyGroup('Copy', [
      copyItem('id', 'Object ID'),
      copyItem('tnr', 'Type Name Rev'),
      ...busQueryItems,
      queryItem('revisions', 'temp query bus (All Revisions)'),
    ]),
    { action: 'delete', label: '삭제 문장 만들기', icon: Trash2, color: redColor },
  ],
  edge: [
    copyItem('id', 'Copy Relationship ID'),
    queryItem('printConnection', 'print connection'),
    queryItem('expandRel', 'expand bus (from, rel type)'),
    queryItem('queryConnection', 'query connection'),
    { action: 'edit', label: '관계 속성 편집...', icon: Pencil, color: violetColor },
    { action: 'disconnect', label: '연결 해제 문장 만들기', icon: Unlink, color: redColor },
  ],
  cluster: [copyItem('memberIds', 'Copy Member IDs'), queryItem('expandCluster', 'expand bus (rel type)')],
  pendingNode: [{ action: 'editPending', label: '생성 문장 고치기...', icon: Pencil, color: violetColor }, removePendingItem],
  pendingEdge: [removePendingItem],
}

const connectItem = { action: 'connect', label: '연결 문장 만들기...', icon: Link, color: violetColor }

const pairMenuItems = [
  { action: 'compare', label: '두 객체 비교', icon: GitCompareArrows, color: violetColor },
  { action: 'findPath', label: '경로 찾기', icon: Route, color: violetColor },
  connectItem,
  pathGroup('우클릭한 객체까지의 select 식'),
]

const multiMenuItems = (targets) => {
  const count = targets.length
  if (targets.some((target) => target.data('isPending'))) return count === 2 ? [connectItem] : []
  return [
    linkExistingItem(`Link Existing Nodes (${count}개)`),
    ...(count === 2 ? pairMenuItems : []),
    copyGroup(`Copy (${count}개)`, [copyItem('id', 'Object IDs'), copyItem('tnr', 'Type Name Rev'), ...busQueryItems]),
  ]
}

const contextMenuItems = computed(() => {
  const menu = contextMenu.value
  if (!menu) return []
  return menu.kind === 'multi' ? multiMenuItems(menu.targets) : graphMenuItems[menu.kind]
})
</script>

<template>
  <div class="h-full flex flex-col bg-white dark:bg-[#282c34] relative overflow-hidden font-sans">
    <GraphToolbar
      v-model:isSearchPanelOpen="isSearchPanelOpen"
      v-model:isRelationPanelOpen="isRelationPanelOpen"
      v-model:isDetailPanelOpen="isDetailPanelOpen"
      v-model:graphFilter="graphFilter"
      :form="searchForm"
      :isSearching="isSearching"
      :isLoading="isLoading"
      :loadedAt="loadedAt"
      :isStale="isStale"
      :history="rootHistory"
      :historyIndex="historyIndex"
      @search="onSearch"
      @refresh="refresh"
      @clear="clearGraph"
      @back="goBack"
      @forward="goForward"
      @go="goHistory"
    />
    <Transition name="pop">
      <div
        v-if="errorMsg"
        class="absolute top-14 left-4 right-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs rounded-xl z-50 shadow-xl backdrop-blur-md flex items-center gap-2"
      >
        <div class="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0"></div>
        <span class="flex-1 whitespace-pre-wrap break-all"><span class="font-semibold">Error:</span> {{ errorMsg }}</span>
        <button
          class="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg flex items-center justify-center bg-transparent border-none text-inherit cursor-pointer"
          @click="errorMsg = ''"
        >
          <X :size="16" />
        </button>
      </div>
    </Transition>
    <div class="flex-1 min-h-0 relative flex flex-row">
      <SearchPanel
        :open="isSearchPanelOpen"
        :results="searchResults"
        :limit="searchLimit"
        :root="rootItem"
        @select="loadRoot"
        @close="isSearchPanelOpen = false"
      />
      <Transition name="dock-left">
        <RelationPanel v-if="isRelationPanelOpen" :state="relationFilterState" @close="isRelationPanelOpen = false" />
      </Transition>
      <div class="flex-1 h-full min-w-0 flex flex-col">
        <div
          ref="graphPane"
          :class="
            isGraphFullscreen
              ? 'fixed inset-0 z-40 animate-zoom-in'
              : ['flex-1 min-h-0 relative', hasExitedGraphFullscreen && 'animate-settle']
          "
        >
          <div
            ref="cyContainer"
            class="w-full h-full outline-none select-none overflow-hidden bg-white dark:bg-[#282c34]"
            @mouseleave="hideTooltip"
          ></div>
          <button
            class="absolute top-2 right-2 z-10 h-7 w-7 flex items-center justify-center rounded-md border border-black/10 dark:border-white/10 bg-white/90 dark:bg-[#21252b]/90 text-gray-500 dark:text-[#abb2bf] hover:text-[#61afef] cursor-pointer"
            :title="isGraphFullscreen ? '전체 화면 종료 (Esc)' : '그래프 전체 화면 (Ctrl+Alt+G)'"
            @click="toggleGraphFullscreen()"
            @mouseenter="hideTooltip"
          >
            <Minimize v-if="isGraphFullscreen" :size="14" />
            <Fullscreen v-else :size="14" />
          </button>
          <Transition name="fade">
            <GraphNotice
              v-if="notice"
              :notice="notice"
              @focus="focusNotice"
              @close="clearNotice"
              @mouseenter="hideTooltip"
            />
          </Transition>
          <Transition name="fade">
            <div
              v-if="transaction"
              class="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 flex items-center gap-2 rounded-lg border border-amber-300 dark:border-amber-700 shadow-md text-xs bg-amber-50/95 dark:bg-[#3b3220]/95 text-amber-800 dark:text-amber-200"
              @mouseenter="hideTooltip"
            >
              <span class="font-semibold">트랜잭션 미리보기 중</span>
              <span class="tabular-nums">{{ transaction.remaining }}초 뒤 자동 abort</span>
              <button
                class="h-6 px-2 rounded-md border-none bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
                @click="finishTransaction('commit')"
              >
                Commit
              </button>
              <button
                class="h-6 px-2 rounded-md border-none bg-red-600 hover:bg-red-700 text-white font-semibold cursor-pointer"
                @click="finishTransaction('abort')"
              >
                Abort
              </button>
            </div>
          </Transition>
          <Transition name="fade">
            <div
              v-if="isMinimapOpen && hasElements"
              ref="minimapRef"
              class="absolute z-10 flex flex-col rounded-lg overflow-hidden border border-black/10 dark:border-white/10 shadow-md bg-white/90 dark:bg-[#282c34]/90"
              :style="minimapStyle"
              @mouseenter="hideTooltip"
            >
              <div
                ref="minimapHandle"
                class="h-4 shrink-0 flex items-center justify-center cursor-grab active:cursor-grabbing bg-gray-200/60 dark:bg-white/5 hover:bg-gray-300/60 dark:hover:bg-white/10 transition-colors"
                title="끌어서 옮기기 · 하단 바 미니맵 버튼 우클릭: 위치 고정"
              >
                <div class="w-8 h-0.5 rounded-full bg-gray-400/60 dark:bg-white/20"></div>
              </div>
              <div class="relative flex-1 min-h-0">
                <GraphMinimap :cy="cyRef" :isDark="isDark" @fit="fitView" />
              </div>
              <BoxResizeHandles @start="onMinimapResize" @reset="resetMinimapSize" />
            </div>
          </Transition>
          <div
            v-if="!hasElements"
            class="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none text-gray-400 dark:text-[#5c6370] text-xs"
          >
            <Waypoints :size="40" class="opacity-50" />
            <div v-if="searchResults.length">왼쪽 검색 결과에서 객체를 클릭하면 그래프가 표시됩니다.</div>
            <div v-else>Type · Name · Rev 로 객체를 검색하거나 Object ID를 입력하세요.</div>
            <div>클릭: 상세 정보 · 더블클릭: 연결 확장 · 우클릭: 메뉴</div>
            <div>Ctrl/Shift+클릭 · Shift+드래그: 다중 선택</div>
          </div>
        </div>
        <Transition :name="isConsoleFullscreen ? 'fade' : 'dock-bottom'">
          <MqlConsole
            v-if="isConsoleOpen"
            v-model:fullscreen="isConsoleFullscreen"
            @openRoot="openRootFromConsole"
            @highlight="highlightFromConsole"
            @add="addFromConsole"
          />
        </Transition>
      </div>
      <DetailPanel
        :open="isDetailPanelOpen"
        :item="selectedItem"
        :selectionCount="selectionCount"
        :detail="detail"
        :isLoading="isDetailLoading"
        @close="isDetailPanelOpen = false"
        @locate="locateSelected"
        @expand="expand"
        @openRoot="loadRoot"
        @pin="pinClusterMember"
        @expandCluster="expandCluster"
        @where="addSearchCondition"
        @change="stageChange"
        @edit="editSelected"
        @editPending="editPending"
        @removePending="removePending"
        @disconnect="stageDisconnect"
        @attach="attachConnections"
      />
    </div>
    <GraphStatusBar
      v-model:isMinimapOpen="isMinimapOpen"
      v-model:isConsoleOpen="isConsoleOpen"
      v-model:layoutType="layoutType"
      :isDark="isDark"
      :connection="connection"
      :context="context"
      :minimapPosition="minimapPosition"
      :changeCount="changes.length"
      @basket="isBasketOpen = true"
      @create="openCreate()"
      @minimapPosition="setMinimapPosition"
      @resetMinimap="resetMinimap"
      @resetView="resetView"
      @fit="fitView"
      @toggleTheme="toggleTheme"
      @reconnect="reconnect"
      @shortcuts="isShortcutGuideOpen = true"
    />
    <GraphTooltip v-if="tooltip" :tooltip="tooltip" />
    <ContextMenu
      v-if="contextMenu && contextMenuItems.length"
      :menu="contextMenu"
      :items="contextMenuItems"
      @action="onContextAction"
      @close="hideContextMenu"
    />
    <Transition name="dialog">
      <ExpandDialog
        v-if="expandDialogId"
        :label="expandDialogId"
        @submit="submitExpandOptions"
        @close="expandDialogId = ''"
      />
    </Transition>
    <Transition name="dialog">
      <CompareDialog v-if="compareItems.length === 2" :items="compareItems" @close="compareItems = []" />
    </Transition>
    <Transition name="dialog">
      <ConnectDialog
        v-if="connectDialog"
        :items="connectDialog.items"
        :edges="connectDialog.edges"
        :relations="connectDialog.relations"
        @submit="submitConnect"
        @close="connectDialog = null"
      />
    </Transition>
    <Transition name="dialog">
      <ObjectEditDialog v-if="editTarget" :target="editTarget" @submit="submitEdit" @close="editTarget = null" />
    </Transition>
    <Transition name="dialog">
      <ObjectCreateDialog
        v-if="createDialog"
        :options="createDialog"
        @submit="submitCreate"
        @close="createDialog = null"
      />
    </Transition>
    <Transition name="dialog">
      <ChangeBasketDialog v-if="isBasketOpen" :basket="basket" @close="isBasketOpen = false" />
    </Transition>
    <Transition name="dialog">
      <ShortcutGuideDialog v-if="isShortcutGuideOpen" @close="isShortcutGuideOpen = false" />
    </Transition>
  </div>
</template>

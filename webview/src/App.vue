<script setup>
import {
  X,
  Waypoints,
  Network,
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
  Maximize2,
  Minimize2,
} from '@lucide/vue'
import { onMessage } from './api.js'
import { useGraphExplorer } from './composables/useGraphExplorer.js'
import { useMqlConsole } from './composables/useMqlConsole.js'
import GraphToolbar from './components/GraphToolbar.vue'
import SearchPanel from './components/SearchPanel.vue'
import RelationPanel from './components/RelationPanel.vue'
import DetailPanel from './components/DetailPanel.vue'
import GraphTooltip from './components/GraphTooltip.vue'
import ContextMenu from './components/ContextMenu.vue'
import MqlConsole from './components/MqlConsole.vue'
import ExpandDialog from './components/ExpandDialog.vue'
import CompareDialog from './components/CompareDialog.vue'
import ShortcutGuideDialog from './components/ShortcutGuideDialog.vue'

const {
  isDark,
  toggleTheme,
  cyContainer,
  navContainer,
  graphFilter,
  hasElements,
  tooltip,
  contextMenu,
  hideTooltip,
  hideContextMenu,
  errorMsg,
  connection,
  reconnect,
  isLoading,
  searchForm,
  searchResults,
  searchLimit,
  isSearching,
  isSearchPanelOpen,
  onSearch,
  loadRoot,
  expand,
  clearGraph,
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
} = useGraphExplorer()

const isMinimapOpen = useStorage('3d-mql-minimap-open', true)
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

const graphMenuItems = {
  node: [
    { action: 'expand', label: 'Expand (From)', icon: Network, color: 'text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/40' },
    { action: 'whereUsed', label: 'Where Used (To)', icon: CornerRightUp, color: 'text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/40' },
    { action: 'expandOptions', label: 'Expand 옵션...', icon: SlidersHorizontal, color: 'text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/40' },
    { action: 'setRoot', label: '기준 객체로 보기', icon: Crosshair, color: 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/40' },
    linkExistingItem('Link Existing Nodes'),
    copyGroup('Copy', [
      copyItem('id', 'Object ID'),
      copyItem('tnr', 'Type Name Rev'),
      ...busQueryItems,
      queryItem('revisions', 'temp query bus (All Revisions)'),
    ]),
  ],
  edge: [
    copyItem('id', 'Copy Relationship ID'),
    queryItem('printConnection', 'print connection'),
    queryItem('expandRel', 'expand bus (from, rel type)'),
    queryItem('queryConnection', 'query connection'),
  ],
  cluster: [copyItem('memberIds', 'Copy Member IDs'), queryItem('expandCluster', 'expand bus (rel type)')],
}

const pairMenuItems = [
  { action: 'compare', label: '두 객체 비교', icon: GitCompareArrows, color: violetColor },
  { action: 'findPath', label: '경로 찾기', icon: Route, color: violetColor },
]

const multiMenuItems = (count) => [
  linkExistingItem(`Link Existing Nodes (${count}개)`),
  ...(count === 2 ? pairMenuItems : []),
  copyGroup(`Copy (${count}개)`, [copyItem('id', 'Object IDs'), copyItem('tnr', 'Type Name Rev'), ...busQueryItems]),
]

const contextMenuItems = computed(() => {
  const menu = contextMenu.value
  if (!menu) return []
  return menu.kind === 'multi' ? multiMenuItems(menu.targets.length) : graphMenuItems[menu.kind]
})
</script>

<template>
  <div class="h-full flex flex-col bg-white dark:bg-[#282c34] relative overflow-hidden font-sans">
    <GraphToolbar
      v-model:isSearchPanelOpen="isSearchPanelOpen"
      v-model:isRelationPanelOpen="isRelationPanelOpen"
      v-model:isDetailPanelOpen="isDetailPanelOpen"
      v-model:isMinimapOpen="isMinimapOpen"
      v-model:isConsoleOpen="isConsoleOpen"
      v-model:graphFilter="graphFilter"
      v-model:layoutType="layoutType"
      :form="searchForm"
      :isSearching="isSearching"
      :isLoading="isLoading"
      :isDark="isDark"
      :connection="connection"
      :history="rootHistory"
      :historyIndex="historyIndex"
      @search="onSearch"
      @resetView="resetView"
      @fit="fitView"
      @clear="clearGraph"
      @toggleTheme="toggleTheme"
      @reconnect="reconnect"
      @back="goBack"
      @forward="goForward"
      @go="goHistory"
      @shortcuts="isShortcutGuideOpen = true"
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
            <Minimize2 v-if="isGraphFullscreen" :size="14" />
            <Maximize2 v-else :size="14" />
          </button>
          <div
            class="absolute bottom-2 right-2 z-10 w-60 h-44 rounded-lg overflow-hidden border border-black/10 dark:border-white/10 shadow-md bg-white/90 dark:bg-[#282c34]/90 transition-opacity duration-150"
            :class="!(isMinimapOpen && hasElements) && 'opacity-0 pointer-events-none'"
            @mouseenter="hideTooltip"
          >
            <div ref="navContainer" class="w-full h-full relative overflow-hidden"></div>
          </div>
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
          <MqlConsole v-if="isConsoleOpen" v-model:fullscreen="isConsoleFullscreen" />
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
      />
    </div>
    <GraphTooltip v-if="tooltip" :tooltip="tooltip" />
    <ContextMenu
      v-if="contextMenu"
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
      <ShortcutGuideDialog v-if="isShortcutGuideOpen" @close="isShortcutGuideOpen = false" />
    </Transition>
  </div>
</template>

<script setup>
import { X, Waypoints, Network, CornerRightUp, Crosshair, Copy } from '@lucide/vue'
import { useGraphExplorer } from './composables/useGraphExplorer.js'
import GraphToolbar from './components/GraphToolbar.vue'
import SearchPanel from './components/SearchPanel.vue'
import DetailPanel from './components/DetailPanel.vue'
import GraphTooltip from './components/GraphTooltip.vue'
import ContextMenu from './components/ContextMenu.vue'

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
  selectedItem,
  detail,
  isDetailLoading,
  isDetailPanelOpen,
  onContextAction,
  rootId,
} = useGraphExplorer()

const handlePanelExpand = (id, direction) => expand(id, direction, true)

const isMinimapOpen = ref(true)

const graphMenuItems = [
  { action: 'expand', label: 'Expand (From)', icon: Network, color: 'text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/40' },
  { action: 'whereUsed', label: 'Where Used (To)', icon: CornerRightUp, color: 'text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/40' },
  { action: 'setRoot', label: '기준 객체로 보기', icon: Crosshair, color: 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/40' },
  { action: 'copyId', label: 'Copy ID', icon: Copy, color: 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/40' },
]
</script>

<template>
  <div class="h-full flex flex-col bg-white dark:bg-[#282c34] relative overflow-hidden font-sans">
    <GraphToolbar
      v-model:isSearchPanelOpen="isSearchPanelOpen"
      v-model:isDetailPanelOpen="isDetailPanelOpen"
      v-model:isMinimapOpen="isMinimapOpen"
      v-model:graphFilter="graphFilter"
      :form="searchForm"
      :isSearching="isSearching"
      :isLoading="isLoading"
      :isDark="isDark"
      :connection="connection"
      @search="onSearch"
      @resetView="resetView"
      @clear="clearGraph"
      @toggleTheme="toggleTheme"
      @reconnect="reconnect"
    />
    <div
      v-if="errorMsg"
      class="absolute top-14 left-4 right-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs rounded-xl z-30 shadow-xl backdrop-blur-md flex items-center gap-2"
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
    <div class="flex-1 min-h-0 relative flex flex-row">
      <SearchPanel
        :open="isSearchPanelOpen"
        :results="searchResults"
        :limit="searchLimit"
        :rootId="rootId"
        @select="loadRoot"
        @close="isSearchPanelOpen = false"
      />
      <div class="flex-1 h-full min-w-0 relative">
        <div
          ref="cyContainer"
          class="w-full h-full outline-none select-none overflow-hidden bg-white dark:bg-[#282c34]"
          @mouseleave="hideTooltip"
        ></div>
        <div
          class="absolute bottom-2 right-2 z-10 w-60 h-44 rounded-lg overflow-hidden border border-black/10 dark:border-white/10 shadow-md bg-white/90 dark:bg-[#282c34]/90"
          :class="!(isMinimapOpen && hasElements) && 'invisible'"
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
        </div>
      </div>
      <DetailPanel
        :open="isDetailPanelOpen"
        :item="selectedItem"
        :detail="detail"
        :isLoading="isDetailLoading"
        @close="isDetailPanelOpen = false"
        @expand="handlePanelExpand"
      />
    </div>
    <GraphTooltip v-if="tooltip" :tooltip="tooltip" />
    <ContextMenu
      v-if="contextMenu"
      :menu="contextMenu"
      :items="graphMenuItems"
      @action="onContextAction"
      @close="hideContextMenu"
    />
  </div>
</template>

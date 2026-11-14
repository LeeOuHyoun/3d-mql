export const settingItems = [
  { key: 'consoleLineNumbers', label: 'MQL Console 입력창 줄 번호', defaultValue: false },
  {
    key: 'detailSymbolics',
    label: 'Node Properties 심볼릭 이름 표시',
    hint: '켜면 전체 심볼릭 목록을 한 번 조회해, 서버에 따라 그동안 다른 MQL 이 기다립니다.',
    defaultValue: false,
  },
]

const defaults = Object.fromEntries(settingItems.map((item) => [item.key, item.defaultValue]))
const settings = useStorage('3d-mql-settings', defaults, localStorage, { mergeDefaults: true })

export const useSettings = () => settings

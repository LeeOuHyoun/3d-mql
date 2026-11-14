export const settingItems = [{ key: 'consoleLineNumbers', label: 'MQL Console 입력창 줄 번호', defaultValue: false }]

const defaults = Object.fromEntries(settingItems.map((item) => [item.key, item.defaultValue]))
const settings = useStorage('3d-mql-settings', defaults, localStorage, { mergeDefaults: true })

export const useSettings = () => settings

import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { MqlClient, MqlError, type ClientStatus } from './mqlClient';
import {
  attributeInfo,
  buildChange,
  buildQueryText,
  countConnections,
  expandObject,
  forgetAttributes,
  forgetSymbolics,
  hasDelete,
  hasUnbalancedQuote,
  isDestructive,
  listNames,
  lookupSymbolics,
  maskSecret,
  policyStates,
  printAccess,
  printConnection,
  printConnectionLinks,
  printHelp,
  printObject,
  printObjectExtra,
  printRelationship,
  printTriggers,
  relationshipAttributes,
  searchObjects,
  searchQueryText,
  symbolicMap,
  transactionAfter,
  typeChain,
  typeInfo,
  type ChangeParams,
  type Direction,
  type ExpandOptions,
  type QueryTarget,
  type SearchParams,
  type TriggerSource,
} from './mqlCommands';

type Message =
  | { type: 'ready' }
  | { type: 'setTheme'; dark: boolean }
  | { type: 'notify'; text: string; warning?: boolean }
  | { type: 'consoleFocus'; focused: boolean }
  | { type: 'request'; id: number; method: string; params: Record<string, unknown> };

type Contributes = {
  commands: { command: string; title: string }[];
  keybindings: { command: string; key: string }[];
};

const queryMethods = ['query', 'copy', 'insert'];

const graphCommandPrefix = '3d-mql.graph.';

const themeKey = '3d-mql.dark';

const consoleFocusKey = '3d-mql.consoleFocus';

const objectIdPattern = /^(?:\d+\.\d+\.\d+\.\d+|[0-9a-f]{32})$/i;

const searchKeys = ['type', 'name', 'revision'];

const countSetting = (key: string, fallback: number) => {
  const value = Math.floor(Number(vscode.workspace.getConfiguration('3d-mql').get(key, fallback)));
  return value >= 1 ? value : fallback;
};

const responseTimeoutMs = () => {
  const value = Math.floor(Number(vscode.workspace.getConfiguration('3d-mql').get('responseTimeout', 60)));
  return value >= 0 ? value * 1000 : 60000;
};

export class GraphPanel {
  private static readonly panels = new Map<number, GraphPanel>();
  private static lastActive: GraphPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly client: MqlClient;
  private readonly disposables: vscode.Disposable[] = [];
  private status: { state: ClientStatus; message?: string } = { state: 'connecting' };
  private isReady = false;
  private pendingMessage: Record<string, unknown> | undefined;
  private txActive = false;
  private consoleFocused = false;
  private disposed = false;

  private static syncConsoleFocus() {
    const focused = [...GraphPanel.panels.values()].some((item) => item.panel.active && item.consoleFocused);
    void vscode.commands.executeCommand('setContext', consoleFocusKey, focused);
  }

  static open(context: vscode.ExtensionContext, output: vscode.OutputChannel, id?: unknown) {
    if (id === undefined) {
      GraphPanel.create(context, output);
      return;
    }
    const rootId = typeof id === 'string' ? id.trim() : '';
    if (!objectIdPattern.test(rootId)) throw new Error(`3D MQL 그래프에서 열 수 없는 객체 ID입니다: ${String(id)}`);
    GraphPanel.target(context, output).deliver({ type: 'openRoot', id: rootId });
  }

  static search(context: vscode.ExtensionContext, output: vscode.OutputChannel, query?: unknown) {
    const fields = query && typeof query === 'object' ? (query as Record<string, unknown>) : {};
    const [type, name, revision] = searchKeys.map((key) => (typeof fields[key] === 'string' ? fields[key].trim() : ''));
    if (!type && !name && !revision) throw new Error(`3D MQL 그래프에서 검색할 값이 없습니다: ${JSON.stringify(query)}`);
    GraphPanel.target(context, output).deliver({ type: 'search', query: { type, name, revision } });
  }

  private static target(context: vscode.ExtensionContext, output: vscode.OutputChannel) {
    return GraphPanel.lastActive ?? GraphPanel.create(context, output);
  }

  private static create(context: vscode.ExtensionContext, output: vscode.OutputChannel) {
    let slot = 1;
    while (GraphPanel.panels.has(slot)) slot += 1;
    const created = new GraphPanel(context, slot, output);
    GraphPanel.panels.set(slot, created);
    GraphPanel.lastActive = created;
    return created;
  }

  static disposeAll() {
    [...GraphPanel.panels.values()].forEach((item) => item.panel.dispose());
  }

  static postToActive(message: Record<string, unknown>) {
    [...GraphPanel.panels.values()].find((item) => item.panel.active)?.post(message);
  }

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly slot: number,
    output: vscode.OutputChannel,
  ) {
    const root = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview');
    const title = slot === 1 ? '3D MQL Graph' : `3D MQL Graph ${slot}`;
    this.panel = vscode.window.createWebviewPanel('3d-mql.graph', title, vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [root],
    });
    this.panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.png');
    this.client = new MqlClient(
      () => this.contextCommand(),
      (state, message) => {
        this.status = { state, message };
        if (state !== 'ready') this.setTx(false);
        this.post({ type: 'status', state, message });
      },
      (text) => output.appendLine(`[${new Date().toISOString()}] [${slot}] ${maskSecret(text)}`),
      () => this.confirmTimeoutRestart(),
      responseTimeoutMs,
    );
    void this.client.start().catch(() => undefined);
    this.panel.webview.html = this.html(root);
    this.disposables.push(
      this.panel.onDidDispose(() => this.dispose()),
      this.panel.onDidChangeViewState(({ webviewPanel }) => {
        if (webviewPanel.active) GraphPanel.lastActive = this;
        GraphPanel.syncConsoleFocus();
      }),
      this.panel.webview.onDidReceiveMessage((message: Message) => this.onMessage(message)),
    );
  }

  private deliver(message: Record<string, unknown>) {
    this.panel.reveal();
    if (this.isReady) this.post(message);
    else this.pendingMessage = message;
  }

  private onMessage(message: Message) {
    if (message.type === 'ready') {
      this.isReady = true;
      this.post({ type: 'init', dark: this.isDark(), ...this.status, tx: this.txActive });
      void this.client.start().catch(() => undefined);
      if (this.pendingMessage) this.post(this.pendingMessage);
      this.pendingMessage = undefined;
    } else if (message.type === 'setTheme') {
      void this.context.globalState.update(themeKey, message.dark);
    } else if (message.type === 'notify') {
      this.notify(message.text, message.warning === true);
    } else if (message.type === 'consoleFocus') {
      this.consoleFocused = message.focused === true;
      GraphPanel.syncConsoleFocus();
    } else if (message.type === 'request') {
      void this.handle(message.method, message.params, message.id).then(
        (result) => this.post({ type: 'response', id: message.id, result }),
        (error: Error) => this.post({ type: 'response', id: message.id, error: error.message }),
      );
    }
  }

  private async handle(method: string, params: Record<string, unknown>, requestId: number) {
    const id = String(params.id ?? '');
    if (method === 'search') {
      const limit = countSetting('searchLimit', 100);
      return searchObjects(this.client, params as SearchParams, limit).then((results) => ({ results, limit }));
    }
    if (method === 'searchText') return Promise.resolve(this.searchText(params as SearchParams));
    if (method === 'expand') {
      const limit = countSetting('expandLimit', 50);
      return expandObject(this.client, id, params.direction as Direction, params as ExpandOptions, limit);
    }
    if (method === 'connectionCount') return countConnections(this.client, id);
    if (method === 'object') return printObject(this.client, id);
    if (method === 'objectExtra') return printObjectExtra(this.client, id);
    if (method === 'connection') return printConnection(this.client, id);
    if (method === 'run') return this.run(String(params.command ?? ''), requestId);
    if (method === 'confirmRun') return this.confirmRun(String(params.command ?? ''));
    if (method === 'reconnect') return this.reconnect();
    if (method === 'stop') return this.stop();
    if (method === 'change') return buildChange(params as ChangeParams);
    if (method === 'access') return printAccess(this.client, id, String(params.user ?? ''));
    if (method === 'relationship') return printRelationship(this.client, id);
    if (method === 'typeChain') return typeChain(this.client, id);
    if (method === 'typeInfo') return typeInfo(this.client, id);
    if (method === 'attributes') return attributeInfo(this.client, params.names as string[]);
    if (method === 'policyStates') return policyStates(this.client, id);
    if (method === 'relationshipAttributes') return relationshipAttributes(this.client, id);
    if (method === 'list') return listNames(this.client, String(params.kind ?? ''));
    if (method === 'triggers') return printTriggers(this.client, params as TriggerSource);
    if (method === 'symbolics') return lookupSymbolics(this.client, params.names as string[]);
    if (method === 'symbolicMap') return symbolicMap(this.client);
    if (method === 'help') return printHelp(this.client, String(params.topic ?? ''));
    if (method === 'contextCommand') return Promise.resolve(this.contextCommand() || 'set context user creator;');
    if (method === 'pickJpo') return this.pickJpo();
    if (method === 'connectionLinks') return printConnectionLinks(this.client, id);
    if (method === 'openJpo') return this.openJpo(String(params.program ?? ''), String(params.method ?? ''));
    if (method === 'openDocument') return this.openDocument(String(params.content ?? ''));
    if (method === 'keybindings') return Promise.resolve(this.keybindings());
    if (method === 'openKeybindings') {
      return Promise.resolve(vscode.commands.executeCommand('workbench.action.openGlobalKeybindings', graphCommandPrefix));
    }
    if (queryMethods.includes(method)) return this.query(method, String(params.action), params.targets as QueryTarget[]);
    return Promise.reject(new Error(`알 수 없는 요청입니다: ${method}`));
  }

  private async run(command: string, requestId: number) {
    if (hasUnbalancedQuote(command)) {
      return { output: '', error: '따옴표 짝이 맞지 않아 실행하지 않았습니다. 짝이 맞지 않은 따옴표는 뒤따르는 명령까지 문자열로 묶어 세션을 멈추게 합니다.' };
    }
    if (/\bproperty\b/i.test(command)) forgetSymbolics(this.client);
    if (/\battribute\b/i.test(command)) forgetAttributes(this.client);
    try {
      const output = await this.client.run(command, (text) => this.post({ type: 'chunk', id: requestId, text }), false);
      this.setTx(transactionAfter(command, this.txActive));
      return { output, error: '' };
    } catch (error) {
      if (!(error instanceof MqlError)) throw error;
      if (transactionAfter(command, this.txActive) !== this.txActive) this.setTx(false);
      return { output: error.output, error: error.message };
    }
  }

  private setTx(active: boolean) {
    if (this.txActive === active) return;
    this.txActive = active;
    this.post({ type: 'tx', active });
  }

  private async confirmRollback(message: string, action: string, detail = '세션을 다시 연결하므로 진행 중인 트랜잭션은 롤백됩니다.') {
    const picked = await vscode.window.showWarningMessage(message, { modal: true, detail }, action);
    return picked === action;
  }

  private async confirmTimeoutRestart() {
    if (!this.txActive || this.disposed) return true;
    return this.confirmRollback(
      `MQL이 ${responseTimeoutMs() / 1000}초 넘게 응답하지 않습니다. 세션을 다시 연결할까요?`,
      '다시 연결',
      '세션을 다시 연결하므로 진행 중인 트랜잭션은 롤백됩니다. 취소하면 응답을 계속 기다립니다.',
    );
  }

  private async reconnect() {
    if (this.txActive && !(await this.confirmRollback('세션을 다시 연결할까요?', '다시 연결'))) return false;
    void this.client.restart().catch(() => undefined);
    return true;
  }

  private async stop() {
    if (!this.client.busy) return false;
    if (this.txActive && !(await this.confirmRollback('실행을 중단할까요?', '중단'))) return false;
    if (!this.client.busy) return false;
    void this.client.restart(true).catch(() => undefined);
    return true;
  }

  private async confirmRun(command: string) {
    if (!isDestructive(command)) return 'run';
    const run = '실행';
    const withTransaction = '트랜잭션 시작 후 실행';
    const advice = hasDelete(command) ? ' 운영 환경에서는 del 대신 mod 사용을 권장합니다.' : '';
    const picked = await vscode.window.showWarningMessage(
      `되돌리기 어려운 명령을 실행할까요?\n\n${command}`,
      {
        modal: true,
        detail: this.txActive ? '현재 트랜잭션 안에서 실행됩니다.' : `트랜잭션 밖에서 실행하면 되돌릴 수 없습니다.${advice}`,
      },
      ...(this.txActive ? [run] : [withTransaction, run]),
    );
    if (picked === withTransaction) return 'transaction';
    return picked === run ? 'run' : 'cancel';
  }

  private async query(method: string, action: string, targets: QueryTarget[]) {
    const text = buildQueryText(action, targets);
    if (method === 'copy') await this.copy(text);
    if (method === 'insert') await this.insert(text);
    return text;
  }

  private searchText(params: SearchParams) {
    const type = params.type?.trim() ?? '';
    return objectIdPattern.test(type) && !params.name?.trim() ? `print bus ${type};` : searchQueryText(params);
  }

  private async copy(text: string) {
    await vscode.env.clipboard.writeText(text);
    this.notify(`클립보드에 복사했습니다: ${text.split('\n')[0].slice(0, 80)}`);
  }

  private async insert(text: string) {
    const editor = vscode.window.visibleTextEditors.find((item) => item.document.uri.scheme !== 'output');
    if (!editor) return this.openDocument(text);
    await editor.edit((builder) => editor.selections.forEach((selection) => builder.replace(selection, text)));
    await vscode.window.showTextDocument(editor.document, { viewColumn: editor.viewColumn, preserveFocus: true });
  }

  private async openDocument(content: string) {
    const document = await vscode.workspace.openTextDocument({ content });
    await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.Beside, preview: false });
  }

  private contextCommand() {
    return vscode.workspace.getConfiguration('3d-mql').get<string>('contextCommand', '').trim();
  }

  private async pickJpo() {
    const active = vscode.window.activeTextEditor?.document.uri;
    const [picked] =
      (await vscode.window.showOpenDialog({
        canSelectMany: false,
        defaultUri: active?.scheme === 'file' ? active : undefined,
        filters: { 'JPO Java Files': ['java'], 'All Files': ['*'] },
        title: 'JPO 파일 선택',
      })) ?? [];
    return picked?.fsPath ?? '';
  }

  private async openJpo(program: string, method: string) {
    const [file] = await vscode.workspace.findFiles(`**/${program}_mxJPO.java`, '**/node_modules/**', 1);
    if (!file) throw new Error(`워크스페이스에서 ${program}_mxJPO.java 파일을 찾지 못했습니다.`);
    const document = await vscode.workspace.openTextDocument(file);
    const name = method.replace(/[^\w$]/g, '');
    const source = document.getText();
    const declared = new RegExp(`\\b(?:public|protected|private)\\b[^;{(]*\\b${name}\\s*\\(`).exec(source);
    const offset = declared ? declared.index : Math.max(source.search(new RegExp(`\\b${name}\\s*\\(`)), 0);
    const position = document.positionAt(name ? offset : 0);
    await vscode.window.showTextDocument(document, {
      viewColumn: vscode.ViewColumn.Beside,
      selection: new vscode.Range(position, position),
    });
  }

  private keybindings() {
    const { commands, keybindings } = this.context.extension.packageJSON.contributes as Contributes;
    return commands
      .filter((item) => item.command.startsWith(graphCommandPrefix))
      .map((item) => ({
        title: item.title.replace(/^3D MQL: /, ''),
        key: keybindings.find((binding) => binding.command === item.command)?.key ?? '',
      }));
  }

  private notify(text: string, warning = false) {
    vscode.window.setStatusBarMessage(`$(${warning ? 'warning' : 'check'}) ${text}`, 3000);
  }

  private isDark() {
    const saved = this.context.globalState.get<boolean>(themeKey);
    if (saved !== undefined) return saved;
    const kind = vscode.window.activeColorTheme.kind;
    return kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast;
  }

  private post(message: Record<string, unknown>) {
    if (this.disposed) return;
    void this.panel.webview.postMessage(message);
  }

  private html(root: vscode.Uri) {
    const webview = this.panel.webview;
    const nonce = randomBytes(16).toString('base64');
    const script = webview.asWebviewUri(vscode.Uri.joinPath(root, 'index.js'));
    const style = webview.asWebviewUri(vscode.Uri.joinPath(root, 'index.css'));
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
    ].join('; ');
    return `<!doctype html>
<html lang="ko"${this.isDark() ? ' class="dark"' : ''}>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${style}">
</head>
<body>
<div id="app"></div>
<script type="module" nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
  }

  private dispose() {
    this.disposed = true;
    GraphPanel.panels.delete(this.slot);
    if (GraphPanel.lastActive === this) GraphPanel.lastActive = [...GraphPanel.panels.values()].at(-1);
    GraphPanel.syncConsoleFocus();
    this.client.dispose();
    this.disposables.forEach((item) => item.dispose());
  }
}

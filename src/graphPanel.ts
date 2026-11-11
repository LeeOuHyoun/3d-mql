import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { buildJavaText, constantsClass, isJavaAction, parseConstants, type JavaTarget } from './javaSnippets';
import { MqlClient, MqlError, type ClientStatus } from './mqlClient';
import {
  attributeInfo,
  buildChange,
  buildQueryText,
  expandObject,
  forgetSymbolics,
  hasDelete,
  isDestructive,
  listNames,
  lookupSymbolics,
  maskSecret,
  policyStates,
  previewDefinition,
  printAccess,
  printConnection,
  printConnectionLinks,
  printObject,
  printObjectExtra,
  printRelationship,
  printTriggers,
  relationshipAttributes,
  searchObjects,
  traceScreen,
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
  | { type: 'reconnect' }
  | { type: 'setTheme'; dark: boolean }
  | { type: 'notify'; text: string }
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

const constantsSearchMs = 5000;

const objectIdPattern = /^(?:\d+\.\d+\.\d+\.\d+|[0-9a-f]{32})$/i;

export class GraphPanel {
  private static readonly panels = new Map<number, GraphPanel>();
  private static lastActive: GraphPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly client: MqlClient;
  private readonly disposables: vscode.Disposable[] = [];
  private status: { state: ClientStatus; message?: string } = { state: 'connecting' };
  private isReady = false;
  private pendingRoot = '';
  private txActive = false;
  private consoleFocused = false;

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
    (GraphPanel.lastActive ?? GraphPanel.create(context, output)).openRoot(rootId);
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
      () => vscode.workspace.getConfiguration('3d-mql').get<string>('contextCommand', ''),
      (state, message) => {
        this.status = { state, message };
        if (state !== 'ready') this.txActive = false;
        this.post({ type: 'status', state, message });
      },
      (text) => output.appendLine(`[${new Date().toISOString()}] [${slot}] ${maskSecret(text)}`),
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

  private openRoot(id: string) {
    this.panel.reveal();
    if (this.isReady) this.post({ type: 'openRoot', id });
    else this.pendingRoot = id;
  }

  private onMessage(message: Message) {
    if (message.type === 'ready') {
      this.isReady = true;
      this.post({ type: 'init', dark: this.isDark(), ...this.status });
      void this.client.start().catch(() => undefined);
      if (this.pendingRoot) this.post({ type: 'openRoot', id: this.pendingRoot });
      this.pendingRoot = '';
    } else if (message.type === 'reconnect') {
      void this.client.restart().catch(() => undefined);
    } else if (message.type === 'setTheme') {
      void this.context.globalState.update(themeKey, message.dark);
    } else if (message.type === 'notify') {
      this.notify(message.text);
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
      const limit = vscode.workspace.getConfiguration('3d-mql').get<number>('searchLimit', 200);
      return searchObjects(this.client, params as SearchParams, limit).then((results) => ({ results, limit }));
    }
    if (method === 'expand') return expandObject(this.client, id, params.direction as Direction, params as ExpandOptions);
    if (method === 'object') return printObject(this.client, id);
    if (method === 'objectExtra') return printObjectExtra(this.client, id);
    if (method === 'connection') return printConnection(this.client, id);
    if (method === 'run') return this.run(String(params.command ?? ''), requestId);
    if (method === 'confirmRun') return this.confirmRun(String(params.command ?? ''));
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
    if (method === 'connectionLinks') return printConnectionLinks(this.client, id);
    if (method === 'trace') return traceScreen(this.client, id, String(params.type ?? ''));
    if (method === 'preview') return previewDefinition(this.client, id, String(params.kind), String(params.name));
    if (method === 'openJpo') return this.openJpo(String(params.program ?? ''), String(params.method ?? ''));
    if (method === 'openDocument') return this.openDocument(String(params.content ?? ''));
    if (method === 'keybindings') return Promise.resolve(this.keybindings());
    if (method === 'openKeybindings') {
      return Promise.resolve(vscode.commands.executeCommand('workbench.action.openGlobalKeybindings', graphCommandPrefix));
    }
    if (queryMethods.includes(method)) return this.query(method, String(params.action), params.targets as unknown[]);
    return Promise.reject(new Error(`알 수 없는 요청입니다: ${method}`));
  }

  private async run(command: string, requestId: number) {
    if (/\bproperty\b/i.test(command)) forgetSymbolics(this.client);
    try {
      const output = await this.client.run(command, (text) => this.post({ type: 'chunk', id: requestId, text }));
      this.txActive = transactionAfter(command, this.txActive);
      return { output, error: '' };
    } catch (error) {
      if (!(error instanceof MqlError)) throw error;
      return { output: error.output, error: error.message };
    }
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

  private async query(method: string, action: string, targets: unknown[]) {
    const text = isJavaAction(action)
      ? await this.javaText(action, targets as JavaTarget[])
      : buildQueryText(action, targets as QueryTarget[]);
    if (method === 'copy') {
      await vscode.env.clipboard.writeText(text);
      this.notify(`클립보드에 복사했습니다: ${text.split('\n')[0].slice(0, 80)}`);
    }
    if (method === 'insert') await this.insert(text);
    return text;
  }

  private javaText(action: string, targets: JavaTarget[]) {
    return vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Java 가이드 코드' },
      async (progress) => {
        progress.report({ message: `${constantsClass}.java 찾는 중...` });
        const constants = await this.javaConstants();
        progress.report({ message: 'MQL 로 이름 · 값 조회 중...' });
        return buildJavaText(this.client, action, targets, constants);
      },
    );
  }

  private async javaConstants() {
    const search = new vscode.CancellationTokenSource();
    const timer = setTimeout(() => search.cancel(), constantsSearchMs);
    const files = await Promise.resolve(
      vscode.workspace.findFiles(`**/${constantsClass}.java`, '**/node_modules/**', 1, search.token),
    ).catch((): vscode.Uri[] => []);
    clearTimeout(timer);
    search.dispose();
    const [file] = files;
    if (!file) return undefined;
    const document = await vscode.workspace.openTextDocument(file);
    return parseConstants(document.getText(), constantsClass);
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

  private notify(text: string) {
    vscode.window.setStatusBarMessage(`$(check) ${text}`, 3000);
  }

  private isDark() {
    const saved = this.context.globalState.get<boolean>(themeKey);
    if (saved !== undefined) return saved;
    const kind = vscode.window.activeColorTheme.kind;
    return kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast;
  }

  private post(message: Record<string, unknown>) {
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
    GraphPanel.panels.delete(this.slot);
    if (GraphPanel.lastActive === this) GraphPanel.lastActive = [...GraphPanel.panels.values()].at(-1);
    GraphPanel.syncConsoleFocus();
    this.client.dispose();
    this.disposables.forEach((item) => item.dispose());
  }
}

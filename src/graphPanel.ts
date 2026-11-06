import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { MqlClient, type ClientStatus } from './mqlClient';
import { expandObject, printConnection, printObject, searchObjects, type Direction, type SearchParams } from './mqlCommands';

type Message =
  | { type: 'ready' }
  | { type: 'reconnect' }
  | { type: 'setTheme'; dark: boolean }
  | { type: 'request'; id: number; method: string; params: Record<string, unknown> };

const themeKey = '3d-mql.dark';

export class GraphPanel {
  private static readonly panels = new Map<number, GraphPanel>();
  private readonly panel: vscode.WebviewPanel;
  private readonly client: MqlClient;
  private readonly disposables: vscode.Disposable[] = [];
  private status: { state: ClientStatus; message?: string } = { state: 'connecting' };

  static open(context: vscode.ExtensionContext, output: vscode.OutputChannel) {
    let slot = 1;
    while (GraphPanel.panels.has(slot)) slot += 1;
    GraphPanel.panels.set(slot, new GraphPanel(context, slot, output));
  }

  static disposeAll() {
    [...GraphPanel.panels.values()].forEach((item) => item.panel.dispose());
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
        this.post({ type: 'status', state, message });
      },
      (text) => output.appendLine(`[${new Date().toISOString()}] [${slot}] ${text}`),
    );
    this.panel.webview.html = this.html(root);
    this.disposables.push(
      this.panel.onDidDispose(() => this.dispose()),
      this.panel.webview.onDidReceiveMessage((message: Message) => this.onMessage(message)),
    );
  }

  private onMessage(message: Message) {
    if (message.type === 'ready') {
      this.post({ type: 'init', dark: this.isDark(), ...this.status });
      void this.client.start().catch(() => undefined);
    } else if (message.type === 'reconnect') {
      void this.client.restart().catch(() => undefined);
    } else if (message.type === 'setTheme') {
      void this.context.globalState.update(themeKey, message.dark);
    } else if (message.type === 'request') {
      void this.handle(message.method, message.params).then(
        (result) => this.post({ type: 'response', id: message.id, result }),
        (error: Error) => this.post({ type: 'response', id: message.id, error: error.message }),
      );
    }
  }

  private handle(method: string, params: Record<string, unknown>) {
    const id = String(params.id ?? '');
    if (method === 'search') {
      const limit = vscode.workspace.getConfiguration('3d-mql').get<number>('searchLimit', 200);
      return searchObjects(this.client, params as SearchParams, limit).then((results) => ({ results, limit }));
    }
    if (method === 'expand') return expandObject(this.client, id, params.direction as Direction);
    if (method === 'object') return printObject(this.client, id);
    if (method === 'connection') return printConnection(this.client, id);
    return Promise.reject(new Error(`알 수 없는 요청입니다: ${method}`));
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
<html lang="ko">
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
    this.client.dispose();
    this.disposables.forEach((item) => item.dispose());
  }
}

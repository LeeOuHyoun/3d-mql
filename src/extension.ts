import * as vscode from 'vscode';
import { GraphPanel } from './graphPanel';

const graphCommands = ['clear', 'fit', 'relationPanel', 'detailPanel', 'minimap', 'console', 'back', 'forward', 'graphFullscreen', 'consoleFullscreen'];

export function activate(context: vscode.ExtensionContext) {
  const status = vscode.window.createStatusBarItem('3d-mql.open', vscode.StatusBarAlignment.Left, 99);
  status.name = '3D MQL Graph';
  status.text = '$(type-hierarchy)';
  status.tooltip = '3D MQL 새 관계 그래프 열기';
  status.command = '3d-mql.openGraph';
  status.show();
  const output = vscode.window.createOutputChannel('3D MQL');
  context.subscriptions.push(
    vscode.commands.registerCommand('3d-mql.openGraph', () => GraphPanel.open(context, output)),
    ...graphCommands.map((name) =>
      vscode.commands.registerCommand(`3d-mql.graph.${name}`, () => GraphPanel.postToActive({ type: 'shortcut', name })),
    ),
    status,
    output,
  );
}

export function deactivate() {
  GraphPanel.disposeAll();
}

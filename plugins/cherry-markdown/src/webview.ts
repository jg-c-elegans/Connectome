import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export function getWebviewContent(mdInfo: object, currentPanel: vscode.WebviewPanel, extensionPath: string) {
  const baseResourcePath = getWebViewPath(currentPanel);
  const activeTextEditorPath = getActiveTextEditorPath(currentPanel);
  const filePath = writeGlobalVarsToFile(extensionPath, {
    baseResourcePath,
    activeTextEditorPath,
  });

  const pageResourceUrlsMap = {
    'global-vars.js': currentPanel.webview.asWebviewUri(vscode.Uri.file(filePath)),
    'dist/index.css': currentPanel.webview.asWebviewUri(
      vscode.Uri.file(path.join(extensionPath, 'web-resources/dist/index.css')),
    ),
    'dist/index.js': currentPanel.webview.asWebviewUri(
      vscode.Uri.file(path.join(extensionPath, 'web-resources/dist/index.js')),
    ),
  };

  return `<!DOCTYPE html>
  <html lang="en">
  
  <head>
    <meta charset="UTF-8">
    <title>Cherry Editor - Markdown Editor</title>
    <link rel="stylesheet" type="text/css" href="${pageResourceUrlsMap['dist/index.css']}">
    <script src="${pageResourceUrlsMap['global-vars.js']}"></script>
  </head>
  
  <body>
    <textarea id="markdown-info" style="display: none;">${JSON.stringify(mdInfo)}</textarea>
    <div id="markdown" class="markdown-editor-only"></div>
    <script src="${pageResourceUrlsMap['dist/index.js']}"></script>
  </body>
  </html>`;
}

const getWebViewPath = (currentPanel: vscode.WebviewPanel): vscode.Uri => {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath ?? '';
  const workspacePath = vscode.Uri.file(workspaceFolder);
  return currentPanel.webview.asWebviewUri(workspacePath);
};

const getActiveTextEditorPath = (currentPanel: vscode.WebviewPanel): vscode.Uri => {
  const editor = vscode.window.activeTextEditor;
  const activeTextEditorPath = editor
    ? currentPanel.webview.asWebviewUri(editor.document.uri)
    : getWebViewPath(currentPanel);
  return activeTextEditorPath;
};

function writeGlobalVarsToFile(
  extensionPath: string,
  globalVars: { baseResourcePath: vscode.Uri; activeTextEditorPath: vscode.Uri },
): string {
  const globalVarsContent = `
    window._baseResourcePath = "${globalVars.baseResourcePath}";
    window._activeTextEditorPath = "${globalVars.activeTextEditorPath}";
  `;

  const scriptsDir = path.join(extensionPath, 'web-resources/scripts');
  if (!fs.existsSync(scriptsDir)) {
    fs.mkdirSync(scriptsDir, { recursive: true });
  }

  const filePath = path.join(scriptsDir, 'global-vars.js');
  fs.writeFileSync(filePath, globalVarsContent);
  return filePath;
}

const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const distPath = path.resolve(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  fs.rmSync(distPath, { recursive: true });
}
const webviewDistPath = path.resolve(__dirname, 'web-resources', 'dist');
if (fs.existsSync(webviewDistPath)) {
  fs.rmSync(webviewDistPath, { recursive: true });
}

// Build VSCode extension script (Node target)
esbuild.build({
  entryPoints: ['./src/extension.ts'],
  bundle: true,
  outfile: './dist/extension.js',
  platform: 'node',
  target: 'node16',
  external: ['vscode'],
  sourcemap: false,
  logLevel: 'info',
}).catch(() => process.exit(1));

// Build Webview script (Browser target)
esbuild.build({
  entryPoints: ['./web-resources/scripts/index.js'],
  bundle: true,
  outfile: './web-resources/dist/index.js',
  platform: 'browser',
  target: 'es2020',
  sourcemap: false,
  loader: {
    '.woff': 'file',
    '.woff2': 'file',
    '.ttf': 'file',
    '.eot': 'file',
    '.png': 'file',
    '.jpg': 'file',
    '.gif': 'file',
    '.svg': 'file',
  },
  logLevel: 'info',
}).catch(() => process.exit(1));

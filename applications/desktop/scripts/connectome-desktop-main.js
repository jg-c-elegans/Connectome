const path = require('path');
const { handleVersionAndHelp } = require('./cli-usage');

// Handle --version and --help before loading the full Electron stack.
const packageJsonPath = path.resolve(__dirname, '..', 'package.json');
handleVersionAndHelp(packageJsonPath);

// Packaged plugins live outside app.asar; development plugins live at the repo root.
const isInsideAsar = __dirname.includes('.asar');
const bundledPluginsDir = isInsideAsar
    ? path.join(process.resourcesPath, 'app', 'plugins')
    : path.resolve(__dirname, '..', '..', '..', 'plugins');
process.env.THEIA_DEFAULT_PLUGINS = `local-dir:${bundledPluginsDir}`;

// Handover to the auto-generated Electron application handler.
require('../lib/backend/electron-main.js');

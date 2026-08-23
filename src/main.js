/**
 * Copyright 2026 Esri
 *
 * Licensed under the Apache License Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const { app, BrowserWindow, ipcMain, nativeTheme, dialog, clipboard, shell, Menu, screen } = require('electron');
const path = require('path');
const net = require('net');
const dgram = require('dgram');
const fs = require('fs');
const { ConfigManager } = require('./config.js');
const { APP_DEFAULTS, DEFAULT_LOG_LEVEL, parseCommandLineArgs, getCommandLineReferenceData, formatCliStartupErrorOutput } = require('./cli-options.js');
const { runHeadlessSession, EXIT_CODES } = require('./headless-runner.js');
const { registerUdpClient } = require('./udp-utils.js');
const { createProtocolSettingsWindowManager } = require('./protocol-settings-window-manager.js');
const { createReferenceWindowManager } = require('./reference-window-manager.js');

function requestGracefulCliExit(exitCode) {
  process.exitCode = exitCode;
  app.once('will-quit', () => {
    process.exit(exitCode);
  });
  if (app.isReady()) {
    app.quit();
    return;
  }
  app.once('ready', () => {
    app.quit();
  });
}

// --- Command-line parsing ---
// Parse CLI args as early as possible. With no parameters the app starts in normal UI
// mode and restores saved behavior from the configuration file. With runMode=headless
// (or runMode=silent) the app runs without any UI. help / help-table-wide /
// help-table-narrow print terminal help and exit without launching the app.
const cliOptions = parseCommandLineArgs(process.argv, { isPackaged: app.isPackaged });

// ─── Application Logger (works in both UI and headless modes) ────────────────
// Initialised immediately after CLI parsing so every subsequent print — including
// startup warnings, help text, and error output — is captured in the log file.
const { RunLogger } = require('./run-logger.js');

const appLogFile = cliOptions.logFile || (() => {
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '');
  const logDir = path.resolve('./logs');
  fs.mkdirSync(logDir, { recursive: true });
  return path.join(logDir, `velocity-logger-${ts}.log`);
})();

const appLogger = new RunLogger({
  logLevel: cliOptions.logLevel,
  logFile: appLogFile,
  stdout: true,
});

function velocityLog(level, ...args) {
  const message = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  appLogger.write(level, message);
}

// Intercept console.* so all stdout/stderr lines also appear in the log file.
// We preserve the original console methods for actual terminal output; appLogger
// writes to the file (stdout flag is false here to avoid double-printing).
(function patchConsole() {
  const fileOnly = new RunLogger({
    logLevel: 'debug',
    logFile: appLogFile,
    stdout: false,
  });
  const serialize = (...a) => a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
  const _log   = console.log.bind(console);
  const _warn  = console.warn.bind(console);
  const _error = console.error.bind(console);
  const _debug = console.debug.bind(console);
  console.log   = (...a) => { _log(...a);   fileOnly.info(serialize(...a));  };
  console.warn  = (...a) => { _warn(...a);  fileOnly.warn(serialize(...a));  };
  console.error = (...a) => { _error(...a); fileOnly.error(serialize(...a)); };
  console.debug = (...a) => { _debug(...a); fileOnly.debug(serialize(...a)); };
}());

velocityLog('info', '[Startup] Log file: ' + appLogFile);
velocityLog('info', '[Startup] Log level: ' + cliOptions.logLevel);

cliOptions.warnings.forEach((warning) => velocityLog('warn', `[Startup] CLI warning: ${warning}`));
if (cliOptions.explainText) {
  velocityLog('info', '[Startup] ' + cliOptions.explainText);
}

if (cliOptions.mode === 'help') {
  velocityLog('info', '[Startup] ' + cliOptions.helpText);
  requestGracefulCliExit(EXIT_CODES.success);
}

if (cliOptions.mode === 'error') {
  velocityLog('error', '[Startup] ' + formatCliStartupErrorOutput(cliOptions));
  requestGracefulCliExit(EXIT_CODES.configurationError);
}
// Resets the app config and all app settings to the latest defaultConfig
function resetConfig() {
  // Force reload config.js to get a fresh defaultConfig every time
  delete require.cache[require.resolve('./config.js')];
  const { defaultConfig: freshDefaultConfig } = require('./config.js');
  appConfig = { ...freshDefaultConfig };
  configManager.saveConfig(appConfig);
  applyConfigSettings(appConfig);

  // If the login dialog is open/hidden, resize and re-center it to match reset defaults
  if (velocityLoginWindow && !velocityLoginWindow.isDestroyed()) {
    const defaults = freshDefaultConfig.dialogSizes && freshDefaultConfig.dialogSizes.velocityLogin;
    const w = (defaults && defaults.width) || 590;
    const h = (defaults && defaults.height) || 840;
    velocityLoginWindow.setSize(w, h);
    velocityLoginWindow.center();
  }
  if (mainWindow) {
    mainWindow.webContents.send('load-saved-theme', appConfig.theme);
    mainWindow.webContents.send('font-size-changed', appConfig.font.size);
    mainWindow.reload();
  }
}

// Set the application name immediately (for macOS menu)
app.setName('arcgis-velocity-logger');

let mainWindow;
let splashWindow;
let configWindow;
let errorWindow;
let aboutWindow = null;
let velocityLoginWindow = null;
let server;
let clientSocket;
let udpSocket;
let currentConnectionDetails = null;

const { generateToken, generateOAuthToken, getVelocityApiUrl, listOutputs, getOutputDetails, TokenManager } = require('./velocity-api.js');
const { shouldSendVelocityTokenByDefault } = require('./velocity-auth-utils.js');
const velocityTokenManager = new TokenManager();
let velocitySendAuthToken = false;

function getVelocityAuthTokenForConnection() {
  return velocitySendAuthToken && velocityTokenManager.isAuthenticated ? velocityTokenManager.token : null;
}

function hotSwapVelocityAuthToken() {
  const token = getVelocityAuthTokenForConnection();
  if (grpcTransport && grpcTransport.authToken !== undefined) {
    grpcTransport.authToken = token;
  }
  if (httpTransport && httpTransport.authToken !== undefined) {
    httpTransport.authToken = token;
  }
  // WS transport cannot change upgrade headers mid-session; the toggle applies on reconnect.
}

function sendVelocityTokenState(reason = 'updated') {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('velocity:token-state', {
      hasToken: velocityTokenManager.isAuthenticated,
      tokenSendingEnabled: velocitySendAuthToken,
      expires: velocityTokenManager.expires || 0,
      reason,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
let sockets = [];
let udpClients = new Set();
let configManager;
let appConfig;
const protocolSettingsWindowManager = createProtocolSettingsWindowManager({
  BrowserWindow,
  ipcMain,
  screen,
  path,
  basePath: __dirname,
  getMainWindow: () => mainWindow,
  getAppConfig: () => appConfig,
  saveAppConfig: (config) => {
    if (configManager) configManager.saveConfig(config);
  },
  shell,
});
const referenceWindowManager = createReferenceWindowManager({
  BrowserWindow,
  ipcMain,
  screen,
  path,
  basePath: __dirname,
  getMainWindow: () => mainWindow,
  getAppConfig: () => appConfig,
  saveAppConfig: (config) => {
    if (configManager) configManager.saveConfig(config);
  },
  shell,
});
let connectionLineVisible = true; // Track connection line visibility state
let showMetadataEnabled = false; // Track "Show Metadata" state — logs connection/call metadata for all protocols
let inspectModeActive = false; // Tracks whether Inspect Element pick mode is active.
let devToolsOpen = false; // Tracks whether DevTools is currently open (synced via devtools-opened/closed events).


/**
 * Sends a [metadata] line to the renderer via the dedicated 'log-metadata' channel.
 * Always sent unconditionally so the renderer can retroactively show or hide metadata
 * when the user toggles "Show Metadata".
 * @param {string} line - The formatted metadata line.
 */
function sendMetadataLine(line) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('log-metadata', line);
  }
}



// --- Global Error Handling ---

/**
 * Centralized error handling function. Logs the error and displays a dialog.
 * @param {Error} error - The error object.
 * @param {string} [context='Unknown'] - The context in which the error occurred.
 */
function handleError(error, context = 'Unknown') {
  // Always log to console first
  console.error(`[${context}] Error:`, error);
  
  // Ensure we have a proper Error object
  const errorObj = error instanceof Error ? error : new Error(String(error));
  
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      showErrorDialog(errorObj);
    } else {
      // Fallback to native dialog if main window not available
      dialog.showErrorBox(`${context} Error`, errorObj.stack || errorObj.message);
    }
  } catch (dialogError) {
    console.error('Failed to show error dialog:', dialogError);
    // Final fallback
    dialog.showErrorBox(`${context} Error (Fallback)`, errorObj.stack || errorObj.message);
  }
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Promise Rejection at:', promise);
  const error = reason instanceof Error ? reason : new Error(String(reason));
  error.stack = error.stack || 'No stack trace available';
  handleError(error, 'Unhandled Promise Rejection');
});

process.on('uncaughtException', (error) => {
  handleError(error, 'Uncaught Exception');
});

// Handle renderer process crashes
app.on('render-process-gone', (event, webContents, details) => {
  const error = new Error(`Renderer process crashed: ${details.reason}`);
  error.stack = `Reason: ${details.reason}\nExit Code: ${details.exitCode}`;
  handleError(error, 'Renderer Process Crash');
});

// Handle child process errors
app.on('child-process-gone', (event, details) => {
  const error = new Error(`Child process crashed: ${details.type}`);
  error.stack = `Type: ${details.type}\nReason: ${details.reason}\nExit Code: ${details.exitCode}`;
  handleError(error, 'Child Process Crash');
});

/**
 * Safely cleans up and destroys the TCP client socket.
 */
function cleanupTcpClientSocket() {
    if (clientSocket) {
        try {
            clientSocket.removeAllListeners();
            clientSocket.destroy();
        } catch (err) {
            handleError(err, 'TCP Client Cleanup');
        }
        clientSocket = null;
    }
    currentConnectionDetails = null;
}

/**
 * Creates and configures the splash screen window.
 * This window is shown during application startup.
 */
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 320,
    transparent: false,
    frame: false,
    alwaysOnTop: true,
    show: false, // Create hidden
    resizable: false,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: true, // Required for IPC in splash.html
      contextIsolation: false, // Required for IPC in splash.html
    },
  });

  splashWindow.setMenuBarVisibility(false);
  splashWindow.setMenu(null);
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));

    // Send theme to splash screen once it's ready
    splashWindow.webContents.once('dom-ready', () => {
        const theme = appConfig.theme || (nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
        splashWindow.webContents.send('load-theme', `theme-${theme}`);
    });
}

/**
 * Saves the main window's size and position to the configuration file.
 */
function saveWindowState() {
  if (!appConfig || !mainWindow) return;
  const [width, height] = mainWindow.getSize();
  const [x, y] = mainWindow.getPosition();
  appConfig.windowState.width = width;
  appConfig.windowState.height = height;
  appConfig.windowState.x = x;
  appConfig.windowState.y = y;
  configManager.saveConfig(appConfig);
}

/**
 * Creates the main application window and manages the splash screen lifecycle.
 */
function createWindow() {
  // Define splash screen stages
  const splashStages = [
    { percent: 20, text: 'Initializing...' },
    { percent: 40, text: 'Loading modules...' },
    { percent: 60, text: 'Preparing UI...' },
    { percent: 80, text: 'Finalizing...' },
    { percent: 100, text: 'Done!' },
  ];

  // Helper to send progress to splash screen
  function sendSplashProgress(percent, text) {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.webContents.send('splash-progress', { percent, text });
    }
  }

  // Wait for the splash screen to be ready before showing it and starting main window creation
  ipcMain.once('splash-ready', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.show();
    }

    // Now, create the main window (it will be hidden initially)
    mainWindow = new BrowserWindow({
      width: appConfig.windowState.width,
      height: appConfig.windowState.height,
      x: appConfig.windowState.x,
      y: appConfig.windowState.y,
      show: false, // Start hidden
      icon: path.join(__dirname, 'assets', 'icon.png'),
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        enableRemoteModule: false,
      },
    });

    mainWindow.setMenuBarVisibility(appConfig.menuBarVisible);
    mainWindow.loadFile(path.join(__dirname, 'index.html'));

    // Staged loading process
    let currentStage = 0;
    const stageInterval = setInterval(() => {
      if (currentStage < splashStages.length) {
        const stage = splashStages[currentStage];
        sendSplashProgress(stage.percent, stage.text);
        currentStage++;
      } else {
        clearInterval(stageInterval);
      }
    }, 400); // Delay between stages

    // When the main window is fully ready, show it and close the splash screen
    mainWindow.once('ready-to-show', () => {
      clearInterval(stageInterval); // Ensure interval is cleared
      sendSplashProgress(100, 'Done!');

      setTimeout(() => {
        if (splashWindow) {
          splashWindow.close();
          splashWindow = null;
        }
        if (mainWindow) {
          const opacity = appConfig.opacity || 1.0;
          //console.log(`Applying opacity on startup: ${opacity} (from appConfig.opacity: ${appConfig.opacity})`);
          mainWindow.setOpacity(opacity);
          mainWindow.show();
          // Pass saved theme to renderer
          if (appConfig.theme) {
            mainWindow.webContents.send('load-saved-theme', appConfig.theme);
          }
          if (appConfig.font) {
            mainWindow.webContents.send('load-saved-font', appConfig.font);
          }
          setupContextMenu();

          // Send CLI presets for UI prepopulation
          if (cliOptions.ui && cliOptions.ui.presets) {
            mainWindow.webContents.send('cli-presets', cliOptions.ui.presets);
          }
        }
      }, 500); // Short delay for the 'Done!' message to be visible
    });

    mainWindow.on('resize', saveWindowState);
    mainWindow.on('move', saveWindowState);

    mainWindow.on('closed', () => {
      protocolSettingsWindowManager.close({ restoreFocus: false });
      referenceWindowManager.closeAll();
      mainWindow = null;
    });

    // Keep devToolsOpen flag and menu checkboxes in sync regardless of how DevTools was opened/closed.
    mainWindow.webContents.on('devtools-opened', () => {
      devToolsOpen = true;
      createMainMenu();
    });
    mainWindow.webContents.on('devtools-closed', () => {
      devToolsOpen = false;
      // Also clear inspect pick mode if DevTools was closed externally
      if (inspectModeActive) {
        inspectModeActive = false;
        mainWindow && mainWindow.webContents.send('cancel-inspect-mode');
      }
      createMainMenu();
    });

    // Forward renderer-process console output to the log file.
    mainWindow.webContents.on('console-message', (event) => {
      // Support both the legacy positional-arg form and the current event-object form.
      const level     = typeof event.level   === 'number' ? event.level   : event[1];
      const message   = typeof event.message === 'string' ? event.message : event[2];
      const line      = event.line     ?? event[3];
      const sourceId  = event.sourceId ?? event[4];
      // Suppress noisy Electron dev-only warnings that aren't actionable at runtime.
      if (typeof message === 'string' && message.includes('Electron Security Warning')) return;
      const levelMap = { 0: 'debug', 1: 'info', 2: 'warn', 3: 'error' };
      const logLevel = levelMap[level] || 'info';
      const src = sourceId ? ` (${path.basename(sourceId)}:${line})` : '';
      velocityLog(logLevel, `[Renderer]${src} ${message}`);
    });

    // Re-apply settings on load/reload to ensure config persistence
    mainWindow.webContents.on('did-finish-load', () => {
      if (appConfig) {
        applyConfigSettings(appConfig);
      }
    });
  });
}


/**
 * Creates and displays the 'About' dialog window.
 */
async function showAboutDialog() {
  if (aboutWindow) {
    aboutWindow.focus();
    return;
  }
  let theme = 'dark'; // Default theme
  if (mainWindow) {
    try {
      const currentTheme = await mainWindow.webContents.executeJavaScript('document.body.className');
      theme = currentTheme || theme;
    } catch (err) {
      console.error('Could not get theme from main window, using default:', err);
    }
  }

  aboutWindow = new BrowserWindow({
    width: 360,
    height: 320,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'About ArcGIS Velocity Logger',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    modal: true,
    parent: mainWindow,
    show: false, // Initially hide the window
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  aboutWindow.setMenuBarVisibility(false);

  ipcMain.once('about-dialog-ready', () => {
    if (aboutWindow && !aboutWindow.isDestroyed()) {
      aboutWindow.show();
    }
  });
  
  aboutWindow.loadFile(path.join(__dirname, 'about.html'), { query: { theme } });
}

/**
 * Creates and displays the configuration dialog window.
 */
async function showConfigDialog() {
  if (configWindow) {
    configWindow.focus();
    return;
  }

  let theme = 'dark'; // Default theme
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      const currentTheme = await mainWindow.webContents.executeJavaScript('document.body.className');
      theme = currentTheme || theme;
    } catch (err) {
      console.error('Could not get theme from main window, using default:', err);
    }
  }

  const appConfigDialog = (appConfig.dialogSizes && appConfig.dialogSizes.appConfig) || {};
  configWindow = new BrowserWindow({
    width: appConfigDialog.width || 650,
    height: appConfigDialog.height || 380,
    x: appConfigDialog.x || undefined,
    y: appConfigDialog.y || undefined,
    parent: mainWindow,
    modal: process.platform !== 'darwin',
    show: false,
    resizable: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  configWindow.setMenuBarVisibility(false);

  const saveConfigDialogBounds = () => {
    if (configWindow && !configWindow.isDestroyed()) {
      const [width, height] = configWindow.getSize();
      const [x, y] = configWindow.getPosition();
      if (!appConfig.dialogSizes) appConfig.dialogSizes = {};
      appConfig.dialogSizes.appConfig = { width, height, x, y };
      configManager.saveConfig(appConfig);
    }
  };
  configWindow.on('resize', saveConfigDialogBounds);
  configWindow.on('move', saveConfigDialogBounds);

  configWindow.webContents.once('dom-ready', () => {
    const configData = {
      config: appConfig,
      configPath: configManager.getConfigPath(),
      theme: `theme-${appConfig.theme}`,
    };
    configWindow.webContents.send('load-config-data', configData);
  });

  configWindow.once('ready-to-show', () => {
    configWindow.show();
  });

  configWindow.on('closed', () => {
    configWindow = null;
  });

  configWindow.loadFile(path.join(__dirname, 'config.html'), { query: { theme } });
}

/**
 * Creates and displays a modal error dialog to show detailed error information.
 * @param {Error} error - The error object to display.
 */
async function showErrorDialog(error) {
  if (errorWindow) {
    errorWindow.focus();
    return;
  }

  let theme = 'dark'; // Default theme
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      const currentTheme = await mainWindow.webContents.executeJavaScript('document.body.className');
      theme = currentTheme || theme;
    } catch (err) {
      console.error('Could not get theme from main window, using default:', err);
    }
  }

  const errorInfo = `Error: ${error.message}\n\nStack Trace:\n${error.stack}`;

  errorWindow = new BrowserWindow({
    width: 600,
    height: 350,
    parent: mainWindow,
    modal: true,
    show: false,
    resizable: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  errorWindow.setMenuBarVisibility(false);

  errorWindow.webContents.once('dom-ready', () => {
    // Store a local reference to prevent race conditions
    const currentWindow = errorWindow;
    if (currentWindow && !currentWindow.isDestroyed()) {
      const errorData = {
        message: 'An unexpected error occurred.',
        details: errorInfo,
        theme: appConfig ? appConfig.theme : 'dark'
      };
      currentWindow.webContents.send('load-error-data', errorData);
    }
  });

  errorWindow.once('ready-to-show', () => {
    if (errorWindow && !errorWindow.isDestroyed()) {
      errorWindow.show();
    }
  });

  errorWindow.on('closed', () => {
    errorWindow = null;
  });

  errorWindow.loadFile(path.join(__dirname, 'error.html'), { query: { theme } });
}

/**
 * Creates and displays the 'Help' dialog window.
 */
async function showHelpDialog() {
  if (referenceWindowManager.focus('help')) return;
  let theme = 'dark'; // Default theme
  if (mainWindow) {
    try {
      const currentTheme = await mainWindow.webContents.executeJavaScript('document.body.className');
      theme = currentTheme || theme;
    } catch (err) {
      console.error('Could not get theme from main window, using default:', err);
    }
  }

  referenceWindowManager.open({
    key: 'help',
    title: 'Help - ArcGIS Velocity Logger',
    file: 'help.html',
    readyChannel: 'help-dialog-ready',
    query: { theme },
    allowedExternalUrlPrefix: 'https://github.com/Esri/arcgis-velocity-logger/blob/main/docs/',
    defaults: {
      width: 1080,
      height: 760,
      minWidth: 720,
      minHeight: 500,
    },
  });
}

/**
 * Creates and displays the dedicated 'Command Line Interface' dialog window.
 * This dialog is generated from the same CLI metadata used by terminal help output
 * and the markdown command-line guide, keeping docs and in-app help aligned.
 */
async function showCommandLineDialog() {
  if (referenceWindowManager.focus('commandLine')) return;

  let theme = 'dark';
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      const currentTheme = await mainWindow.webContents.executeJavaScript('document.body.className');
      theme = currentTheme || theme;
    } catch (err) {
      console.error('Could not get theme from main window, using default:', err);
    }
  }

  referenceWindowManager.open({
    key: 'commandLine',
    title: 'Command Line Interface - ArcGIS Velocity Logger',
    file: 'cli.html',
    readyChannel: 'cli-dialog-ready',
    query: { theme },
    defaults: {
      width: 1200,
      height: 760,
      minWidth: 820,
      minHeight: 520,
    },
  });
}

/**
 * Applies configuration settings to the application's main window.
 * @param {object} config - The configuration object to apply.
 */
function applyConfigSettings(config) {
  if (!mainWindow || !config) return;

  // Apply theme
  if (config.theme) {
    mainWindow.webContents.send('load-saved-theme', config.theme);
  }

  // Apply menu bar visibility
  if (config.menuBarVisible !== undefined) {
    mainWindow.setMenuBarVisibility(config.menuBarVisible);
  }

  // Apply window state, but only if not in fullscreen
  if (config.windowState && !mainWindow.isFullScreen()) {
    const { width, height, x, y } = config.windowState;

    // Set size if valid
    if (typeof width === 'number' && width > 0 && typeof height === 'number' && height > 0) {
      mainWindow.setSize(Math.round(width), Math.round(height));
    }

    // Set position if valid
    if (typeof x === 'number' && typeof y === 'number') {
      mainWindow.setPosition(Math.round(x), Math.round(y));
    }
  }
}

/**
 * Saves the current configuration to the default path.
 */
function saveConfig() {
  if (appConfig) {
    configManager.saveConfig(appConfig);
  }
}

/**
 * Opens a dialog to save the current configuration to a new file.
 */
async function saveConfigAs() {
  const { filePath } = await dialog.showSaveDialog({
    title: 'Save App Configuration',
    defaultPath: 'velocity-logger-config.json',
    filters: [{ name: 'JSON files', extensions: ['json'] }]
  });
  if (filePath && appConfig) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(appConfig, null, 2));
    } catch (err) {
      handleError(err, 'Save App Config As');
    }
  }
}

/**
 * Triggers the save logs functionality by sending a message to the renderer.
 */
function saveLogs() {
  if (mainWindow) {
    mainWindow.webContents.send('trigger-save-logs');
  }
}

/**
 * Clears the logs by sending a message to the renderer.
 */
function clearLogs() {
  if (mainWindow) {
    mainWindow.webContents.send('trigger-clear-logs');
  }
}

/**
 * Opens a dialog to apply a configuration from a file.
 */
async function loadConfigFrom() {
  const { filePaths } = await dialog.showOpenDialog({
    title: 'Apply App Configuration',
    properties: ['openFile'],
    filters: [{ name: 'JSON files', extensions: ['json'] }]
  });
  if (filePaths && filePaths.length > 0) {
    try {
      const data = fs.readFileSync(filePaths[0], 'utf8');
      const newConfig = JSON.parse(data);
      appConfig = configManager.mergeWithDefaults(newConfig);
      applyConfigSettings(appConfig);
      configManager.saveConfig(appConfig);
    } catch (err) {
      handleError(err, 'Apply App Config From');
    }
  }
}

/**
 * The set of keys that belong to the launch config (runtime/connection behavior).
 */
/**
 * Opens a dialog to apply a launch configuration from a JSON file.
 * The file uses the sectioned structure (connection, capture, output)
 * matching the launch-config sample files. Values are extracted from
 * each section and sent as flat presets to the renderer via 'cli-presets'.
 */
async function applyLaunchConfigFrom() {
  const { filePaths } = await dialog.showOpenDialog({
    title: 'Apply Launch Configuration',
    properties: ['openFile'],
    filters: [{ name: 'JSON files', extensions: ['json'] }]
  });
  if (filePaths && filePaths.length > 0) {
    try {
      const data = fs.readFileSync(filePaths[0], 'utf8');
      const parsed = JSON.parse(data);
      const presets = {};
      // Walk each section and collect non-comment, non-undefined values
      for (const section of Object.values(parsed)) {
        if (section && typeof section === 'object' && !Array.isArray(section)) {
          for (const [key, value] of Object.entries(section)) {
            if (!key.startsWith('_') && value !== undefined) {
              presets[key] = value;
            }
          }
        }
      }
      if (Object.keys(presets).length > 0 && mainWindow) {
        mainWindow.webContents.send('cli-presets', presets);
      }
    } catch (error) {
      handleError(error, 'Apply Launch Config');
    }
  }
}

/**
 * Resets the launch configuration to default values, restoring the app
 * to the same state as if no launch config had been applied.
 */
function resetLaunchConfig() {
  // Map null paths to empty strings for UI compatibility
  const defaults = {};
  for (const [key, value] of Object.entries(APP_DEFAULTS)) {
    defaults[key] = value === null ? '' : value;
  }
  if (mainWindow) {
    mainWindow.webContents.send('cli-presets', defaults);
    appLogger.logLevel = DEFAULT_LOG_LEVEL;
    velocityLog('info', '[Config] Launch configuration reset to defaults.');
  }
}

/**
 * Change the runtime log level, persist it in app config, and rebuild menus.
 */
function setLogLevel(level) {
  appLogger.logLevel = level;
  if (appConfig) {
    appConfig.logLevel = level;
    if (configManager) configManager.saveConfig(appConfig);
  }
  const applicationMenu = createMainMenu();
  Menu.setApplicationMenu(applicationMenu);
  velocityLog('info', `[Config] Log level changed to: ${level}`);
}

/**
 * Build a submenu array of radio items for selecting the log level.
 */
function buildLogLevelSubmenu() {
  const current = (appConfig && appConfig.logLevel) || DEFAULT_LOG_LEVEL;
  return ['error', 'warn', 'info', 'debug'].map(level => ({
    label: level,
    type: 'radio',
    checked: current === level,
    click: () => setLogLevel(level),
  }));
}

/**
 * Reads the current launch configuration values from the renderer UI
 * and returns a sectioned object matching the launch-config sample file
 * structure: { connection, capture, output }.
 * All properties are included, using current UI state or defaults.
 */
async function getCurrentLaunchConfig() {
  if (!mainWindow) return {};
  const currentSettings = await mainWindow.webContents.executeJavaScript(`
    (function() {
      const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : null; };
      const getChecked = (id) => { const el = document.getElementById(id); return el ? el.checked : false; };
      const connType = getVal('connection-type') || 'tcp-server';
      const parts = connType.split('-');
      return JSON.stringify({
        grpcHeaderPath: getVal('grpc-header-path') || 'replace.with.dedicated.uid',
        grpcHeaderPathKey: getVal('grpc-header-path-key') || 'grpc-path',
        grpcSendMethod: getVal('grpc-send-method') || 'stream',
        grpcSerialization: getVal('grpc-serialization') || 'protobuf',
        httpFormat: getVal('http-format') || 'delimited',
        httpPath: getVal('http-path') || '/',
        httpTls: getChecked('http-tls'),
        httpTlsCaPath: getVal('http-tls-ca-path') || null,
        httpTlsCertPath: getVal('http-tls-cert-path') || null,
        httpTlsKeyPath: getVal('http-tls-key-path') || null,
        httpAllowUnverifiedTls: getChecked('http-allow-unverified'),
        ip: getVal('host') || '127.0.0.1',
        mode: parts[1] || 'server',
        port: parseInt(getVal('port'), 10) || 5565,
        protocol: parts[0] || 'tcp',
        tlsCaPath: getVal('grpc-tls-ca-path') || null,
        tlsCertPath: getVal('grpc-tls-cert-path') || null,
        tlsKeyPath: getVal('grpc-tls-key-path') || null,
        useTls: getChecked('grpc-tls'),
        allowUnverifiedTls: getChecked('grpc-allow-unverified'),
        wsFormat: getVal('ws-format') || 'delimited',
        wsHeaders: getVal('ws-headers') || null,
        wsIgnoreFirstMsg: getChecked('ws-ignore-first-msg'),
        wsPath: getVal('ws-path') || '/',
        wsSubscriptionMsg: getVal('ws-subscription-msg') || null,
        wsTls: getChecked('ws-tls'),
        wsTlsCaPath: getVal('ws-tls-ca-path') || null,
        wsTlsCertPath: getVal('ws-tls-cert-path') || null,
        wsTlsKeyPath: getVal('ws-tls-key-path') || null,
        wsAllowUnverifiedTls: getChecked('ws-allow-unverified'),
      });
    })()
  `);
  const s = JSON.parse(currentSettings);
  return {
    capture: {
      durationMs: null,
      exclude: null,
      filter: null,
      idleTimeoutMs: 0,
      maxLogCount: null,
    },
    connection: {
      autoConnect: true,
      connectRetryIntervalMs: 1000,
      connectTimeoutMs: 0,
      connectWaitForServer: false,
      grpcHeaderPath: s.grpcHeaderPath,
      grpcHeaderPathKey: s.grpcHeaderPathKey,
      grpcSendMethod: s.grpcSendMethod,
      grpcSerialization: s.grpcSerialization,
      httpFormat: s.httpFormat,
      httpPath: s.httpPath,
      httpTls: s.httpTls,
      httpTlsCaPath: s.httpTlsCaPath,
      httpTlsCertPath: s.httpTlsCertPath,
      httpTlsKeyPath: s.httpTlsKeyPath,
      httpAllowUnverifiedTls: s.httpAllowUnverifiedTls,
      ip: s.ip,
      mode: s.mode,
      port: s.port,
      protocol: s.protocol,
      tlsCaPath: s.tlsCaPath,
      tlsCertPath: s.tlsCertPath,
      tlsKeyPath: s.tlsKeyPath,
      useTls: s.useTls,
      allowUnverifiedTls: s.allowUnverifiedTls,
      wsFormat: s.wsFormat,
      wsHeaders: s.wsHeaders,
      wsIgnoreFirstMsg: s.wsIgnoreFirstMsg,
      wsPath: s.wsPath,
      wsSubscriptionMsg: s.wsSubscriptionMsg,
      wsTls: s.wsTls,
      wsTlsCaPath: s.wsTlsCaPath,
      wsTlsCertPath: s.wsTlsCertPath,
      wsTlsKeyPath: s.wsTlsKeyPath,
      wsAllowUnverifiedTls: s.wsAllowUnverifiedTls,
    },
    output: {
      appendOutput: false,
      doneFile: null,
      exitOnComplete: true,
      logFile: null,
      logLevel: (appConfig && appConfig.logLevel) || DEFAULT_LOG_LEVEL,
      onError: 'exit',
      outputFile: null,
      outputFormat: 'text',
      stdout: true,
    },
  };
}

let launchConfigWindow = null;

/**
 * Creates and displays the launch configuration dialog window.
 * Shows the current launch config as a well-structured JSON document,
 * matching the same format that is loaded from and saved to disk.
 */
async function showLaunchConfigDialog() {
  if (launchConfigWindow) {
    launchConfigWindow.focus();
    return;
  }
  if (!mainWindow) return;

  let theme = 'dark';
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      const currentTheme = await mainWindow.webContents.executeJavaScript('document.body.className');
      theme = currentTheme || theme;
    } catch (error) {
      console.error('Could not get theme from main window, using default:', error);
    }
  }

  const launchConfigDialog = (appConfig.dialogSizes && appConfig.dialogSizes.launchConfig) || {};
  launchConfigWindow = new BrowserWindow({
    width: launchConfigDialog.width || 500,
    height: launchConfigDialog.height || 400,
    x: launchConfigDialog.x || undefined,
    y: launchConfigDialog.y || undefined,
    parent: mainWindow,
    modal: process.platform !== 'darwin',
    show: false,
    resizable: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  launchConfigWindow.setMenuBarVisibility(false);

  const saveLaunchConfigDialogBounds = () => {
    if (launchConfigWindow && !launchConfigWindow.isDestroyed()) {
      const [width, height] = launchConfigWindow.getSize();
      const [x, y] = launchConfigWindow.getPosition();
      if (!appConfig.dialogSizes) appConfig.dialogSizes = {};
      appConfig.dialogSizes.launchConfig = { width, height, x, y };
      configManager.saveConfig(appConfig);
    }
  };
  launchConfigWindow.on('resize', saveLaunchConfigDialogBounds);
  launchConfigWindow.on('move', saveLaunchConfigDialogBounds);

  launchConfigWindow.webContents.once('dom-ready', async () => {
    try {
      const launchConfig = await getCurrentLaunchConfig();
      const data = {
        config: launchConfig,
        theme: `theme-${appConfig.theme}`,
      };
      launchConfigWindow.webContents.send('load-launch-config-data', data);
    } catch (error) {
      handleError(error, 'Show Launch Config');
    }
  });

  launchConfigWindow.once('ready-to-show', () => {
    launchConfigWindow.show();
  });

  launchConfigWindow.on('closed', () => {
    launchConfigWindow = null;
  });

  launchConfigWindow.loadFile(path.join(__dirname, 'launch-config.html'), { query: { theme } });
}

/**
 * Opens a dialog to save the current launch configuration to a JSON file.
 * Requests current connection settings from the renderer, then writes
 * only launch-relevant keys.
 */
async function saveLaunchConfigAs() {
  if (!mainWindow) return;
  try {
    const launchConfig = await getCurrentLaunchConfig();
    const { filePath } = await dialog.showSaveDialog({
      title: 'Save Launch Configuration',
      defaultPath: 'launch-config.json',
      filters: [{ name: 'JSON files', extensions: ['json'] }]
    });
    if (filePath) {
      fs.writeFileSync(filePath, JSON.stringify(launchConfig, null, 2));
    }
  } catch (err) {
    handleError(err, 'Save Launch Config');
  }
}

// --- Menu and Context Menu ---
/**
 * Builds and returns the context menu based on the current application state.
 * @returns {Menu} The constructed context menu.
 */
function setOpacity(opacity) {
  if (mainWindow) {
    mainWindow.setOpacity(opacity);
    appConfig.opacity = opacity;
    configManager.saveConfig(appConfig);
  }
}

function buildContextMenu() {
  const isMac = process.platform === 'darwin';

  const themeMenu = [
    { label: 'Default (🌙 Dark)', type: 'radio', checked: appConfig.theme === 'dark', click: () => setTheme('dark') },
    { type: 'separator' }
  ].concat(
    [
      { label: '🔵 Blue', type: 'radio', checked: appConfig.theme === 'blue', click: () => setTheme('blue') },
      { label: '🟡 Color Blind', type: 'radio', checked: appConfig.theme === 'color-blind', click: () => setTheme('color-blind') },
      { label: '🌙 Dark', type: 'radio', checked: appConfig.theme === 'dark', click: () => setTheme('dark') },
      { label: '🌫️ Dark Gray', type: 'radio', checked: appConfig.theme === 'dark-gray', click: () => setTheme('dark-gray') },
      { label: '🟢 Green', type: 'radio', checked: appConfig.theme === 'green', click: () => setTheme('green') },
      { label: '⚫ High Contrast', type: 'radio', checked: appConfig.theme === 'high-contrast', click: () => setTheme('high-contrast') },
      { label: '☀️ Light', type: 'radio', checked: appConfig.theme === 'light', click: () => setTheme('light') },
      { label: '☁️ Light Gray', type: 'radio', checked: appConfig.theme === 'light-gray', click: () => setTheme('light-gray') },
      { label: '🌌 Midnight', type: 'radio', checked: appConfig.theme === 'midnight', click: () => setTheme('midnight') },
      { label: '☕ Mocha', type: 'radio', checked: appConfig.theme === 'mocha', click: () => setTheme('mocha') },
      { label: '🌊 Ocean', type: 'radio', checked: appConfig.theme === 'ocean', click: () => setTheme('ocean') },
      { label: '🌸 Rose', type: 'radio', checked: appConfig.theme === 'rose', click: () => setTheme('rose') },
      { label: '🌺 Rose Dark', type: 'radio', checked: appConfig.theme === 'rose-dark', click: () => setTheme('rose-dark') },
      { label: '🌅 Sunset', type: 'radio', checked: appConfig.theme === 'sunset', click: () => setTheme('sunset') },
      { label: '💻 System', type: 'radio', checked: appConfig.theme === 'system', click: () => setTheme('system') }
    ].sort((a, b) => a.label.localeCompare(b.label))
  );

  const menuTemplate = [
    {
      label: 'Help',
      accelerator: 'F1',
      click: showHelpDialog
    },
    {
      label: 'Command Line Interface',
      accelerator: 'F3',
      click: showCommandLineDialog
    },
    {
      type: 'separator'
    },
    {
      label: 'Clear Logs',
      accelerator: 'CmdOrCtrl+Delete',
      click: clearLogs
    },
    {
      label: 'Save Logs',
      accelerator: 'CmdOrCtrl+S',
      click: saveLogs
    },
    {
      type: 'separator'
    },
    {
      label: 'Theme',
      submenu: themeMenu
    },
    {
      label: 'Opacity',
      submenu: [
        { label: '100%', type: 'radio', checked: appConfig.opacity === 1.0, click: () => setOpacity(1.0) },
        { label: '95%', type: 'radio', checked: appConfig.opacity === 0.95, click: () => setOpacity(0.95) },
        { label: '90%', type: 'radio', checked: appConfig.opacity === 0.9, click: () => setOpacity(0.9) },
        { label: '85%', type: 'radio', checked: appConfig.opacity === 0.85, click: () => setOpacity(0.85) },
        { label: '80%', type: 'radio', checked: appConfig.opacity === 0.8, click: () => setOpacity(0.8) },
        { label: '75%', type: 'radio', checked: appConfig.opacity === 0.75, click: () => setOpacity(0.75) },
        { label: '70%', type: 'radio', checked: appConfig.opacity === 0.7, click: () => setOpacity(0.7) },
        { label: '65%', type: 'radio', checked: appConfig.opacity === 0.65, click: () => setOpacity(0.65) },
        { label: '60%', type: 'radio', checked: appConfig.opacity === 0.6, click: () => setOpacity(0.6) },
        { label: '55%', type: 'radio', checked: appConfig.opacity === 0.55, click: () => setOpacity(0.55) },
        { label: '50%', type: 'radio', checked: appConfig.opacity === 0.5, click: () => setOpacity(0.5) }
      ]
    },
    {
      label: 'Font Size',
      submenu: [
        {
          label: 'Default (13px)',
          type: 'radio',
          checked: appConfig.font.size === '13px',
          click: () => setFontSize('13px')
        },
        { type: 'separator' },
        ...Array.from({ length: 20 }, (_, i) => {
          const size = i + 6;
          const sizePx = `${size}px`;
          return {
            label: sizePx,
            type: 'radio',
            checked: appConfig.font.size === sizePx,
            click: () => setFontSize(sizePx)
          };
        })
      ]
    },
    {
      label: 'Font Family',
      submenu: [
        { label: 'Default (monospace)', type: 'radio', checked: appConfig.font.family === 'monospace', click: () => setFontFamily('monospace') },
        { type: 'separator' }
      ].concat([
        { label: 'Monospace', type: 'radio', checked: appConfig.font.family === 'monospace', click: () => setFontFamily('monospace') },
        { label: 'Arial', type: 'radio', checked: appConfig.font.family === 'Arial', click: () => setFontFamily('Arial') },
        { label: 'Brush Script MT', type: 'radio', checked: appConfig.font.family === 'Brush Script MT', click: () => setFontFamily('Brush Script MT') },
        { label: 'Comic Sans MS', type: 'radio', checked: appConfig.font.family === 'Comic Sans MS', click: () => setFontFamily('Comic Sans MS') },
        { label: 'Courier New', type: 'radio', checked: appConfig.font.family === 'Courier New', click: () => setFontFamily('Courier New') },
        { label: 'cursive', type: 'radio', checked: appConfig.font.family === 'cursive', click: () => setFontFamily('cursive') },
        { label: 'Garamond', type: 'radio', checked: appConfig.font.family === 'Garamond', click: () => setFontFamily('Garamond') },
        { label: 'Georgia', type: 'radio', checked: appConfig.font.family === 'Georgia', click: () => setFontFamily('Georgia') },
        { label: 'Helvetica', type: 'radio', checked: appConfig.font.family === 'Helvetica', click: () => setFontFamily('Helvetica') },
        { label: 'Lucida Console', type: 'radio', checked: appConfig.font.family === 'Lucida Console', click: () => setFontFamily('Lucida Console') },
        { label: 'Palatino', type: 'radio', checked: appConfig.font.family === 'Palatino', click: () => setFontFamily('Palatino') },
        { label: 'Segoe UI', type: 'radio', checked: appConfig.font.family === 'Segoe UI', click: () => setFontFamily('Segoe UI') },
        { label: 'Tahoma', type: 'radio', checked: appConfig.font.family === 'Tahoma', click: () => setFontFamily('Tahoma') },
        { label: 'Times New Roman', type: 'radio', checked: appConfig.font.family === 'Times New Roman', click: () => setFontFamily('Times New Roman') },
        { label: 'Trebuchet MS', type: 'radio', checked: appConfig.font.family === 'Trebuchet MS', click: () => setFontFamily('Trebuchet MS') },
        { label: 'Verdana', type: 'radio', checked: appConfig.font.family === 'Verdana', click: () => setFontFamily('Verdana') }
      ].sort((a, b) => a.label.localeCompare(b.label)))
    },
    {
      type: 'separator'
    },
    {
      label: 'Show App Configuration',
      accelerator: 'CmdOrCtrl+I',
      click: () => showConfigDialog()
    },
    {
      label: 'Save App Configuration',
      accelerator: 'CmdOrCtrl+Alt+S',
      click: saveConfig
    },
    {
      label: 'Save App Configuration To...',
      accelerator: 'CmdOrCtrl+Shift+S',
      click: saveConfigAs
    },
    {
      label: 'Apply App Configuration From...',
      accelerator: 'CmdOrCtrl+O',
      click: loadConfigFrom
    },
    {
      label: 'Reset App Configuration',
      accelerator: 'Shift+R',
      click: resetConfig
    },
    {
      type: 'separator'
    },
    {
      label: 'Show Launch Configuration',
      click: showLaunchConfigDialog
    },
    {
      label: 'Save Launch Configuration To...',
      click: saveLaunchConfigAs
    },
    {
      label: 'Apply Launch Configuration From...',
      click: applyLaunchConfigFrom
    },
    {
      label: 'Reset Launch Configuration',
      click: resetLaunchConfig
    },
    {
      type: 'separator'
    },
    {
      label: 'Toggle Developer Tools',
      accelerator: 'F12',
      type: 'checkbox',
      checked: devToolsOpen,
      click: () => {
        if (mainWindow) mainWindow.webContents.toggleDevTools();
      }
    },
    {
      label: 'Inspect Element Mode',
      accelerator: 'F11',
      type: 'checkbox',
      checked: inspectModeActive,
      click: () => {
        if (!mainWindow) return;
        inspectModeActive = !inspectModeActive;
        if (inspectModeActive) {
          if (!mainWindow.webContents.isDevToolsOpened()) {
            mainWindow.webContents.openDevTools({ mode: 'detach' });
          }
          mainWindow.webContents.send('enter-inspect-mode');
        } else {
          mainWindow.webContents.send('cancel-inspect-mode');
        }
        createMainMenu();
      }
    },
    {
      label: 'Test Error',
      click: () => {
        console.log('Intentionally throwing a test error.');
        throw new Error('This is a test error to check the error dialog.');
      }
    },
    {
      label: 'Log Level',
      submenu: buildLogLevelSubmenu()
    },
    {
      type: 'separator'
    },
    {
      label: 'Toggle Connection Line',
      type: 'checkbox',
      checked: connectionLineVisible,
      click: (menuItem) => {
        connectionLineVisible = menuItem.checked;
        if (mainWindow) {
          mainWindow.webContents.send('toggle-connection-line-menu', menuItem.checked);
        }
      }
    },
    {
      label: 'Show Metadata',
      type: 'checkbox',
      checked: showMetadataEnabled,
      click: (menuItem) => {
        showMetadataEnabled = menuItem.checked;
        if (mainWindow) {
          mainWindow.webContents.send('toggle-show-metadata-menu', menuItem.checked);
        }
        // Rebuild main menu so its checkbox stays in sync
        createMainMenu();
      }
    },
    ...(!isMac ? [{
        label: 'Toggle Menu Bar',
        type: 'checkbox',
        checked: mainWindow.isMenuBarVisible(),
        click: () => toggleMenuBar()
      }
    ] : []),
    {
      type: 'separator'
    },
    {
      label: 'About ArcGIS Velocity Logger',
      accelerator: 'F2',
      click: () => showAboutDialog()
    }
  ]; // End of menuTemplate array

  return Menu.buildFromTemplate(menuTemplate);
}

/**
 * Sets up the context menu for the main window.
 */
function toggleMenuBar() {
  if (mainWindow) {
    const isVisible = !mainWindow.isMenuBarVisible();
    mainWindow.setMenuBarVisibility(isVisible);
    appConfig.menuBarVisible = isVisible;
    configManager.saveConfig(appConfig);
  }
}

/**
 * Sets up the context menu for the main window.
 */
function setupContextMenu() {
  mainWindow.webContents.on('context-menu', (e) => {
    e.preventDefault();
    const contextMenu = buildContextMenu();
    contextMenu.popup({ window: mainWindow });
  });
}

function setTheme(theme) {
  if (appConfig) {
    appConfig.theme = theme;
    configManager.saveConfig(appConfig);
    if (mainWindow) {
      mainWindow.webContents.send('load-saved-theme', theme);
    }
  }
}

function setFontSize(size) {
  if (appConfig) {
    appConfig.font.size = size;
    configManager.saveConfig(appConfig);
    if (mainWindow) {
      mainWindow.webContents.send('font-size-changed', size);
    }
  }
}

function setFontFamily(family) {
  if (appConfig) {
    appConfig.font.family = family;
    configManager.saveConfig(appConfig);
    if (mainWindow) {
      mainWindow.webContents.send('font-family-changed', family);
    }
  }
}

/**
 * Creates the main application menu to enable global keyboard shortcuts.
 */
function createMainMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    ...(isMac ? [{
      label: 'ArcGIS Velocity Logger',
      submenu: [
        { label: 'Hide', accelerator: 'CmdOrCtrl+H', role: 'hide' },
        { label: 'Hide Others', accelerator: 'CmdOrCtrl+Alt+H', role: 'hideothers' },
        { label: 'Show All', role: 'unhide' },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
      ]
    }] : []),
    {
      // File
      label: 'File',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: 'Force Reload', accelerator: 'CmdOrCtrl+Shift+R', role: 'forceReload' },
        ...(!isMac ? [{ type: 'separator' }, { label: 'Exit', accelerator: 'Alt+F4', click: () => app.quit() }] : [])
      ]
    },
    {
      // Edit
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', role: 'selectall' }
      ]
    },
    {
      // View
      label: 'View',
      submenu: [
        { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { type: 'separator' },
        { label: 'Toggle Fullscreen', accelerator: 'F11', role: 'togglefullscreen' }
      ]
    },
    {
      // Action
      label: 'Action',
      submenu: [
        { label: 'Clear Logs', accelerator: 'CmdOrCtrl+Delete', click: clearLogs},
        { label: 'Save Logs', accelerator: 'CmdOrCtrl+S', click: saveLogs}
      ]
    },
    {
      // Settings
      label: 'Settings',
      submenu: [
        { label: 'Show App Configuration', accelerator: 'CmdOrCtrl+I', click: () => showConfigDialog() },
        { label: 'Save App Configuration', accelerator: 'CmdOrCtrl+Alt+S', click: saveConfig },
        { label: 'Save App Configuration To...', accelerator: 'CmdOrCtrl+Shift+S', click: saveConfigAs },
        { label: 'Apply App Configuration From...', accelerator: 'CmdOrCtrl+O', click: loadConfigFrom },
        { label: 'Reset App Configuration', accelerator: 'Shift+R', click: resetConfig },
        { type: 'separator' },
        { label: 'Show Launch Configuration', click: showLaunchConfigDialog },
        { label: 'Save Launch Configuration To...', click: saveLaunchConfigAs },
        { label: 'Apply Launch Configuration From...', click: applyLaunchConfigFrom },
        { label: 'Reset Launch Configuration', click: resetLaunchConfig },
        { type: 'separator' },
        {
          label: 'Toggle Connection Line',
          type: 'checkbox',
          checked: connectionLineVisible,
          click: (menuItem) => {
            connectionLineVisible = menuItem.checked;
            if (mainWindow) {
              mainWindow.webContents.send('toggle-connection-line-menu', menuItem.checked);
            }
          }
        },
        {
          label: 'Show Metadata',
          type: 'checkbox',
          checked: showMetadataEnabled,
          click: (menuItem) => {
            showMetadataEnabled = menuItem.checked;
            if (mainWindow) {
              mainWindow.webContents.send('toggle-show-metadata-menu', menuItem.checked);
            }
            // Rebuild main menu so its checkbox reflects the new state on next open
            createMainMenu();
          }
        }
      ]
    },
    {
      // Help
      label: 'Help',
      submenu: [
        { 
          label: 'Help',
          accelerator: 'F1',
          click: () => { if (mainWindow) showHelpDialog(); }
        },
        {
          label: 'Command Line Interface',
          accelerator: 'F3',
          click: () => { if (mainWindow) showCommandLineDialog(); }
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'F12',
          type: 'checkbox',
          checked: devToolsOpen,
          click: () => {
            if (mainWindow && mainWindow.webContents.isDevToolsOpened()) {
              mainWindow.webContents.closeDevTools();
            } else if (mainWindow) {
              mainWindow.webContents.openDevTools({ mode: 'detach' });
            }
          }
        },
        {
          label: 'Inspect Element Mode',
          accelerator: 'F11',
          type: 'checkbox',
          checked: inspectModeActive,
          click: () => {
            if (!mainWindow) return;
            inspectModeActive = !inspectModeActive;
            if (inspectModeActive) {
              if (!mainWindow.webContents.isDevToolsOpened()) {
                mainWindow.webContents.openDevTools({ mode: 'detach' });
              }
              mainWindow.webContents.send('enter-inspect-mode');
            } else {
              mainWindow.webContents.send('cancel-inspect-mode');
            }
            createMainMenu();
          }
        },
        {
          label: 'Log Level',
          submenu: buildLogLevelSubmenu()
        },
        {
          label: 'About',
          accelerator: 'F2',
          click: () => showAboutDialog()
        }
      ]
    }
  ];

  const mainMenu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(mainMenu);
}


ipcMain.on('save-theme', (event, theme) => {
  if (appConfig) {
    appConfig.theme = theme;
    configManager.saveConfig(appConfig);
  }
});



ipcMain.handle('get-current-theme', async () => {
  if (mainWindow) {
    try {
      const theme = await mainWindow.webContents.executeJavaScript('document.body.className');
      return theme.replace('theme-', ''); // Return only the theme name
    } catch (err) {
      handleError(err, 'Get Theme');
      return 'dark'; // Default theme
    }
  }
  return 'dark'; // Default theme
});

ipcMain.on('copy-to-clipboard', (event, text) => {
  clipboard.writeText(text);
});

ipcMain.on('open-external-link', (event, url) => {
  shell.openExternal(url);
});

ipcMain.on('close-dialog', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window && window !== mainWindow) {
    window.close();
  }
});

// Renderer → main request to open the Command Line Interface dialog (e.g. toolbar button).
ipcMain.on('show-cli-dialog', () => {
  showCommandLineDialog();
});

// Handle connection line state updates from renderer
ipcMain.on('connection-line-state-changed', (event, isVisible) => {
  connectionLineVisible = isVisible;
});

// Handle "Show Metadata" state updates from renderer
ipcMain.on('show-metadata-state-changed', (event, isEnabled) => {
  showMetadataEnabled = isEnabled;
  // Rebuild the main menu so its checkbox reflects the new state
  createMainMenu();
});

// Inspect element at the coordinates reported by the renderer's pick-mode click.
ipcMain.on('inspect-element', (event, { x, y }) => {
  event.sender.inspectElement(x, y);
  // Clear active state once the pick completes, then sync both menus.
  inspectModeActive = false;
  createMainMenu();
});

// Renderer cancelled inspect mode (Escape key or explicit cancel).
ipcMain.on('inspect-element-done', () => {
  inspectModeActive = false;
  createMainMenu();
});

app.whenReady().then(async () => {
  try {
    if (cliOptions.mode === 'help' || cliOptions.mode === 'error') {
      app.quit();
      return;
    }

    // If CLI requested headless mode, skip all UI construction and run the capture session.
    if (cliOptions.mode === 'headless') {
      if (process.platform === 'darwin' && app.dock) {
        try { app.dock.hide(); } catch (_) {}
      }
      await runHeadlessSession(cliOptions.headless, { app, logger: appLogger });
      return;
    }

    // Initialize configuration manager and load config
    configManager = new ConfigManager();
    appConfig = configManager.loadConfig();

    // Restore persisted log level
    if (appConfig.logLevel) {
      appLogger.logLevel = appConfig.logLevel;
    }

    // Force set app name and about panel for macOS menu
    app.setName('ArcGIS Velocity Logger');
    if (process.platform === 'darwin') {
      app.setAboutPanelOptions({
        applicationName: 'ArcGIS Velocity Logger',
        applicationVersion: app.getVersion(),
        copyright: 'Copyright 2025 Esri',
        credits: 'ArcGIS Velocity Logger'
      });
    }

    // Create and set the application menu toolbar
    createMainMenu();

    // Create the splash window
    createSplashWindow();

    // Create the main window
    createWindow();

    // Set the application icon for macOS
    if (process.platform === 'darwin') {
      app.dock.setIcon(path.join(__dirname, 'assets', 'icon.png'));
    }

    nativeTheme.on('updated', () => {
      if (mainWindow && mainWindow.webContents)
        mainWindow.webContents.send('system-theme-changed', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
    });

    app.on('window-all-closed', () => {
      // Only quit if the main window is actually closed
      // Don't quit just because dialog windows close
      if (!mainWindow || mainWindow.isDestroyed()) {
        app.quit();
      }
    });

    app.on('before-quit', () => {
      try {
        if (xmppTransport) {
          xmppTransport.disconnect().catch((error) => velocityLog('warn', `[XMPP] Cleanup failed: ${error.message}`));
          xmppTransport = null;
        }
        if (mainWindow) {
          saveWindowState();
        }
      } catch (e) {
        handleError(e, 'Save Window State');
      }
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        if (splashWindow) {
          splashWindow.close();
          splashWindow = null;
        }
        createWindow();
      }
    });
  } catch (err) {
    handleError(err, 'Application Startup');
    app.quit();
  }
});

ipcMain.handle('get-system-theme', async () => {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
});

ipcMain.handle('get-app-version', async () => {
  return app.getVersion();
});

ipcMain.handle('get-cli-help-reference', async () => {
  return getCommandLineReferenceData();
});

ipcMain.handle('save-logs', async (event, content) => {
    const { filePath, canceled } = await dialog.showSaveDialog({
        title: 'Save Logs',
        defaultPath: 'velocity-logs.csv',
        filters: [
            { name: 'CSV Files', extensions: ['csv'] },
            { name: 'All Files', extensions: ['*'] }
        ],
        icon: path.join(__dirname, 'assets', 'icon.png')
    });

    if (canceled || !filePath) {
        return;
    }

    try {
        await fs.promises.writeFile(filePath, content);
        return { success: true, filePath };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

function updateUdpButtonStates(connectionState) {
    // connectionState: 'connected' | 'disconnected' | 'connecting' | 'disconnecting'
    mainWindow.webContents.send('udp-set-connect-enabled', connectionState === 'disconnected');
    mainWindow.webContents.send('udp-set-disconnect-enabled', connectionState === 'connected' || connectionState === 'connecting');
    mainWindow.webContents.send('udp-connection-state', connectionState);
}

function updateTcpButtonStates(connectionState) {
    // connectionState: 'connected' | 'disconnected' | 'connecting' | 'disconnecting'
    mainWindow.webContents.send('tcp-set-connect-enabled', connectionState === 'disconnected');
    mainWindow.webContents.send('tcp-set-disconnect-enabled', connectionState === 'connected' || connectionState === 'connecting');
    mainWindow.webContents.send('tcp-connection-state', connectionState);
}

ipcMain.on('connect-tcp', (event, { type, port, host }) => {
    currentConnectionDetails = { protocol: 'tcp', type, port, host };
    // Immediately set connecting state
    updateTcpButtonStates('connecting');
    if (type === 'server') {
        server = net.createServer((socket) => {
            sockets.push(socket);
            mainWindow.webContents.send('tcp-status', 'client-connected');
            // Don't update button state here; already set on listen
            socket.on('data', async (data) => {
                const remoteAddr = socket.remoteAddress || '?';
                const remotePort = socket.remotePort || '?';
                const localAddr = socket.localAddress || '?';
                const localPort = socket.localPort || '?';
                sendMetadataLine(`[metadata] protocol=TCP mode=server remote=${remoteAddr}:${remotePort} local=${localAddr}:${localPort}`);
                mainWindow.webContents.send('log-data', data.toString());
            });
            socket.on('close', () => {
                mainWindow.webContents.send('tcp-status', 'client-disconnected');
                let index = sockets.indexOf(socket);
                if (index !== -1) {
                    sockets.splice(index, 1);
                }
            });
            socket.on('error', (err) => {
                mainWindow.webContents.send('tcp-error', err.message);
            });
        });

        server.on('error', (err) => {
            mainWindow.webContents.send('connection-error', `TCP Server Error: ${err.message}`);
            updateTcpButtonStates('disconnected');
        });

        server.listen(port, host, () => {
            const address = server.address();
            mainWindow.webContents.send('tcp-status', `TCP Server listening on ${address.address}:${address.port}`);
            updateTcpButtonStates('connected'); // Server is "connected" when listening
        });

    } else if (type === 'client') {
        if (clientSocket) {
            mainWindow.webContents.send('tcp-error', 'A TCP client connection is already active.');
            updateTcpButtonStates('disconnected');
            return;
        }
        clientSocket = new net.Socket();

        clientSocket.connect(port, host, () => {
            mainWindow.webContents.send('tcp-status', `TCP Client connected to ${host}:${port}`);
            updateTcpButtonStates('connected');
        });

        clientSocket.on('data', async (data) => {
            const localAddr = clientSocket.localAddress || '?';
            const localPort = clientSocket.localPort || '?';
            sendMetadataLine(`[metadata] protocol=TCP mode=client remote=${host}:${port} local=${localAddr}:${localPort}`);
            mainWindow.webContents.send('log-data', data.toString());
        });

        clientSocket.on('close', () => {
            mainWindow.webContents.send('tcp-status', 'Disconnected from TCP Client');
            cleanupTcpClientSocket();
            updateTcpButtonStates('disconnected');
        });

        clientSocket.on('error', (err) => {
            mainWindow.webContents.send('tcp-error', err.message);
            cleanupTcpClientSocket();
            updateTcpButtonStates('disconnected');
        });
    }
});

ipcMain.on('disconnect-tcp', () => {
    // Immediately set disconnecting state
    updateTcpButtonStates('disconnecting');
    if (server) {
        sockets.forEach(socket => socket.destroy());
        server.close(() => {
            mainWindow.webContents.send('tcp-status', `TCP Server on port ${currentConnectionDetails.port} stopped`);
            server = null;
            currentConnectionDetails = null;
            updateTcpButtonStates('disconnected');
        });
        sockets = [];
    }
    if (clientSocket) {
        mainWindow.webContents.send('tcp-status', 'Disconnected from TCP Client');
        cleanupTcpClientSocket();
        updateTcpButtonStates('disconnected');
    }
    
    // If neither server nor client socket exists, still reset to disconnected state
    if (!server && !clientSocket) {
        mainWindow.webContents.send('tcp-status', 'No TCP connection to disconnect');
        updateTcpButtonStates('disconnected');
    }
});

// Helper function to validate UDP connection parameters
function validateUdpParams(type, port, host) {
    if (!type || !['server', 'client'].includes(type)) {
        throw new Error('Invalid connection type. Must be "server" or "client".');
    }
    
    const portNum = parseInt(port);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        throw new Error('Invalid port. Must be between 1 and 65535.');
    }
    
    if (!host || typeof host !== 'string' || host.trim() === '') {
        throw new Error('Invalid host. Host cannot be empty.');
    }
    
    return { type, port: portNum, host: host.trim() };
}

// Helper function to cleanup UDP socket
function cleanupUdpSocket() {
    if (udpSocket) {
        try {
            if (currentConnectionDetails && currentConnectionDetails.type === 'client') {
                // Only call disconnect if the socket is actually connected
                if (typeof udpSocket.remoteAddress === 'string' && typeof udpSocket.remotePort === 'number') {
                    try {
                        udpSocket.disconnect();
                    } catch (err) {
                        if (err.code !== 'ERR_SOCKET_DGRAM_NOT_CONNECTED') {
                            handleError(err, 'UDP Client Disconnect');
                        }
                        // Gracefully handle the error if the socket was not connected
                    }
                }
            }
            udpSocket.removeAllListeners();
            udpSocket.close();
        } catch (err) {
            // Always gracefully handle errors and allow UX to recover
            handleError(err, 'UDP Socket Cleanup');
        }
        udpSocket = null;
        currentConnectionDetails = null;
        udpClients.clear(); // Clear tracked clients
    }
}

ipcMain.on('connect-udp', (event, { type, port, host }) => {
    try {
        const validatedParams = validateUdpParams(type, port, host);
        const { type: validType, port: validPort, host: validHost } = validatedParams;

        if (udpSocket) {
            mainWindow.webContents.send('udp-error', 'A UDP connection is already active. Please disconnect first.');
            return;
        }

        // Immediately set connecting state
        updateUdpButtonStates('connecting');
        currentConnectionDetails = { protocol: 'udp', type: validType, port: validPort, host: validHost };

        if (validType === 'server') {
            udpSocket = dgram.createSocket('udp4');

            udpSocket.on('error', (err) => {
                mainWindow.webContents.send('udp-error', `UDP Server error: ${err.message}`);
                cleanupUdpSocket();
                updateUdpButtonStates('disconnected');
            });

            udpSocket.on('message', (msg, rinfo) => {
                try {
                    const clientKey = `${rinfo.address}:${rinfo.port}`;
                    if (!udpClients.has(clientKey)) {
                        udpClients.add(clientKey);
                        mainWindow.webContents.send('udp-status', `Client connected from ${clientKey}`);
                      }
                    const localAddr = udpSocket.address();
                    sendMetadataLine(`[metadata] protocol=UDP mode=server remote=${rinfo.address}:${rinfo.port} local=${localAddr.address}:${localAddr.port} family=${rinfo.family} size=${rinfo.size}`);
                    const message = msg.toString('utf8');
                    mainWindow.webContents.send('log-data', message);
                } catch (err) {
                    mainWindow.webContents.send('udp-error', `Error processing message: ${err.message}`);
                }
            });

            udpSocket.on('listening', () => {
                try {
                    const address = udpSocket.address();
                    mainWindow.webContents.send('udp-status', `UDP Server listening on ${address.address}:${address.port}`);
                    updateUdpButtonStates('connected'); // Server is "connected" when listening
                } catch (err) {
                    mainWindow.webContents.send('udp-error', `Error getting server address: ${err.message}`);
                }
            });

            udpSocket.on('close', () => {
                mainWindow.webContents.send('udp-status', 'UDP Server closed');
                updateUdpButtonStates('disconnected');
            });

            try {
                udpSocket.bind(validPort, validHost);
            } catch (err) {
                mainWindow.webContents.send('udp-error', `Failed to bind UDP server: ${err.message}`);
                cleanupUdpSocket();
                updateUdpButtonStates('disconnected');
            }

        } else if (validType === 'client') {
            udpSocket = dgram.createSocket('udp4');

            udpSocket.on('error', (err) => {
                if (err.code === 'ECONNREFUSED') {
                    const { host, port } = currentConnectionDetails || {};
                    const message = `Connection refused by ${host || 'host'}:${port || 'port'}. Ensure a UDP server is listening.`;
                    mainWindow.webContents.send('udp-error', message);
                } else {
                    mainWindow.webContents.send('udp-error', `WebSocket Client error: ${err.message}`);
                }
                cleanupUdpSocket();
                updateUdpButtonStates('disconnected');
            });

            udpSocket.on('message', (msg) => {
                try {
                    const localAddr = udpSocket.address();
                    sendMetadataLine(`[metadata] protocol=UDP mode=client remote=${validHost}:${validPort} local=${localAddr.address}:${localAddr.port} family=IPv4 size=${msg.length}`);
                    const message = msg.toString('utf8');
                    mainWindow.webContents.send('log-data', message);
                } catch (err) {
                    mainWindow.webContents.send('udp-error', `Error processing message: ${err.message}`);
                }
            });

            udpSocket.on('close', () => {
                mainWindow.webContents.send('udp-status', 'UDP Client closed');
                updateUdpButtonStates('disconnected');
            });

            udpSocket.on('connect', () => {
                const localAddress = udpSocket.address();
                mainWindow.webContents.send('udp-status', `UDP Client connected from ${localAddress.port} to ${validHost}:${validPort}`);
                updateUdpButtonStates('connected');

                registerUdpClient(udpSocket).catch((err) => {
                    mainWindow.webContents.send('udp-error', `Failed to send connection message: ${err.message}`);
                });
            });

            udpSocket.on('listening', () => {
                try {
                    udpSocket.connect(validPort, validHost);
                } catch (connectErr) {
                    mainWindow.webContents.send('udp-error', `Failed to connect UDP client: ${connectErr.message}`);
                    cleanupUdpSocket();
                    updateUdpButtonStates('disconnected');
                }
            });

            try {
                udpSocket.bind(); // Bind to an ephemeral port
            } catch (bindErr) {
                mainWindow.webContents.send('udp-error', `Failed to bind UDP client: ${bindErr.message}`);
                cleanupUdpSocket();
                updateUdpButtonStates('disconnected');
            }
        }

    } catch (validationErr) {
        mainWindow.webContents.send('udp-error', validationErr.message);
        updateUdpButtonStates('disconnected');
    }
});

ipcMain.on('disconnect-udp', () => {
    // Immediately set disconnecting state
    updateUdpButtonStates('disconnecting');
    if (udpSocket) {
        let message = 'UDP Socket closed';
        if (currentConnectionDetails) {
            if (currentConnectionDetails.type === 'server') {
                message = `UDP Server on port ${currentConnectionDetails.port} stopped`;
            } else if (currentConnectionDetails.type === 'client') {
                message = 'Disconnected from UDP Client';
            }
        }
        cleanupUdpSocket();
        mainWindow.webContents.send('udp-status', message);
        updateUdpButtonStates('disconnected');
    } else {
        mainWindow.webContents.send('udp-status', 'No UDP connection to disconnect');
        updateUdpButtonStates('disconnected');
    }
});


// --- gRPC Connection Handling ---
const { createGrpcServerTransport, createGrpcClientTransport } = require('./grpc-transport.js');
let grpcTransport = null;

function updateGrpcButtonStates(connectionState) {
    mainWindow.webContents.send('tcp-set-connect-enabled', connectionState === 'disconnected');
    mainWindow.webContents.send('tcp-set-disconnect-enabled', connectionState === 'connected' || connectionState === 'connecting');
    mainWindow.webContents.send('tcp-connection-state', connectionState);
}

ipcMain.on('connect-grpc', (event, { type, port, host, grpcSerialization, grpcSendMethod, headerPathKey, headerPath, useTls, tlsCaPath, tlsCertPath, tlsKeyPath, allowUnverifiedTls }) => {
    currentConnectionDetails = { protocol: 'grpc', type, port, host, grpcSerialization, grpcSendMethod, headerPathKey, headerPath, useTls, tlsCaPath, tlsCertPath, tlsKeyPath, allowUnverifiedTls };
    updateGrpcButtonStates('connecting');
    const ser = grpcSerialization || 'protobuf';

    const onData = (text) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('log-data', text);
        }
    };

    // Always emit metadata via log-metadata so the renderer can retroactively show/hide it
    const onHeaders = (metadataLine) => {
        sendMetadataLine(metadataLine);
    };

    if (type === 'server') {
        grpcTransport = createGrpcServerTransport({ ip: host, port, grpcSerialization, headerPathKey, headerPath, useTls, tlsCaPath, tlsCertPath, tlsKeyPath, onData, onRawHeaders: onHeaders });
        grpcTransport.connect().then((result) => {
            mainWindow.webContents.send('grpc-status', `gRPC Server listening on ${result.address}:${result.port} [${ser}]\n  ${result.tlsInfo || 'tls=off'}`);
            updateGrpcButtonStates('connected');
        }).catch((err) => {
            mainWindow.webContents.send('grpc-error', err.message);
            grpcTransport = null;
            updateGrpcButtonStates('disconnected');
        });
    } else { // client
        const onClientMetadata = (line) => sendMetadataLine(line);
        const onClientStatus = (line) => sendMetadataLine(line);
        grpcTransport = createGrpcClientTransport({ ip: host, port, grpcSerialization, grpcSendMethod, headerPathKey, headerPath, useTls, tlsCaPath, tlsCertPath, tlsKeyPath, allowUnverifiedTls, authToken: getVelocityAuthTokenForConnection(), onData, onMetadata: onClientMetadata, onStatus: onClientStatus, onLog: (level, message) => velocityLog(level, message) });
        grpcTransport.connect().then((result) => {
            mainWindow.webContents.send('grpc-status', `gRPC Client connected to ${result.address} [${ser}] ${headerPathKey}=${headerPath}\n  ${result.tlsInfo || 'tls=off'}`);
            updateGrpcButtonStates('connected');
        }).catch((err) => {
            mainWindow.webContents.send('grpc-error', err.message);
            grpcTransport = null;
            updateGrpcButtonStates('disconnected');
        });
    }
});

// Teardown is total: the transport clears its own state before it reports a
// problem, so a peer that disappeared first is a diagnostic and never a reason
// to leave the user stuck in a connected state.
ipcMain.on('disconnect-grpc', async () => {
    updateGrpcButtonStates('disconnecting');
    if (grpcTransport) {
        const active = grpcTransport;
        grpcTransport = null;
        currentConnectionDetails = null;
        try {
            await active.disconnect();
            mainWindow.webContents.send('grpc-status', 'gRPC connection closed');
        } catch (err) {
            velocityLog('warn', `[Transport] gRPC teardown reported: ${err.message}`);
            mainWindow.webContents.send('grpc-status', `gRPC connection closed. Teardown reported: ${err.message}`);
        }
        updateGrpcButtonStates('disconnected');
    } else {
        mainWindow.webContents.send('grpc-status', 'No gRPC connection to disconnect');
        updateGrpcButtonStates('disconnected');
    }
});


// --- HTTP Connection Handling ---
const { createHttpClientTransport, createHttpServerTransport, FORMAT_CONTENT_TYPES } = require('./http-transport.js');
let httpTransport = null;

function updateHttpButtonStates(connectionState) {
    mainWindow.webContents.send('tcp-set-connect-enabled', connectionState === 'disconnected');
    mainWindow.webContents.send('tcp-set-disconnect-enabled', connectionState === 'connected' || connectionState === 'connecting');
    mainWindow.webContents.send('tcp-connection-state', connectionState);
}

ipcMain.on('connect-http', (event, { type, port, host, httpFormat, httpTls, httpTlsCaPath, httpTlsCertPath, httpTlsKeyPath, httpPath, httpAllowUnverifiedTls }) => {
    currentConnectionDetails = { protocol: 'http', type, port, host, httpFormat, httpTls, httpTlsCaPath, httpTlsCertPath, httpTlsKeyPath, httpPath, httpAllowUnverifiedTls };
    updateHttpButtonStates('connecting');
    const contentType = FORMAT_CONTENT_TYPES[httpFormat] || 'text/plain';

    const onData = (text, metadata) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            if (metadata) {
                sendMetadataLine(`[metadata] protocol=HTTP mode=${type} method=${metadata.method} path=${metadata.path} content-type=${metadata.contentType} content-length=${metadata.contentLength} tls=${metadata.tls} remote=${metadata.remote} format=${metadata.httpFormat}`);
            }
            mainWindow.webContents.send('log-data', text);
        }
    };

    if (type === 'server') {
        httpTransport = createHttpServerTransport({ ip: host, port, httpFormat, httpPath, httpTls, httpTlsCaPath, httpTlsCertPath, httpTlsKeyPath, onData });
        httpTransport.connect().then((result) => {
            const scheme = httpTls ? 'https' : 'http';
            mainWindow.webContents.send('http-status', `HTTP Server listening on ${scheme}://${result.address.address}:${result.address.port}${httpPath || '/'} [${httpFormat}] Content-Type: ${contentType}\n  ${result.tlsInfo || 'tls=off'}`);
            updateHttpButtonStates('connected');
        }).catch((err) => {
            mainWindow.webContents.send('http-error', err.message);
            httpTransport = null;
            updateHttpButtonStates('disconnected');
        });
    } else { // client
        httpTransport = createHttpClientTransport({ ip: host, port, httpFormat, httpPath, httpTls, httpTlsCaPath, httpTlsCertPath, httpTlsKeyPath, httpAllowUnverifiedTls, authToken: getVelocityAuthTokenForConnection(), onData, onLog: (level, message) => velocityLog(level, message) });
        httpTransport.connect().then((result) => {
            mainWindow.webContents.send('http-status', `HTTP Client connected to ${result.address} [${httpFormat}] Content-Type: ${contentType}\n  ${result.tlsInfo || 'tls=off'}`);
            updateHttpButtonStates('connected');
        }).catch((err) => {
            mainWindow.webContents.send('http-error', err.message);
            httpTransport = null;
            updateHttpButtonStates('disconnected');
        });
    }
});

ipcMain.on('disconnect-http', async () => {
    updateHttpButtonStates('disconnecting');
    if (httpTransport) {
        const active = httpTransport;
        httpTransport = null;
        currentConnectionDetails = null;
        try {
            await active.disconnect();
            mainWindow.webContents.send('http-status', 'HTTP connection closed');
        } catch (err) {
            velocityLog('warn', `[Transport] HTTP teardown reported: ${err.message}`);
            mainWindow.webContents.send('http-status', `HTTP connection closed. Teardown reported: ${err.message}`);
        }
        updateHttpButtonStates('disconnected');
    } else {
        mainWindow.webContents.send('http-status', 'No HTTP connection to disconnect');
        updateHttpButtonStates('disconnected');
    }
});

// --- WebSocket Connection Handling ---
const { createWsClientTransport, createWsServerTransport } = require('./ws-transport.js');
const { FORMAT_CONTENT_TYPES: WS_CONTENT_TYPES } = require('./format-utils.js');
let wsTransport = null;

function updateWsButtonStates(connectionState) {
    mainWindow.webContents.send('tcp-set-connect-enabled', connectionState === 'disconnected');
    mainWindow.webContents.send('tcp-set-disconnect-enabled', connectionState === 'connected' || connectionState === 'connecting');
    mainWindow.webContents.send('tcp-connection-state', connectionState);
}

ipcMain.on('connect-ws', (event, { type, port, host, wsFormat, wsTls, wsTlsCaPath, wsTlsCertPath, wsTlsKeyPath, wsPath, wsSubscriptionMsg, wsIgnoreFirstMsg, wsHeaders, wsAllowUnverifiedTls }) => {
    currentConnectionDetails = { protocol: 'ws', type, port, host, wsFormat, wsTls, wsTlsCaPath, wsTlsCertPath, wsTlsKeyPath, wsPath, wsAllowUnverifiedTls };
    updateWsButtonStates('connecting');

    const contentType = WS_CONTENT_TYPES[wsFormat] || 'text/plain';

    const onData = (data, metadata) => {
        if (metadata) {
            sendMetadataLine(`[metadata] protocol=WebSocket mode=${type} path=${metadata.path || wsPath} content-type=${metadata.contentType || contentType} tls=${metadata.tls || (wsTls ? 'on (WSS)' : 'off (WS)')} remote=${metadata.remote || 'unknown'} format=${wsFormat}`);
        }
        mainWindow.webContents.send('log-data', data);
    };

    // A receive-only session has no other way to notice that the stream it is
    // capturing went away, so the transport reports its own lifecycle here.
    // Our own teardown clears `wsTransport` before it awaits, so the guard
    // keeps a deliberate disconnect from reporting a lost connection.
    let activeTransport = null;
    const makeOnStateChange = (role) => (state, detail = {}) => {
        if (state === 'error') {
            velocityLog('warn', `[Transport] WebSocket ${role}: ${detail.message || 'transport error'}`);
            return;
        }
        if (state !== 'closed') return;
        if (!wsTransport || wsTransport !== activeTransport) return;
        wsTransport = null;
        currentConnectionDetails = null;
        mainWindow.webContents.send('ws-status', detail.message || 'WebSocket connection closed');
        updateWsButtonStates('disconnected');
    };

    try {
        if (type === 'server') {
            wsTransport = createWsServerTransport({ ip: host, port, wsFormat, wsPath, wsTls, wsTlsCaPath, wsTlsCertPath, wsTlsKeyPath, onData, onStateChange: makeOnStateChange('server') });
            activeTransport = wsTransport;
            wsTransport.connect().then((result) => {
                const scheme = wsTls ? 'wss' : 'ws';
                mainWindow.webContents.send('ws-status', `WebSocket Server listening on ${scheme}://${result.address.address}:${result.address.port}${wsPath || '/'} [${wsFormat}] Content-Type: ${contentType}\n  ${result.tlsInfo || 'tls=off'}`);
                updateWsButtonStates('connected');
            }).catch((err) => {
                mainWindow.webContents.send('ws-error', `WebSocket Server error: ${err.message}`);
                wsTransport = null;
                updateWsButtonStates('disconnected');
            });
        } else {
            wsTransport = createWsClientTransport({ ip: host, port, wsFormat, wsPath, wsTls, wsTlsCaPath, wsTlsCertPath, wsTlsKeyPath, wsSubscriptionMsg, wsIgnoreFirstMsg, wsHeaders, wsAllowUnverifiedTls, authToken: getVelocityAuthTokenForConnection(), onData, onStateChange: makeOnStateChange('client') });
            activeTransport = wsTransport;
            wsTransport.connect().then((result) => {
                mainWindow.webContents.send('ws-status', `WebSocket Client connected to ${result.address} [${wsFormat}] Content-Type: ${contentType}\n  ${result.tlsInfo || 'tls=off'}`);
                updateWsButtonStates('connected');
            }).catch((err) => {
                mainWindow.webContents.send('ws-error', `WebSocket Client error: ${err.message}`);
                wsTransport = null;
                updateWsButtonStates('disconnected');
            });
        }
    } catch (err) {
        mainWindow.webContents.send('ws-error', `WebSocket error: ${err.message}`);
        updateWsButtonStates('disconnected');
    }
});

// The WebSocket transport tears down asynchronously, so the handler awaits it
// and reports 'disconnected' only once teardown has finished. That ordering is
// what lets the user rebind the same port immediately after the status arrives.
ipcMain.on('disconnect-ws', async () => {
    updateWsButtonStates('disconnecting');
    if (wsTransport) {
        const active = wsTransport;
        wsTransport = null;
        currentConnectionDetails = null;
        try {
            await active.disconnect();
            mainWindow.webContents.send('ws-status', 'WebSocket connection closed');
        } catch (err) {
            velocityLog('warn', `[Transport] WebSocket teardown reported: ${err.message}`);
            mainWindow.webContents.send('ws-status', `WebSocket connection closed. Teardown reported: ${err.message}`);
        }
        updateWsButtonStates('disconnected');
    } else {
        mainWindow.webContents.send('ws-status', 'No WebSocket connection to disconnect');
        updateWsButtonStates('disconnected');
    }
});

// --- XMPP Connection Handling ---
const { createXmppClientTransport, createXmppServerTransport } = require('./xmpp-transport.js');
let xmppTransport = null;
let xmppConnectionAttempt = 0;

ipcMain.on('connect-xmpp', async (event, options) => {
    const type = options.type || 'server';
    const role = type === 'server' ? 'Server' : 'Client';
    if (xmppTransport) {
        const message = `XMPP ${role} warning: a connection is already active or connecting`;
        velocityLog('warn', `[XMPP] ${message}`);
        mainWindow.webContents.send('xmpp-warning', message);
        return;
    }
    const attempt = ++xmppConnectionAttempt;
    currentConnectionDetails = { protocol: 'xmpp', type, port: options.port, host: options.host };
    updateTcpButtonStates('connecting');
    const onData = (body, metadata) => {
        if (metadata) {
            const fields = Object.entries(metadata)
                .filter(([, value]) => value !== '')
                .map(([key, value]) => `${key}=${value}`)
                .join(' ');
            sendMetadataLine(`[metadata] ${fields}`);
        }
        mainWindow.webContents.send('log-data', body);
    };
    const onStatus = (status) => {
        velocityLog('debug', `[XMPP] ${status}`);
        mainWindow.webContents.send('xmpp-status', `XMPP ${status}`);
    };
    const onWarning = (error) => {
        const message = `XMPP ${role} warning: ${error.message}`;
        velocityLog('warn', `[XMPP] ${message}`);
        mainWindow.webContents.send('xmpp-warning', message);
    };
    const onState = (state) => {
        if (attempt !== xmppConnectionAttempt || !xmppTransport) return;
        updateTcpButtonStates(state === 'reconnecting' ? 'connecting' : state);
    };

    let transport;
    try {
        const createTransport = type === 'server' ? createXmppServerTransport : createXmppClientTransport;
        transport = createTransport({ ...options, ip: options.host, onData, onStatus, onWarning, onState });
        xmppTransport = transport;
        const result = await transport.connect();
        if (attempt !== xmppConnectionAttempt || xmppTransport !== transport) {
            await transport.disconnect().catch(() => {});
            return;
        }
        const endpoint = type === 'server'
            ? `${result.address.address}:${result.address.port}`
            : result.address;
        const identity = result.appJid || result.jid || '';
        velocityLog('info', `[XMPP] ${type} ready at ${endpoint}${identity ? ` as ${identity}` : ''}; ${result.tlsInfo}`);
        mainWindow.webContents.send(
            'xmpp-status',
            `XMPP ${type === 'server' ? 'Server listening on' : 'Client connected to'} ${endpoint}${identity ? ` as ${identity}` : ''}\n  ${result.tlsInfo}`,
        );
        if (type === 'server') {
            mainWindow.webContents.send('xmpp-server-settings', {
                receivingJid: result.appJid,
                address: result.address,
            });
        }
        updateTcpButtonStates('connected');
    } catch (error) {
        if (attempt !== xmppConnectionAttempt) return;
        const message = `XMPP ${role} error: ${error.message}`;
        velocityLog('error', `[XMPP] ${message}`);
        mainWindow.webContents.send('xmpp-error', message);
        if (xmppTransport === transport) {
            await transport.disconnect().catch(() => {});
            xmppTransport = null;
        }
        currentConnectionDetails = null;
        updateTcpButtonStates('disconnected');
    }
});

ipcMain.on('disconnect-xmpp', async () => {
    updateTcpButtonStates('disconnecting');
    const transport = xmppTransport;
    xmppConnectionAttempt += 1;
    xmppTransport = null;
    if (transport) {
        await transport.disconnect().catch((error) => velocityLog('warn', `[XMPP] Disconnect failed: ${error.message}`));
        xmppTransport = null;
        currentConnectionDetails = null;
        mainWindow.webContents.send('xmpp-server-settings', null);
        mainWindow.webContents.send('xmpp-status', 'XMPP connection closed');
    } else {
        mainWindow.webContents.send('xmpp-status', 'No XMPP connection to disconnect');
    }
    updateTcpButtonStates('disconnected');
});

ipcMain.handle('xmpp-copy-client-settings', (_event, { includePassword = false } = {}) => {
    if (!xmppTransport ||
        currentConnectionDetails?.type !== 'server' ||
        typeof xmppTransport.getClientSettings !== 'function' ||
        !xmppTransport.isConnected()) {
        return { success: false, error: 'Connect the XMPP server before copying its client settings.' };
    }
    try {
        const settings = xmppTransport.getClientSettings({ includePassword });
        clipboard.writeText(JSON.stringify(settings, null, 2));
        velocityLog('info', `[XMPP] Copied client settings (password ${includePassword ? 'included' : 'withheld'})`);
        return { success: true, settings };
    } catch (error) {
        velocityLog('warn', `[XMPP] Could not copy client settings: ${error.message}`);
        return { success: false, error: error.message };
    }
});

// ─── Velocity Login / Output Picker IPC ──────────────────────────────────────

const userDataPath = app.getPath('userData');
const velocityCredsFile = path.join(userDataPath, 'velocity-credentials.json');

async function showVelocityLoginDialog() {
  if (velocityLoginWindow && !velocityLoginWindow.isDestroyed()) {
    velocityLoginWindow.show();
    velocityLoginWindow.focus();
    return;
  }
  if (!mainWindow) return;

  const currentTheme = await mainWindow.webContents.executeJavaScript('localStorage.getItem("theme");', true);

  const loginDialogSaved = (appConfig.dialogSizes && appConfig.dialogSizes.velocityLogin) || {};

  velocityLoginWindow = new BrowserWindow({
    width: loginDialogSaved.width || 590,
    height: loginDialogSaved.height || 840,
    x: loginDialogSaved.x || undefined,
    y: loginDialogSaved.y || undefined,
    parent: mainWindow,
    modal: process.platform !== 'darwin',
    show: true,
    resizable: true,
    minimizable: false,
    maximizable: false,
    title: 'Sign In to ArcGIS Velocity',
    webPreferences: {
      preload: path.join(__dirname, 'velocity-login-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  velocityLoginWindow.setMenuBarVisibility(false);
  velocityLoginWindow.setMenu(null);
  velocityLoginWindow.loadFile(path.join(__dirname, 'velocity-login.html'));

  velocityLoginWindow.webContents.on('did-finish-load', () => {
    if (currentTheme) {
      velocityLoginWindow.webContents.executeJavaScript(`document.documentElement.setAttribute('data-theme', '${currentTheme}');`);
    }
  });

  const saveLoginDialogBounds = () => {
    if (velocityLoginWindow && !velocityLoginWindow.isDestroyed()) {
      const [width, height] = velocityLoginWindow.getSize();
      const [x, y] = velocityLoginWindow.getPosition();
      if (!appConfig.dialogSizes) appConfig.dialogSizes = {};
      appConfig.dialogSizes.velocityLogin = { width, height, x, y };
      configManager.saveConfig(appConfig);
    }
  };
  velocityLoginWindow.on('resize', saveLoginDialogBounds);
  velocityLoginWindow.on('move', saveLoginDialogBounds);

  // Hide instead of destroy when closed — preserves state for next open
  velocityLoginWindow.on('close', (e) => {
    if (velocityLoginWindow && !velocityLoginWindow.isDestroyed()) {
      e.preventDefault();
      velocityLoginWindow.hide();
    }
  });

  velocityLoginWindow.on('closed', () => { velocityLoginWindow = null; });
}

// Hide the login dialog without destroying it (preserves all state)
ipcMain.on('velocity:hide-login', () => {
  if (velocityLoginWindow && !velocityLoginWindow.isDestroyed()) {
    velocityLoginWindow.hide();
  }
});

ipcMain.on('velocity:open-login', () => { showVelocityLoginDialog(); });

ipcMain.handle('velocity:login', async (event, { portalUrl, username, password }) => {
  velocityLog('info', `[Auth] Sign-in attempt (password) to ${portalUrl} as "${username}"`);
  try {
    velocitySendAuthToken = false;
    const tokenResult = await generateToken(portalUrl, username, password);
    const velocityUrl = await getVelocityApiUrl(portalUrl, tokenResult.token);
    await velocityTokenManager.loginWithPassword(portalUrl, username, password);
    velocityLog('info', `[Auth] Sign-in successful. Velocity URL: ${velocityUrl}`);
    velocityLog('debug', `[Auth] Token: ${tokenResult.token}`);
    return { token: tokenResult.token, expires: tokenResult.expires, velocityUrl };
  } catch (err) {
    velocityLog('error', `[Auth] Sign-in failed: ${err.message}`);
    return { error: err.message };
  }
});

ipcMain.handle('velocity:login-oauth', async (event, { portalUrl, clientId, clientSecret }) => {
  velocityLog('info', `[Auth] OAuth sign-in attempt to ${portalUrl} with client "${clientId}"`);
  try {
    velocitySendAuthToken = false;
    const tokenResult = await generateOAuthToken(portalUrl, clientId, clientSecret);
    const velocityUrl = await getVelocityApiUrl(portalUrl, tokenResult.token);
    await velocityTokenManager.loginWithOAuth(portalUrl, clientId, clientSecret);
    velocityLog('info', `[Auth] OAuth sign-in successful. Velocity URL: ${velocityUrl}`);
    velocityLog('debug', `[Auth] Token: ${tokenResult.token}`);

    return { token: tokenResult.token, expires: tokenResult.expires, velocityUrl };
  } catch (err) {
    velocityLog('error', `[Auth] OAuth sign-in failed: ${err.message}`);
    return { error: err.message };
  }
});

ipcMain.handle('velocity:list-items', async (event, { velocityUrl, token, adminScope }) => {
  velocityLog('info', `[API] Listing outputs from ${velocityUrl} (scope: ${adminScope ? 'org' : 'my'})`);
  try {
    const results = await listOutputs(velocityUrl, token, adminScope);
    velocityLog('info', `[API] Listed ${Array.isArray(results) ? results.length : 0} output(s)`);
    return results;
  } catch (err) {
    velocityLog('error', `[API] List outputs failed: ${err.message}`);
    return { error: err.message };
  }
});

ipcMain.handle('velocity:get-item-details', async (event, { velocityUrl, outputId, token }) => {
  try { return await getOutputDetails(velocityUrl, outputId, token); }
  catch (err) { return { error: err.message }; }
});

ipcMain.handle('velocity:store-credentials', async (event, creds) => {
  try { fs.writeFileSync(velocityCredsFile, JSON.stringify(creds, null, 2)); return { success: true }; }
  catch (err) { return { error: err.message }; }
});

ipcMain.handle('velocity:get-stored-credentials', async () => {
  try {
    if (fs.existsSync(velocityCredsFile)) return JSON.parse(fs.readFileSync(velocityCredsFile, 'utf8'));
    return null;
  } catch (_) { return null; }
});

ipcMain.on('velocity:apply-item', (event, item) => {
  velocitySendAuthToken = shouldSendVelocityTokenByDefault(item);
  hotSwapVelocityAuthToken();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('velocity:output-applied', item);
  }
  sendVelocityTokenState('item-applied');
});

ipcMain.on('velocity:set-token-sending', (event, enabled) => {
  velocitySendAuthToken = !!enabled;
  hotSwapVelocityAuthToken();
  sendVelocityTokenState('user-toggle');
});

velocityTokenManager.on('refreshed', () => {
  hotSwapVelocityAuthToken();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('velocity:token-refreshed', { expires: velocityTokenManager.expires || 0 });
  sendVelocityTokenState('refreshed');
});

velocityTokenManager.on('error', (err) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('velocity:token-error', err.message);
});

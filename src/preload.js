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

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Main process communication
  send: (channel, data) => {
    const validChannels = [
      'save-theme', 'connect-tcp', 'disconnect-tcp', 
      'connect-udp', 'disconnect-udp', 'connect-grpc', 'disconnect-grpc',
      'connect-http', 'disconnect-http',
      'connect-ws', 'disconnect-ws',
      'connect-xmpp', 'disconnect-xmpp',
      'copy-to-clipboard',
      'open-external-link', 'close-about-dialog', 'close-dialog',
      'help-dialog-ready', 'about-dialog-ready', 'cli-dialog-ready', 'show-cli-dialog', 'connection-line-state-changed',
      'show-metadata-state-changed',
      'inspect-element',
      'inspect-element-done',
      'velocity:set-token-sending'
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },

  // Invoke handlers for returning promises
  invoke: (channel, ...args) => {
    const validChannels = [
      'get-current-theme', 'get-system-theme', 
      'save-logs', 'get-app-version', 'get-cli-help-reference',
      'xmpp-copy-client-settings'
    ];
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
  },
  
  // Listeners for events from the main process
  on: (channel, callback) => {
    const validChannels = [
      'load-saved-theme', 'system-theme-changed', 'load-saved-font',
      'font-size-changed', 'font-family-changed', 'log-data',
      'tcp-status', 'udp-status', 'tcp-error', 'udp-error',
      'grpc-status', 'grpc-error',
      'http-status', 'http-error',
      'ws-status', 'ws-error',
      'xmpp-status', 'xmpp-error', 'xmpp-warning', 'xmpp-server-settings',
      'udp-set-connect-enabled', 'udp-set-disconnect-enabled',
      'udp-set-inputs-enabled', 'udp-connection-state',
      'tcp-set-connect-enabled', 'tcp-set-disconnect-enabled',
      'tcp-connection-state', 'load-config-data', 'load-launch-config-data', 'load-error-data',
      'trigger-save-logs', // Existing for save logs
      'trigger-clear-logs', // Added for clear logs functionality
      'toggle-connection-line-menu',
      'toggle-show-metadata-menu',
      'log-metadata',
      'cli-presets',
      'enter-inspect-mode',
      'cancel-inspect-mode',
      'velocity:output-applied',
      'velocity:token-refreshed',
      'velocity:token-error',
      'velocity:token-state'
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  },
  // --- Velocity Login / Output Picker ---
  openVelocityLogin: () => ipcRenderer.send('velocity:open-login'),
});

/**
 * Protocol Settings window bridge.
 *
 * Protocol Settings runs in its own resizable window, but the main renderer
 * stays the sole owner of every connection field. This namespace carries only
 * the state that window mirrors and the intent it reports back, so no form
 * rule or transport decision is ever duplicated.
 *
 * This block is identical in the ArcGIS Velocity Simulator and the ArcGIS
 * Velocity Logger.
 */
contextBridge.exposeInMainWorld('protocolSettingsHost', {
  open: (options) => ipcRenderer.send('protocol-settings:open', {
    title: options && typeof options.title === 'string' ? options.title.slice(0, 240) : '',
  }), // Opens or focuses the Protocol Settings window
  close: () => ipcRenderer.send('protocol-settings:close'), // Closes the Protocol Settings window
  sync: (payload) => {
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      ipcRenderer.send('protocol-settings:sync', payload);
    }
  }, // Mirrors the authoritative settings state
  command: (payload) => {
    if (payload && payload.type === 'focus' && typeof payload.path === 'string') {
      ipcRenderer.send('protocol-settings:command', { type: 'focus', path: payload.path.slice(0, 512) });
    }
  }, // Moves focus inside the mirrored window
  onReady: (callback) => {
    if (typeof callback === 'function') ipcRenderer.on('protocol-settings:ready', () => callback());
  }, // The mirror is mounted
  onClosed: (callback) => {
    if (typeof callback === 'function') ipcRenderer.on('protocol-settings:closed', () => callback());
  }, // The window was closed
  onEvent: (callback) => {
    if (typeof callback === 'function') {
      ipcRenderer.on('protocol-settings:event', (_event, message) => callback(message));
    }
  }, // One user intent from the window
});
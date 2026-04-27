const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Main process communication
  send: (channel, data) => {
    const validChannels = [
      'save-theme', 'connect-tcp', 'disconnect-tcp', 
      'connect-udp', 'disconnect-udp', 'connect-grpc', 'disconnect-grpc',
      'copy-to-clipboard',
      'open-external-link', 'close-about-dialog', 'close-dialog',
      'help-dialog-ready', 'about-dialog-ready', 'cli-dialog-ready', 'show-cli-dialog', 'connection-line-state-changed',
      'show-metadata-state-changed'
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },

  // Invoke handlers for returning promises
  invoke: (channel, ...args) => {
    const validChannels = [
      'get-current-theme', 'get-system-theme', 
      'save-logs', 'get-app-version', 'get-cli-help-reference'
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
      'udp-set-connect-enabled', 'udp-set-disconnect-enabled',
      'udp-set-inputs-enabled', 'udp-connection-state',
      'tcp-set-connect-enabled', 'tcp-set-disconnect-enabled',
      'tcp-connection-state', 'load-config-data', 'load-launch-config-data', 'load-error-data',
      'trigger-save-logs', // Existing for save logs
      'trigger-clear-logs', // Added for clear logs functionality
      'toggle-connection-line-menu',
      'toggle-show-metadata-menu',
      'log-metadata',
      'cli-presets'
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  }
});
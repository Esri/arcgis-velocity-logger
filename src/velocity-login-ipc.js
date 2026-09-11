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

const fs = require('fs');
const { readVelocityPreferences, updateVelocityPreferences } = require('./velocity-preferences');

function registerVelocityLoginIpc({
  ipcMain, session, outputs, credentialsFile, getLoginWindow,
  onLoginStart, onLoginEnd, onApplied, onState, log,
}) {
  const handle = (channel, operation) => {
    ipcMain.handle(channel, async (event, input = {}) => {
      if (event.sender !== getLoginWindow()?.webContents) {
        log('warn', `[Auth] Rejected ${channel} from an unknown window.`);
        return { error: 'This request must come from the Velocity sign-in window.' };
      }
      log('debug', `[API] ${channel} started.`);
      try {
        const result = await operation(input);
        log('debug', `[API] ${channel} completed.`);
        return result;
      } catch (error) {
        log('error', `[API] ${channel} failed: ${error.message}`);
        return { error: error.message };
      }
    });
  };
  const login = async (input, authMode) => {
    onLoginStart();
    try {
      const result = await session.login({ ...input, authMode });
      onState();
      return result;
    } finally {
      onLoginEnd();
    }
  };
  handle('velocity:login', (input) => login(input, 'password'));
  handle('velocity:login-oauth', (input) => login(input, 'oauth'));
  handle('velocity:get-session-state', () => session.state);
  handle('velocity:select-server', (input) => session.selectServer(input.serverId));
  handle('velocity:detect-endpoint', async () => {
    const result = await session.detect();
    onState();
    return result;
  });
  handle('velocity:apply-endpoint', async (input) => {
    const state = session.state;
    if (state.servers.length > 1 && (input.serverId || state.selectedServerId) === 'all') {
      throw new Error('Select one Velocity server before applying a public API URL.');
    }
    const result = await session.setEndpoint(input);
    onState();
    return result;
  });
  handle('velocity:list-items', (input) => outputs.list(input));
  handle('velocity:get-item-details', (input) => outputs.details(input));
  handle('velocity:apply-item', async (input) => {
    const item = await outputs.apply(input);
    onApplied(item);
    return { success: true };
  });
  const readPreferences = () => {
    if (!fs.existsSync(credentialsFile)) return null;
    return readVelocityPreferences(JSON.parse(fs.readFileSync(credentialsFile, 'utf8')));
  };
  handle('velocity:get-stored-credentials', readPreferences);
  handle('velocity:store-credentials', (input) => {
    const preferences = updateVelocityPreferences(input?.rememberMe === true ? readPreferences() : null, input);
    if (preferences) {
      fs.writeFileSync(credentialsFile, JSON.stringify(preferences, null, 2));
    } else if (fs.existsSync(credentialsFile)) {
      fs.unlinkSync(credentialsFile);
    }
    return { success: true };
  });
}

module.exports = { registerVelocityLoginIpc };

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

/**
 * ArcGIS Velocity Logger - About Dialog JavaScript
 * Handles theme application, version display, and dialog interactions
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Apply theme from URL query parameter
  const params = new URLSearchParams(window.location.search);
  const theme = params.get('theme') || 'theme-dark';
  if (window.themeLoader) {
    window.themeLoader.loadTheme(theme);
  } else {
    // Fallback to old method if theme loader is not available
    document.body.className = theme;
  }

  // 2. Get and display the app version
  window.electronAPI.invoke('get-app-version').then(version => {
    if (version) {
      document.getElementById('about-version').textContent = `Version ${version}`;
    }
  }).catch(error => {
    console.error('Failed to get app version:', error);
    document.getElementById('about-version').textContent = 'Version 1.0.0';
  });

  // 3. Signal that the dialog is ready to be shown
  window.electronAPI.send('about-dialog-ready');

  // 4. Set up close functionality
  const closeButton = document.getElementById('about-close');
  if (closeButton) {
    closeButton.addEventListener('click', () => {
      window.electronAPI.send('close-dialog');
    });
  }

  // 5. Set up keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (document.hasFocus() && e.key === 'Escape') {
      window.electronAPI.send('close-dialog');
    }
  });
});

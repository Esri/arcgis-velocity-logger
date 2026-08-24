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
  const params = new URLSearchParams(window.location.search);
  if (window.themeLoader) {
    window.themeLoader.initializeThemeWindow({
      theme: params.get('theme'),
      themeHref: params.get('themeHref'),
      api: window.electronAPI,
    });
  } else {
    const theme = params.get('theme') || 'dark';
    document.body.className = `theme-${theme}`;
    document.body.dataset.theme = theme;
  }

  window.electronAPI.invoke('get-app-version').then(version => {
    if (version) {
      document.getElementById('about-version').textContent = `Version ${version}`;
    }
  }).catch(error => {
    console.error('Failed to get app version:', error);
    document.getElementById('about-version').textContent = 'Version 1.0.0';
  });

  window.electronAPI.send('about-dialog-ready');

  const closeButton = document.getElementById('about-close');
  if (closeButton) {
    closeButton.addEventListener('click', () => {
      window.electronAPI.send('close-dialog');
    });
  }

  document.addEventListener('keydown', (e) => {
    if (document.hasFocus() && e.key === 'Escape') {
      window.electronAPI.send('close-dialog');
    }
  });
});

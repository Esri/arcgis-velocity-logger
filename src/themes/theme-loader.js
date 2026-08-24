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
 * Theme Loader Utility
 * Dynamically loads theme CSS files based on the selected theme
 */

class ThemeLoader {
    constructor() {
        this.loadedThemes = new Set();
        this.currentTheme = null;
        this.currentThemeHref = '';
        this.themeLinkElement = null;
        this.themeClasses = this.getAvailableThemes().map((themeName) => `theme-${themeName}`);
    }

    /**
     * Normalize a theme name to the bare theme id.
     * @param {string} themeName
     * @returns {string}
     */
    normalizeThemeName(themeName) {
        if (typeof themeName !== 'string') return '';
        const trimmed = themeName.trim();
        if (!trimmed) return '';
        const normalized = trimmed.replace(/^theme-/, '');
        return this.getAvailableThemes().includes(normalized) ? normalized : '';
    }

    /**
     * Apply the matching theme class and data attribute without removing
     * non-theme classes already on the body.
     * @param {string} themeName
     */
    applyThemeClass(themeName) {
        if (!document.body) return;
        this.themeClasses.forEach((className) => document.body.classList.remove(className));
        document.body.classList.add(`theme-${themeName}`);
        document.body.dataset.theme = themeName;
    }

    /**
     * Normalize a theme stylesheet href.
     * @param {string} themeHref
     * @param {string} themeName
     * @returns {string}
     */
    normalizeThemeHref(themeHref, themeName) {
        const fallbackHref = `./themes/theme-${themeName}.css`;
        if (typeof themeHref === 'string' && themeHref.trim()) {
            const trimmed = themeHref.trim();
            const match = trimmed.match(/^(?:\.\/)?themes\/theme-([a-z-]+)\.css$/);
            if (match && match[1] === themeName && this.getAvailableThemes().includes(match[1])) {
                return trimmed;
            }
        }
        return fallbackHref;
    }

    /**
     * Load a theme by name
     * @param {string} themeName - The name of the theme to load (without 'theme-' prefix)
     */
    loadTheme(themeName, themeHref) {
        const cleanThemeName = this.normalizeThemeName(themeName) || 'dark';
        const cleanThemeHref = this.normalizeThemeHref(themeHref, cleanThemeName);
        
        // Refresh the body class and theme metadata even when the stylesheet
        // is already current. This keeps the current theme available to the
        // main process and preserves the selected theme when other classes are
        // already present on the body.
        if (this.currentTheme === cleanThemeName && this.currentThemeHref === cleanThemeHref) {
            this.applyThemeClass(cleanThemeName);
            return cleanThemeName;
        }

        // Remove previous theme link if it exists
        this.removeCurrentTheme();

        // Create new link element for the theme
        const linkElement = document.createElement('link');
        linkElement.rel = 'stylesheet';
        linkElement.type = 'text/css';
        linkElement.href = cleanThemeHref;
        linkElement.id = 'current-theme-stylesheet';

        // Add to head
        document.head.appendChild(linkElement);
        this.themeLinkElement = linkElement;
        this.currentTheme = cleanThemeName;
        this.currentThemeHref = cleanThemeHref;
        this.loadedThemes.add(cleanThemeName);
        this.applyThemeClass(cleanThemeName);
        return cleanThemeName;
    }

    /**
     * Remove the currently loaded theme
     */
    removeCurrentTheme() {
        if (this.themeLinkElement) {
            this.themeLinkElement.remove();
            this.themeLinkElement = null;
        }
        this.currentTheme = null;
        this.currentThemeHref = '';
    }

    /**
     * Get the currently loaded theme name
     * @returns {string|null} The current theme name or null if no theme is loaded
     */
    getCurrentTheme() {
        return this.currentTheme || this.normalizeThemeName(document.body && document.body.dataset
            ? document.body.dataset.theme
            : '');
    }

    /**
     * Check if a theme is loaded
     * @param {string} themeName - The theme name to check
     * @returns {boolean} True if the theme is loaded
     */
    isThemeLoaded(themeName) {
        return this.loadedThemes.has(this.normalizeThemeName(themeName));
    }

    /**
     * Get list of available themes
     * @returns {string[]} Array of available theme names
     */
    getAvailableThemes() {
        return [
            'light',
            'dark', 
            'dark-gray',
            'light-gray',
            'blue',
            'green',
            'high-contrast',
            'color-blind',
            'system',
            'midnight',
            'sunset',
            'rose',
            'rose-dark',
            'ocean',
            'mocha'
        ];
    }

    /**
     * Load the initial theme and subscribe to live theme updates.
     * @param {object} options
     * @param {string} [options.theme]
     * @param {object} [options.api]
     * @param {string[]} [options.channels]
     * @returns {function} cleanup function
     */
    initializeThemeWindow(options = {}) {
        const {
            theme,
            themeHref,
            api = window.electronAPI,
            channels = ['load-saved-theme'],
        } = options;
        const initialTheme = this.normalizeThemeName(theme) || this.getCurrentTheme() || 'dark';
        this.loadTheme(initialTheme, themeHref);

        if (!api || typeof api.on !== 'function') {
            return () => {};
        }

        const handlers = [];
        channels.forEach((channel) => {
            const handler = (nextTheme) => {
                if (typeof nextTheme !== 'string' || !nextTheme.trim()) return;
                this.loadTheme(nextTheme);
            };
            api.on(channel, handler);
            handlers.push(() => {
                if (typeof api.removeListener === 'function') {
                    api.removeListener(channel, handler);
                }
            });
        });

        return () => {
            handlers.forEach((cleanup) => cleanup());
        };
    }
}

// Create global instance
window.themeLoader = new ThemeLoader();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ThemeLoader;
} 
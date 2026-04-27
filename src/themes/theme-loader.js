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
        this.themeLinkElement = null;
    }

    /**
     * Load a theme by name
     * @param {string} themeName - The name of the theme to load (without 'theme-' prefix)
     */
    loadTheme(themeName) {
        // Remove 'theme-' prefix if present
        const cleanThemeName = themeName.replace('theme-', '');
        
        // Don't reload if it's already the current theme
        if (this.currentTheme === cleanThemeName) {
            return;
        }

        // Remove previous theme link if it exists
        this.removeCurrentTheme();

        // Create new link element for the theme
        const linkElement = document.createElement('link');
        linkElement.rel = 'stylesheet';
        linkElement.type = 'text/css';
        linkElement.href = `./themes/theme-${cleanThemeName}.css`;
        linkElement.id = 'current-theme-stylesheet';

        // Add to head
        document.head.appendChild(linkElement);
        this.themeLinkElement = linkElement;
        this.currentTheme = cleanThemeName;
        this.loadedThemes.add(cleanThemeName);

        // Apply theme class to body
        document.body.className = `theme-${cleanThemeName}`;
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
    }

    /**
     * Get the currently loaded theme name
     * @returns {string|null} The current theme name or null if no theme is loaded
     */
    getCurrentTheme() {
        return this.currentTheme;
    }

    /**
     * Check if a theme is loaded
     * @param {string} themeName - The theme name to check
     * @returns {boolean} True if the theme is loaded
     */
    isThemeLoaded(themeName) {
        return this.loadedThemes.has(themeName.replace('theme-', ''));
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
}

// Create global instance
window.themeLoader = new ThemeLoader();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ThemeLoader;
} 
# Theme System Architecture

This directory contains the refactored theme system for the ArcGIS Velocity Logger application.

## Overview

The theme system has been refactored from a single monolithic `themes.css` file into individual theme files for better maintainability, performance, and modularity.

All theme files follow the `theme-*.css` naming convention (e.g., `theme-blue.css`).

## File Structure

```
src/themes/
├── README.md                 # This documentation file
├── theme-loader.js           # Dynamic theme loading utility (loads theme-*.css)
├── theme-light.css           # Light theme
├── theme-dark.css            # Dark theme (default)
├── theme-dark-gray.css       # Dark gray theme
├── theme-light-gray.css      # Light gray theme
├── theme-blue.css            # Blue theme
├── theme-green.css           # Green theme
├── theme-high-contrast.css   # High contrast accessibility theme
├── theme-color-blind.css     # Color blind friendly theme
├── theme-system.css          # System theme (adapts to OS preference)
├── theme-midnight.css        # Midnight theme
├── theme-sunset.css          # Sunset theme
├── theme-rose.css            # Rose theme
├── theme-rose-dark.css       # Rose dark theme
├── theme-ocean.css           # Ocean theme
└── theme-mocha.css           # Mocha theme
```

## Theme Loader

The `theme-loader.js` file provides a `ThemeLoader` class that handles dynamic loading of theme CSS files. It includes:

- **Dynamic CSS Loading**: Loads theme files on-demand
- **Memory Management**: Removes previous theme stylesheets when switching
- **Fallback Support**: Graceful degradation if the loader fails
- **Theme Tracking**: Keeps track of loaded themes and current theme

### Usage

```javascript
// Load a theme
window.themeLoader.loadTheme('dark');

// Get current theme
const currentTheme = window.themeLoader.getCurrentTheme();

// Check if a theme is loaded
const isLoaded = window.themeLoader.isThemeLoaded('light');
```

## Theme Files

Each theme file contains CSS custom properties (variables) that define the visual appearance of the application. All themes follow the same structure:

### Required Variables

- **Base Colors**: `--background-color`, `--surface-color`, `--text-color`
- **Button Colors**: `--button-bg`, `--button-text`, `--button-border`
- **Border & Shadow**: `--border-color`, `--shadow-color`
- **Legacy Aliases**: Backward compatibility variables

### Optional Variables

- **Splash Screen**: Gradient colors for the splash screen
- **Status Colors**: Success, danger, warning, info button colors
- **Toggle Colors**: Special colors for toggle buttons

### Title Gradient Variables

To ensure consistent, branded titles (e.g., About dialog header), each theme defines:

- `--title-gradient-start`
- `--title-gradient-mid`
- `--title-gradient-end`

These variables are consumed by components like `about.css` to render a smooth multi‑stop gradient matching the ArcGIS Velocity Simulator across all 15 themes.

## Integration

### HTML Files

All HTML files now include the theme loader script:

```html
<script src="./themes/theme-loader.js"></script>
```

### JavaScript Integration

The renderer process uses the theme loader with fallback support:

```javascript
if (window.themeLoader) {
    window.themeLoader.loadTheme(themeName);
} else {
    // Fallback to old method
    document.body.className = `theme-${themeName}`;
}
```

## Benefits

1. **Performance**: Only loads the active theme CSS
2. **Maintainability**: Each theme is in its own file
3. **Modularity**: Easy to add new themes or modify existing ones
4. **Memory Efficiency**: Removes unused theme stylesheets
5. **Backward Compatibility**: Fallback to old system if needed

## Adding New Themes

1. Create a new CSS file in the `src/themes/` directory
2. Follow the naming convention: `theme-{name}.css` (e.g., `theme-purple.css`)
3. Include all required CSS custom properties
4. Add the theme to the `getAvailableThemes()` method in `theme-loader.js`
5. Update the theme selector in HTML files if needed

## Testing

Use the test file `test/test-theme-loader.html` to verify theme loading functionality:

```bash
# Open in a web browser
open test/test-theme-loader.html
```

## Migration Notes

- The old `themes.css` file now contains only minimal fallback styles (no theme duplication). The default fallback is dark.
- All existing theme functionality is preserved
- No changes required to the main process (main.js)
- Backward compatibility is maintained through fallback mechanisms
- Dark theme colors are used as minimal fallback when theme loader fails 
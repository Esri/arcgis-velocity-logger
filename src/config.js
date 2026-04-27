const { app } = require('electron');
const fs = require('fs');
const path = require('path');

/**
 * @type {object} defaultConfig - The default configuration for the application.
 * This is used as a fallback and a template for new configurations.
 */
const defaultConfig = {
  menuBarVisible: false,
  windowState: {
    width: 970,
    height: 410,
    x: 370,
    y: 310,
  },
  theme: 'dark',
  opacity: 1.0,
  font: {
    size: '13px',
    family: 'monospace'
  },
  dialogSizes: {
    appConfig: { width: 650, height: 380, x: null, y: null },
    launchConfig: { width: 500, height: 400, x: null, y: null },
  }
};

/**
 * Manages the application's configuration, handling loading, saving, and defaults.
 */
class ConfigManager {
    /**
   * Initializes the ConfigManager, loading the configuration from disk
   * or creating a default one if it doesn't exist.
   */
  constructor() {
    this.configPath = path.join(app.getPath('userData'), 'config.json');
    this.theConfig = null; // Will be loaded when loadConfig() is called
  }

  /**
   * Loads the configuration from the file system.
   * If the configuration file doesn't exist, it creates one with default values.
   * If the configuration file is corrupt, it falls back to the default configuration.
   * @returns {object} The loaded and validated configuration object.
   */
  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        if (!configData.trim()) {
          console.warn('Configuration file is empty, using defaults.');
          this.theConfig = { ...defaultConfig };
          this.saveConfig(this.theConfig);
          return this.theConfig;
        }

        const config = JSON.parse(configData);
        // Merge with defaults to handle missing properties in older configuration files
        this.theConfig = this.mergeWithDefaults(config);
        console.log(`Configuration initialized from: ${this.configPath}`);
        return this.theConfig;
      } else {
        // Configuration file doesn't exist, so create it with defaults
        console.log(`Configuration file not found. Creating default configuration at: ${this.configPath}`);
        this.theConfig = { ...defaultConfig };
        this.saveConfig(this.theConfig);
        return this.theConfig;
      }
    } catch (error) {
      console.error('Error loading or creating config, falling back to defaults:', error);
      // In case of parsing or other errors, overwrite with defaults to prevent future errors.
      this.theConfig = { ...defaultConfig };
      this.saveConfig(this.theConfig);
      return this.theConfig;
    }
  }

  /**
   * Saves the provided configuration object to the file system.
   * @param {object} config - The configuration object to save.
   */
  saveConfig(config) {
    try {
      // Ensure the directory exists
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
        console.log(`Created config directory: ${configDir}`);
      }
      
      const configData = JSON.stringify(config, null, 2);
      fs.writeFileSync(this.configPath, configData, 'utf8');
      //console.log(`Configuration saved successfully to: ${this.configPath}`);
    } catch (error) {
      console.error(`Error saving config to ${this.configPath}:`, error);
      console.error('Config data that failed to save:', config);
    }
  }

  /**
   * Merges the loaded configuration with the default configuration to ensure
   * all necessary properties are present.
   * @param {object} loadedConfig - The configuration object loaded from disk.
   * @returns {object} The merged configuration object.
   */
  mergeWithDefaults(loadedConfig) {
    //console.log('Merging config - loaded opacity:', loadedConfig.opacity, 'default opacity:', defaultConfig.opacity);
    const merged = { ...defaultConfig };
    if (loadedConfig.windowState) {
      merged.windowState = {
        ...merged.windowState,
        ...loadedConfig.windowState,
      };
    }
    if (loadedConfig.theme) {
      merged.theme = loadedConfig.theme;
    }
    if (loadedConfig.font) {
      merged.font = { ...merged.font, ...loadedConfig.font };
    }
    if (loadedConfig.opacity !== undefined) {
      merged.opacity = loadedConfig.opacity;
    }
    if (loadedConfig.menuBarVisible !== undefined) {
      merged.menuBarVisible = loadedConfig.menuBarVisible;
    }
    if (loadedConfig.dialogSizes) {
      merged.dialogSizes = {
        ...merged.dialogSizes,
        ...loadedConfig.dialogSizes,
        appConfig: { ...merged.dialogSizes.appConfig, ...(loadedConfig.dialogSizes.appConfig || {}) },
        launchConfig: { ...merged.dialogSizes.launchConfig, ...(loadedConfig.dialogSizes.launchConfig || {}) },
      };
    }
    return merged;
  }

  /**
   * Returns the current in-memory configuration.
   * @returns {object} The current configuration object.
   */
  getConfig() {
    return this.theConfig;
  }

  /**
   * Returns the file path of the configuration file.
   * @returns {string} The absolute path to the config.json file.
   */
  getConfigPath() {
    return this.configPath;
  }
}

module.exports = { ConfigManager, defaultConfig };

/**
 * Configuration management utilities
 */

import { errorHandler } from './errorHandler.js';

class ConfigManager {
    constructor() {
        this.config = {};
        this.defaults = {};
        this.validators = new Map();
        this.watchers = new Set();
        this.isInitialized = false;
    }

    /**
     * Initialize configuration with defaults
     * @param {object} defaults - Default configuration values
     */
    init(defaults = {}) {
        this.defaults = { ...defaults };
        this.config = { ...defaults };
        this.isInitialized = true;
    }

    /**
     * Set configuration value
     * @param {string} key - Configuration key
     * @param {any} value - Configuration value
     * @param {boolean} validate - Whether to validate the value
     */
    set(key, value, validate = true) {
        if (validate && this.validators.has(key)) {
            const validator = this.validators.get(key);
            const validationResult = validator(value);
            
            if (validationResult !== true) {
                throw new Error(`Configuration validation failed for ${key}: ${validationResult}`);
            }
        }

        this.config[key] = value;
        this.notifyWatchers(key, value);
    }

    /**
     * Get configuration value
     * @param {string} key - Configuration key
     * @param {any} defaultValue - Default value if key doesn't exist
     * @returns {any} Configuration value
     */
    get(key, defaultValue = undefined) {
        if (key in this.config) {
            return this.config[key];
        }
        
        if (defaultValue !== undefined) {
            return defaultValue;
        }
        
        return this.defaults[key];
    }

    /**
     * Get all configuration
     * @returns {object} All configuration values
     */
    getAll() {
        return { ...this.config };
    }

    /**
     * Check if configuration key exists
     * @param {string} key - Configuration key
     * @returns {boolean} Whether key exists
     */
    has(key) {
        return key in this.config;
    }

    /**
     * Delete configuration key
     * @param {string} key - Configuration key
     */
    delete(key) {
        if (key in this.config) {
            delete this.config[key];
            this.notifyWatchers(key, undefined);
        }
    }

    /**
     * Reset configuration to defaults
     */
    reset() {
        this.config = { ...this.defaults };
        this.notifyWatchers('*', this.config);
    }

    /**
     * Add configuration validator
     * @param {string} key - Configuration key
     * @param {Function} validator - Validation function
     */
    addValidator(key, validator) {
        this.validators.set(key, validator);
    }

    /**
     * Remove configuration validator
     * @param {string} key - Configuration key
     */
    removeValidator(key) {
        this.validators.delete(key);
    }

    /**
     * Add configuration watcher
     * @param {Function} watcher - Watcher function
     */
    addWatcher(watcher) {
        this.watchers.add(watcher);
    }

    /**
     * Remove configuration watcher
     * @param {Function} watcher - Watcher function
     */
    removeWatcher(watcher) {
        this.watchers.delete(watcher);
    }

    /**
     * Notify all watchers of configuration change
     * @param {string} key - Changed key
     * @param {any} value - New value
     */
    notifyWatchers(key, value) {
        this.watchers.forEach(watcher => {
            try {
                watcher(key, value, this.config);
            } catch (error) {
                errorHandler.handleError(error, {
                    context: 'config-watcher',
                    key,
                    value
                });
            }
        });
    }

    /**
     * Validate entire configuration
     * @returns {object} Validation results
     */
    validate() {
        const results = {
            valid: true,
            errors: []
        };

        for (const [key, validator] of this.validators) {
            if (key in this.config) {
                const value = this.config[key];
                const validationResult = validator(value);
                
                if (validationResult !== true) {
                    results.valid = false;
                    results.errors.push({
                        key,
                        value,
                        error: validationResult
                    });
                }
            }
        }

        return results;
    }

    /**
     * Export configuration
     * @returns {object} Exported configuration
     */
    export() {
        return {
            config: { ...this.config },
            defaults: { ...this.defaults },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Import configuration
     * @param {object} data - Configuration data to import
     * @param {boolean} validate - Whether to validate imported configuration
     */
    import(data, validate = true) {
        if (data.config) {
            for (const [key, value] of Object.entries(data.config)) {
                this.set(key, value, validate);
            }
        }
    }
}

// Global configuration manager instance
export const configManager = new ConfigManager();

// Common validators
export const validators = {
    /**
     * Email validator
     */
    email: (value) => {
        if (!value) return 'Email is required';
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(value) ? true : 'Invalid email format';
    },

    /**
     * URL validator
     */
    url: (value) => {
        if (!value) return 'URL is required';
        try {
            new URL(value);
            return true;
        } catch {
            return 'Invalid URL format';
        }
    },

    /**
     * Number range validator
     */
    numberRange: (min, max) => (value) => {
        if (typeof value !== 'number') return 'Value must be a number';
        if (value < min || value > max) return `Value must be between ${min} and ${max}`;
        return true;
    },

    /**
     * String length validator
     */
    stringLength: (min, max) => (value) => {
        if (typeof value !== 'string') return 'Value must be a string';
        if (value.length < min || value.length > max) {
            return `String length must be between ${min} and ${max} characters`;
        }
        return true;
    },

    /**
     * Required field validator
     */
    required: (value) => {
        return value !== null && value !== undefined && value !== '' ? true : 'Field is required';
    },

    /**
     * Boolean validator
     */
    boolean: (value) => {
        return typeof value === 'boolean' ? true : 'Value must be a boolean';
    },

    /**
     * Array validator
     */
    array: (value) => {
        return Array.isArray(value) ? true : 'Value must be an array';
    },

    /**
     * Object validator
     */
    object: (value) => {
        return typeof value === 'object' && value !== null && !Array.isArray(value) 
            ? true : 'Value must be an object';
    }
};

// Configuration presets
export const configPresets = {
    /**
     * Development configuration preset
     */
    development: {
        debug: true,
        logLevel: 'debug',
        apiTimeout: 10000,
        cacheEnabled: false,
        autoRefresh: true
    },

    /**
     * Production configuration preset
     */
    production: {
        debug: false,
        logLevel: 'error',
        apiTimeout: 30000,
        cacheEnabled: true,
        autoRefresh: false
    },

    /**
     * Testing configuration preset
     */
    testing: {
        debug: true,
        logLevel: 'warn',
        apiTimeout: 5000,
        cacheEnabled: false,
        autoRefresh: false
    }
};

/**
 * Initialize configuration with environment-specific defaults
 * @param {string} environment - Environment name
 */
export function initConfig(environment = 'development') {
    const preset = configPresets[environment] || configPresets.development;
    
    configManager.init(preset);
    
    // Add common validators
    configManager.addValidator('email', validators.email);
    configManager.addValidator('apiUrl', validators.url);
    configManager.addValidator('timeout', validators.numberRange(1000, 60000));
    configManager.addValidator('debug', validators.boolean);
    
    return configManager;
}

/**
 * Configuration decorator for classes
 * @param {string} configKey - Configuration key
 * @param {any} defaultValue - Default value
 */
export function configurable(configKey, defaultValue = undefined) {
    return function(target, propertyKey, descriptor) {
        const originalGet = descriptor.get;
        const originalSet = descriptor.set;

        descriptor.get = function() {
            return configManager.get(configKey, defaultValue);
        };

        descriptor.set = function(value) {
            configManager.set(configKey, value);
        };

        return descriptor;
    };
}

export default ConfigManager;
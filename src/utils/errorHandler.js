/**
 * Enhanced error handling utilities
 */

import { performanceMonitor } from './performance.js';

class ErrorHandler {
    constructor() {
        this.errorListeners = new Set();
        this.globalErrorHandler = null;
        this.unhandledRejectionHandler = null;
        this.isInitialized = false;
    }

    /**
     * Initialize global error handling
     */
    init() {
        if (this.isInitialized) return;

        // Global error handler
        this.globalErrorHandler = (event) => {
            this.handleError(event.error || event, {
                type: 'global',
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno
            });
        };

        // Unhandled promise rejection handler
        this.unhandledRejectionHandler = (event) => {
            this.handleError(event.reason, {
                type: 'unhandledRejection',
                promise: event.promise
            });
        };

        // Add global listeners
        window.addEventListener('error', this.globalErrorHandler);
        window.addEventListener('unhandledrejection', this.unhandledRejectionHandler);

        this.isInitialized = true;
    }

    /**
     * Clean up error handlers
     */
    destroy() {
        if (!this.isInitialized) return;

        if (this.globalErrorHandler) {
            window.removeEventListener('error', this.globalErrorHandler);
        }
        if (this.unhandledRejectionHandler) {
            window.removeEventListener('unhandledrejection', this.unhandledRejectionHandler);
        }

        this.errorListeners.clear();
        this.isInitialized = false;
    }

    /**
     * Handle an error with context
     * @param {Error} error - Error object
     * @param {object} context - Additional context
     */
    handleError(error, context = {}) {
        // Record error in performance monitor
        performanceMonitor.recordError(error, context);

        // Create enhanced error object
        const enhancedError = {
            message: error.message,
            stack: error.stack,
            name: error.name,
            timestamp: new Date(),
            context: {
                ...context,
                userAgent: navigator.userAgent,
                url: window.location.href,
                referrer: document.referrer
            }
        };

        // Notify all listeners
        this.errorListeners.forEach(listener => {
            try {
                listener(enhancedError);
            } catch (listenerError) {
                console.error('Error in error listener:', listenerError);
            }
        });

        // Log to console in development
        if (process.env.NODE_ENV === 'development') {
            console.error('Error handled:', enhancedError);
        }
    }

    /**
     * Add error listener
     * @param {Function} listener - Error listener function
     */
    addErrorListener(listener) {
        this.errorListeners.add(listener);
    }

    /**
     * Remove error listener
     * @param {Function} listener - Error listener function
     */
    removeErrorListener(listener) {
        this.errorListeners.delete(listener);
    }

    /**
     * Create a safe async function wrapper
     * @param {Function} fn - Function to wrap
     * @param {string} name - Function name for error context
     * @returns {Function} Safe wrapped function
     */
    safeAsync(fn, name = 'anonymous') {
        return async function(...args) {
            try {
                return await fn.apply(this, args);
            } catch (error) {
                this.handleError(error, {
                    function: name,
                    args: args.map(arg => this.sanitizeArg(arg))
                });
                throw error;
            }
        }.bind(this);
    }

    /**
     * Create a safe sync function wrapper
     * @param {Function} fn - Function to wrap
     * @param {string} name - Function name for error context
     * @returns {Function} Safe wrapped function
     */
    safeSync(fn, name = 'anonymous') {
        return function(...args) {
            try {
                return fn.apply(this, args);
            } catch (error) {
                this.handleError(error, {
                    function: name,
                    args: args.map(arg => this.sanitizeArg(arg))
                });
                throw error;
            }
        }.bind(this);
    }

    /**
     * Sanitize arguments for error logging (remove sensitive data)
     * @param {any} arg - Argument to sanitize
     * @returns {any} Sanitized argument
     */
    sanitizeArg(arg) {
        if (arg === null || arg === undefined) {
            return arg;
        }

        if (typeof arg === 'object') {
            // Don't log large objects
            if (JSON.stringify(arg).length > 1000) {
                return '[Large Object]';
            }

            // Remove sensitive fields
            const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth'];
            const sanitized = { ...arg };
            
            sensitiveFields.forEach(field => {
                if (sanitized[field]) {
                    sanitized[field] = '[REDACTED]';
                }
            });

            return sanitized;
        }

        return arg;
    }

    /**
     * Retry function with exponential backoff
     * @param {Function} fn - Function to retry
     * @param {object} options - Retry options
     * @returns {Promise} Promise that resolves with function result
     */
    async retry(fn, options = {}) {
        const {
            maxRetries = 3,
            baseDelay = 1000,
            maxDelay = 10000,
            backoffMultiplier = 2,
            retryCondition = () => true
        } = options;

        let lastError;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;

                if (attempt === maxRetries || !retryCondition(error)) {
                    break;
                }

                const delay = Math.min(
                    baseDelay * Math.pow(backoffMultiplier, attempt),
                    maxDelay
                );

                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        throw lastError;
    }

    /**
     * Create a timeout wrapper for promises
     * @param {Promise} promise - Promise to wrap
     * @param {number} timeout - Timeout in milliseconds
     * @param {string} message - Timeout error message
     * @returns {Promise} Promise with timeout
     */
    withTimeout(promise, timeout, message = 'Operation timed out') {
        return Promise.race([
            promise,
            new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new Error(message));
                }, timeout);
            })
        ]);
    }

    /**
     * Get error statistics
     * @returns {object} Error statistics
     */
    getErrorStats() {
        const errors = performanceMonitor.getRecentErrors();
        const errorTypes = {};
        const errorCounts = {};

        errors.forEach(error => {
            const type = error.message.split(':')[0];
            errorTypes[type] = (errorTypes[type] || 0) + 1;
            errorCounts[error.message] = (errorCounts[error.message] || 0) + 1;
        });

        return {
            total: errors.length,
            types: errorTypes,
            counts: errorCounts,
            recent: errors.slice(-10)
        };
    }
}

// Global error handler instance
export const errorHandler = new ErrorHandler();

/**
 * Error boundary for Vue components
 */
export function createErrorBoundary() {
    return {
        data() {
            return {
                hasError: false,
                error: null
            };
        },
        errorCaptured(error, instance, info) {
            this.hasError = true;
            this.error = error;
            
            errorHandler.handleError(error, {
                component: instance.$options.name || 'Unknown',
                info,
                type: 'vue-error'
            });

            return false; // Prevent error from propagating
        },
        render() {
            if (this.hasError) {
                return this.$slots.error ? 
                    this.$slots.error({ error: this.error }) :
                    h('div', { class: 'error-boundary' }, [
                        h('h3', 'Something went wrong'),
                        h('p', this.error?.message || 'An error occurred'),
                        h('button', {
                            onClick: () => {
                                this.hasError = false;
                                this.error = null;
                            }
                        }, 'Try again')
                    ]);
            }
            return this.$slots.default();
        }
    };
}

/**
 * Decorator for error handling
 * @param {string} name - Error context name
 * @returns {Function} Decorator function
 */
export function withErrorHandling(name) {
    return function(target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;

        descriptor.value = async function(...args) {
            try {
                return await originalMethod.apply(this, args);
            } catch (error) {
                errorHandler.handleError(error, {
                    method: name,
                    args: args.map(arg => errorHandler.sanitizeArg(arg))
                });
                throw error;
            }
        };

        return descriptor;
    };
}

export default ErrorHandler;
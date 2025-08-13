/**
 * Performance monitoring and debugging utilities
 */

class PerformanceMonitor {
    constructor() {
        this.metrics = new Map();
        this.timers = new Map();
        this.errors = [];
        this.maxErrors = 100;
    }

    /**
     * Start a performance timer
     * @param {string} name - Timer name
     * @returns {string} Timer ID
     */
    startTimer(name) {
        const id = `${name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.timers.set(id, {
            name,
            startTime: performance.now(),
            startDate: new Date()
        });
        return id;
    }

    /**
     * End a performance timer and record the duration
     * @param {string} timerId - Timer ID returned from startTimer
     * @returns {number} Duration in milliseconds
     */
    endTimer(timerId) {
        const timer = this.timers.get(timerId);
        if (!timer) {
            console.warn(`Timer ${timerId} not found`);
            return 0;
        }

        const duration = performance.now() - timer.startTime;
        const metric = {
            name: timer.name,
            duration,
            startDate: timer.startDate,
            endDate: new Date()
        };

        // Store metric
        if (!this.metrics.has(timer.name)) {
            this.metrics.set(timer.name, []);
        }
        this.metrics.get(timer.name).push(metric);

        // Keep only last 50 metrics per timer
        const metrics = this.metrics.get(timer.name);
        if (metrics.length > 50) {
            this.metrics.set(timer.name, metrics.slice(-50));
        }

        this.timers.delete(timerId);
        return duration;
    }

    /**
     * Get performance statistics for a specific metric
     * @param {string} name - Metric name
     * @returns {object} Statistics object
     */
    getStats(name) {
        const metrics = this.metrics.get(name) || [];
        if (metrics.length === 0) {
            return {
                count: 0,
                avg: 0,
                min: 0,
                max: 0,
                total: 0
            };
        }

        const durations = metrics.map(m => m.duration);
        const total = durations.reduce((sum, d) => sum + d, 0);
        const avg = total / durations.length;
        const min = Math.min(...durations);
        const max = Math.max(...durations);

        return {
            count: metrics.length,
            avg: Math.round(avg * 100) / 100,
            min: Math.round(min * 100) / 100,
            max: Math.round(max * 100) / 100,
            total: Math.round(total * 100) / 100
        };
    }

    /**
     * Get all performance statistics
     * @returns {object} All statistics
     */
    getAllStats() {
        const stats = {};
        for (const [name] of this.metrics) {
            stats[name] = this.getStats(name);
        }
        return stats;
    }

    /**
     * Record an error with context
     * @param {Error} error - Error object
     * @param {object} context - Additional context
     */
    recordError(error, context = {}) {
        const errorRecord = {
            message: error.message,
            stack: error.stack,
            timestamp: new Date(),
            context
        };

        this.errors.push(errorRecord);

        // Keep only last maxErrors
        if (this.errors.length > this.maxErrors) {
            this.errors = this.errors.slice(-this.maxErrors);
        }
    }

    /**
     * Get recent errors
     * @param {number} count - Number of errors to return
     * @returns {Array} Array of error records
     */
    getRecentErrors(count = 10) {
        return this.errors.slice(-count);
    }

    /**
     * Clear all performance data
     */
    clear() {
        this.metrics.clear();
        this.timers.clear();
        this.errors = [];
    }

    /**
     * Export performance data for debugging
     * @returns {object} Performance data
     */
    export() {
        return {
            metrics: Object.fromEntries(this.metrics),
            stats: this.getAllStats(),
            errors: this.errors,
            timestamp: new Date()
        };
    }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor();

/**
 * Performance decorator for functions
 * @param {string} name - Performance metric name
 * @returns {Function} Decorated function
 */
export function measurePerformance(name) {
    return function(target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;

        descriptor.value = async function(...args) {
            const timerId = performanceMonitor.startTimer(name);
            try {
                const result = await originalMethod.apply(this, args);
                performanceMonitor.endTimer(timerId);
                return result;
            } catch (error) {
                performanceMonitor.endTimer(timerId);
                performanceMonitor.recordError(error, { method: name, args });
                throw error;
            }
        };

        return descriptor;
    };
}

/**
 * Performance wrapper for async functions
 * @param {string} name - Performance metric name
 * @param {Function} fn - Function to wrap
 * @returns {Function} Wrapped function
 */
export function withPerformance(name, fn) {
    return async function(...args) {
        const timerId = performanceMonitor.startTimer(name);
        try {
            const result = await fn.apply(this, args);
            performanceMonitor.endTimer(timerId);
            return result;
        } catch (error) {
            performanceMonitor.endTimer(timerId);
            performanceMonitor.recordError(error, { function: name, args });
            throw error;
        }
    };
}

/**
 * Debounce function for performance optimization
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Throttle function for performance optimization
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function} Throttled function
 */
export function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * Memory usage monitoring
 * @returns {object} Memory usage information
 */
export function getMemoryUsage() {
    if (typeof performance !== 'undefined' && performance.memory) {
        return {
            used: performance.memory.usedJSHeapSize,
            total: performance.memory.totalJSHeapSize,
            limit: performance.memory.jsHeapSizeLimit
        };
    }
    return null;
}

/**
 * Network performance monitoring
 * @param {string} url - URL to test
 * @returns {Promise<object>} Network performance data
 */
export async function measureNetworkPerformance(url) {
    const timerId = performanceMonitor.startTimer(`network_${url}`);
    
    try {
        const startTime = performance.now();
        const response = await fetch(url, { method: 'HEAD' });
        const endTime = performance.now();
        
        const duration = performanceMonitor.endTimer(timerId);
        
        return {
            url,
            duration,
            status: response.status,
            headers: Object.fromEntries(response.headers.entries())
        };
    } catch (error) {
        performanceMonitor.endTimer(timerId);
        performanceMonitor.recordError(error, { url, type: 'network' });
        throw error;
    }
}

export default PerformanceMonitor;
/**
 * @file src/renderer/src/api/cursor_api.js
 * @description Cursor related API encapsulation
 */

// Request cache for better performance
const requestCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Retry configuration
const RETRY_CONFIG = {
    maxRetries: 3,
    retryDelay: 1000,
    backoffMultiplier: 2,
};

/**
 * Enhanced request function with caching, retry logic, and better error handling
 * @param {object} options - axios request configuration object (method, url, data, params, headers, etc.)
 * @param {object} requestOptions - Additional options for request handling
 * @returns {Promise<any>} - Returns API response data
 * @throws {Error} - When API returns error, throws an exception with error information
 */
async function request(options, requestOptions = {}) {
    const {
        useCache = false,
        cacheKey = null,
        retry = true,
        maxRetries = RETRY_CONFIG.maxRetries,
        retryDelay = RETRY_CONFIG.retryDelay,
    } = requestOptions;

    // Check cache first if enabled
    if (useCache && cacheKey) {
        const cached = getCachedResponse(cacheKey);
        if (cached) {
            return cached;
        }
    }

    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            // Call the generic request method exposed in preload.js
            const response = await window.api.request(options);

            if (response.success) {
                const result = response.data;
                
                // Cache successful response if enabled
                if (useCache && cacheKey) {
                    cacheResponse(cacheKey, result);
                }
                
                return result;
            } else {
                // Handle API errors
                const error = new Error(response.error.message || "Unknown error occurred in API request");
                error.data = response.error.data;
                error.status = response.error.status;
                error.code = response.error.code;
                error.isApiError = true;
                
                // Don't retry on certain error types
                if (response.error.status === 401 || response.error.status === 403) {
                    throw error;
                }
                
                throw error;
            }
        } catch (error) {
            lastError = error;
            
            // Don't retry if it's the last attempt or if retry is disabled
            if (attempt === maxRetries || !retry) {
                break;
            }
            
            // Don't retry on certain error types
            if (error.status === 401 || error.status === 403 || error.status === 404) {
                break;
            }
            
            // Wait before retrying with exponential backoff
            const delay = retryDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt);
            await new Promise(resolve => setTimeout(resolve, delay));
            
            console.warn(`Request failed, retrying... (attempt ${attempt + 1}/${maxRetries + 1})`);
        }
    }
    
    // All retries failed
    console.error("API request exception:", lastError);
    throw lastError;
}

/**
 * Cache management functions
 */
function getCachedResponse(key) {
    const cached = requestCache.get(key);
    if (!cached) return null;
    
    const now = Date.now();
    if (now - cached.timestamp > CACHE_DURATION) {
        requestCache.delete(key);
        return null;
    }
    
    return cached.data;
}

function cacheResponse(key, data) {
    requestCache.set(key, {
        data,
        timestamp: Date.now()
    });
}

function clearCache() {
    requestCache.clear();
}

// Reference from cursor_acc_info.py
const NAME_LOWER = "cursor";
const NAME_CAPITALIZE = "Cursor";

const BASE_HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    Accept: "application/json",
    "Content-Type": "application/json",
};

/**
 * Enhanced token validation
 * @param {string} token - Token to validate
 * @returns {boolean} - Whether token is valid
 */
function validateToken(token) {
    if (!token || typeof token !== 'string') {
        return false;
    }
    
    // Basic JWT format validation
    const jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
    return jwtRegex.test(token);
}

/**
 * Get user's Stripe subscription information with enhanced error handling
 * @param {string} token - User authentication token
 * @returns {Promise<any>}
 */
export const getStripeProfile = async (token) => {
    if (!validateToken(token)) {
        throw new Error("Invalid authentication token");
    }
    
    const url = `https://www.cursor.com/api/auth/stripe`;
    const headers = {
        ...BASE_HEADERS,
        Cookie: `Workos${NAME_CAPITALIZE}SessionToken=user_01OOOOOOOOOOOOOOOOOOOOOOOO%3A%3A${token}`,
    };

    const cacheKey = `stripe_profile_${token.substring(0, 20)}`;
    
    return request({
        method: "get",
        url: url,
        headers: headers,
        timeout: 20000,
    }, {
        useCache: true,
        cacheKey,
        retry: true,
        maxRetries: 2,
    });
};

/**
 * Get user usage information with enhanced error handling
 * @param {string} token - User authentication token
 * @returns {Promise<object>}
 */
export const getUsage = async (token) => {
    if (!validateToken(token)) {
        throw new Error("Invalid authentication token");
    }

    const url = `https://www.${NAME_LOWER}.com/api/usage`;
    const headers = {
        ...BASE_HEADERS,
        Cookie: `Workos${NAME_CAPITALIZE}SessionToken=user_01OOOOOOOOOOOOOOOOOOOOOOOO%3A%3A${token}`,
    };

    const cacheKey = `usage_${token.substring(0, 20)}`;

    try {
        const data = await request({
            method: "get",
            url: url,
            headers: headers,
            timeout: 20000,
        }, {
            useCache: true,
            cacheKey,
            retry: true,
            maxRetries: 2,
        });

        console.log("usage data", data);

        // Enhanced data formatting with better error handling
        const gpt4_data = data["gpt-4"] || {};
        const gpt35_data = data["gpt-3.5-turbo"] || {};
        
        const numRequestsTotal = gpt4_data.numRequestsTotal || 0;
        const maxRequestUsage = "maxRequestUsage" in gpt4_data ? gpt4_data.maxRequestUsage : 999;
        const maxRequestUsageBasic = gpt35_data.numRequestsTotal || 0;

        return {
            startOfMonth: data.startOfMonth,
            numRequestsTotal,
            maxRequestUsage,
            maxRequestUsageBasic,
            numRequestsTotalBasic: "No Limit",
            // Additional metadata
            lastUpdated: new Date().toISOString(),
            dataSource: 'cursor_api',
        };
    } catch (error) {
        console.error("Failed to get usage information:", error);
        
        // Return default values on error
        return {
            startOfMonth: new Date().toISOString(),
            numRequestsTotal: 0,
            maxRequestUsage: 999,
            maxRequestUsageBasic: 0,
            numRequestsTotalBasic: "No Limit",
            error: error.message,
            lastUpdated: new Date().toISOString(),
            dataSource: 'cursor_api_error',
        };
    }
};

/**
 * Get Cursor token from current system with enhanced error handling
 * @returns {Promise<string>} Cursor access token
 */
export const getCursorToken = async () => {
    try {
        const cursorInfo = await window.api.getCursorInfo();

        if (cursorInfo && cursorInfo.token && validateToken(cursorInfo.token)) {
            return cursorInfo.token;
        } else {
            throw new Error("Unable to get valid Cursor token");
        }
    } catch (error) {
        console.error("Failed to get Cursor token:", error);
        throw error;
    }
};

/**
 * Get current user's Cursor account information with enhanced error handling
 * @returns {Promise<object>} Account information object
 */
export const getCursorAccountInfo = async () => {
    try {
        const token = await getCursorToken();

        // Parallel requests for better performance
        const [subscriptionInfo, usageInfo] = await Promise.allSettled([
            getStripeProfile(token),
            getUsage(token)
        ]);

        // Handle subscription info
        let subscriptionType = "Free Version";
        let customerEmail = "Unknown";
        let trialDaysRemaining = 0;
        
        if (subscriptionInfo.status === 'fulfilled' && subscriptionInfo.value) {
            const info = subscriptionInfo.value;
            const membership = info.membershipType?.toLowerCase() || "";
            const status = info.subscriptionStatus?.toLowerCase() || "";

            if (status === "active") {
                if (membership === "pro") {
                    subscriptionType = "Professional Version";
                } else if (membership === "free_trial") {
                    subscriptionType = "Free Trial";
                } else if (membership === "pro_trial") {
                    subscriptionType = "Professional Trial";
                } else if (membership === "team") {
                    subscriptionType = "Team Version";
                } else if (membership === "enterprise") {
                    subscriptionType = "Enterprise Version";
                } else if (membership) {
                    subscriptionType = membership;
                }
            } else if (status) {
                subscriptionType = `${membership} (${status})`;
            }
            
            customerEmail = info?.customer?.email || "Unknown";
            trialDaysRemaining = info?.daysRemainingOnTrial || 0;
        }

        // Handle usage info
        const usage = usageInfo.status === 'fulfilled' ? usageInfo.value : {
            numRequestsTotal: 0,
            maxRequestUsage: 999,
            error: usageInfo.reason?.message || "Failed to get usage"
        };

        return {
            email: customerEmail,
            subscriptionType,
            usageInfo: usage,
            trialDaysRemaining,
            lastUpdated: new Date().toISOString(),
            isActive: subscriptionInfo.status === 'fulfilled',
        };
    } catch (error) {
        console.error("Failed to get account information:", error);
        throw error;
    }
};

/**
 * Get API access tokens using Session Token with enhanced error handling
 * @param {string} sessionToken - Session token
 * @returns {Promise<object>} API access token data
 * @throws {Error} Throws exception when acquisition fails
 */
export const getApiTokens = async (sessionToken) => {
    if (!validateToken(sessionToken)) {
        throw new Error("Invalid session token");
    }

    const url = "https://token.cursorpro.com.cn/reftoken";
    const headers = {
        ...BASE_HEADERS,
    };
    
    try {
        const data = await request({
            method: "get",
            url: url,
            params: { token: sessionToken },
            headers: headers,
            timeout: 20000,
        }, {
            retry: true,
            maxRetries: 2,
        });
        
        console.log("cursorpro data", data);

        if (data && data.code === 0) {
            return data.data;
        } else {
            throw new Error(data?.msg || "Failed to get API Token");
        }
    } catch (error) {
        console.error("Failed to get API access token:", error);
        throw error;
    }
};

/**
 * Clear all cached responses
 */
export const clearApiCache = () => {
    clearCache();
};

/**
 * Get cache statistics
 */
export const getCacheStats = () => {
    return {
        size: requestCache.size,
        keys: Array.from(requestCache.keys()),
    };
};

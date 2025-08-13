/**
 * src/renderer/src/api/index.js
 * Renderer process general API module, encapsulates IPC communication with main process.
 * Provides axios-like methods for easy calling in Vue components.
 */

/**
 * General request function, core of all exported methods.
 * @param {object} options - Request configuration object passed to main process axios (method, url, data, params, headers, etc.)
 * @returns {Promise<any>} - Returns the `data` part of API response on success.
 * @throws {Error} - Throws an exception with detailed information when API returns error or communication exception.
 *                   Caller should use try...catch to handle errors.
 */
async function request(options) {
    try {
        // Call the general request method exposed in preload.js
        const response = await window.api.request(options);

        if (response.success) {
            // Request successful, directly return the `data` part, which is the most common usage scenario
            return response.data;
        } else {
            // Request failed in main process (e.g., network error, server returns 4xx/5xx)
            // Construct an Error object with detailed information and throw it
            const error = new Error(response.error.message || "Unknown error occurred in API request");
            error.data = response.error.data; // Attach original error data
            error.status = response.error.status; // Attach HTTP status code
            error.code = response.error.code; // Attach error code (e.g., 'ECONNRESET')
            throw error;
        }
    } catch (error) {
        // Catch and re-throw exceptions that occur inside the request function or IPC communication
        // This ensures that callers can always handle all types of errors through try/catch
        console.error("API request wrapper layer caught exception:", error);
        throw error;
    }
}

/**
 * Send GET request
 * @param {string} url - Request URL
 * @param {object} [params] - URL query parameters
 * @param {object} [config] - Other axios configurations, such as headers, timeout
 * @returns {Promise<any>}
 */
export const get = (url, params, config = {}) => {
    return request({
        method: "get",
        url,
        params,
        ...config,
    });
};

/**
 * Send POST request
 * @param {string} url - Request URL
 * @param {object} [data] - Request body data
 * @param {object} [config] - Other axios configurations, such as headers, timeout
 * @returns {Promise<any>}
 */
export const post = (url, data, config = {}) => {
    return request({
        method: "post",
        url,
        data,
        ...config,
    });
};

/**
 * Send PUT request
 * @param {string} url - Request URL
 * @param {object} [data] - Request body data
 * @param {object} [config] - Other axios configurations
 * @returns {Promise<any>}
 */
export const put = (url, data, config = {}) => {
    return request({
        method: "put",
        url,
        data,
        ...config,
    });
};

/**
 * Send DELETE request
 * @param {string} url - Request URL
 * @param {object} [config] - Other axios configurations
 * @returns {Promise<any>}
 */
export const del = (url, config = {}) => {
    return request({
        method: "delete",
        url,
        ...config,
    });
};

// Can also export a default object containing all methods
export default {
    get,
    post,
    put,
    delete: del, // 'delete' is a reserved keyword
    request, // Also export the original request method for more complex configurations
};

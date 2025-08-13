/**
 * src/main/api.js
 * This file is used to centrally handle all API requests forwarded through IPC calls.
 */
import axios from "axios";

// You can also create a configured axios instance here, e.g. setting baseURL, timeout, headers, etc.
// const apiClient = axios.create({
//   baseURL: 'https://api.example.com',
//   timeout: 5000,
// });

/**
 * Generic API request handler
 * @param {object} options - axios request configuration (method, url, data, params, headers, etc.)
 * @returns {Promise<object>} - Returns data from API or error information
 */
export async function handleApiRequest(options) {
    try {
        // Ensure parameter structure is complete and correct
        const requestConfig = {
            method: options.method || "get",
            url: options.url,
            // Only add to request config if data is provided
            ...(options.data && { data: options.data }),
            // Only add to request config if params is provided
            ...(options.params && { params: options.params }),
            // Only add to request config if headers is provided
            ...(options.headers && { headers: options.headers }),
            // Add other possible axios options
            ...(options.timeout && { timeout: options.timeout }),
            ...(options.responseType && { responseType: options.responseType }),
            ...(options.withCredentials && { withCredentials: options.withCredentials }),
        };

        // Use axios to make the request
        const response = await axios(requestConfig);

        // Return successful response
        return {
            success: true,
            data: response.data,
            status: response.status,
            headers: response.headers,
        };
    } catch (error) {
        console.error(`API request failed: ${error.message}`);

        // Return a standardized error structure
        return {
            success: false,
            error: {
                message: error.message,
                status: error.response?.status,
                data: error.response?.data,
                code: error.code,
            },
        };
    }
}



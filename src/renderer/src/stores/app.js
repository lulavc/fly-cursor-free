import { defineStore } from "pinia";
import { ElMessageBox } from "element-plus";

export const useAppStore = defineStore("app", {
    state: () => ({
        appConfig: {},
        cursorInfo: {},
        systemInfo: {},

        cursorAccountsInfo: {
            email: "",
            password: undefined,
            register_time: undefined,
            registerTimeStamp: undefined,

            system_type: undefined,
            accessToken: undefined,
            refreshToken: undefined,
            WorkosCursorSessionToken: undefined,

            cachedSignUpType: undefined,
            machineId: undefined,
            macMachineId: undefined,
            devDeviceId: undefined,
            sqmId: undefined,
            machineGuid: undefined,

            machineId_ASCII: undefined,

            modelUsageUsed: undefined,
            modelUsageTotal: undefined,
            membershipType: undefined,
            daysRemainingOnTrial: undefined,
        },
        activeEmail: "",
        isAutoLoginFlow: false,

        appLicenseInfo: {
            status: 3, // 0: 正常  1:服务器错误 2: 许可证过期或验证失败 3: 未找到许可证  11: 需要升级APP版本  12: 用户被封禁
            message: "",
            license: null,
            signature: null,
        },

        aboutNotice: [],
        
        // New state properties for better state management
        isLoading: false,
        lastFetchTime: null,
        error: null,
        cache: new Map(),
    }),

    getters: {
        // Computed properties for better data access
        isLoggedIn: (state) => Boolean(state.cursorAccountsInfo.email && state.cursorAccountsInfo.accessToken),
        
        isSubscriptionActive: (state) => {
            const membership = state.cursorAccountsInfo.membershipType;
            return membership && membership !== 'free';
        },
        
        isTrialExpired: (state) => {
            const daysRemaining = state.cursorAccountsInfo.daysRemainingOnTrial;
            return daysRemaining !== undefined && daysRemaining <= 0;
        },
        
        usagePercentage: (state) => {
            const { modelUsageUsed, modelUsageTotal } = state.cursorAccountsInfo;
            if (!modelUsageTotal || modelUsageTotal === 0) return 0;
            return Math.min((modelUsageUsed / modelUsageTotal) * 100, 100);
        },
        
        // Cache management
        getCachedData: (state) => (key) => {
            const cached = state.cache.get(key);
            if (!cached) return null;
            
            // Check if cache is still valid (5 minutes)
            const now = Date.now();
            if (now - cached.timestamp > 5 * 60 * 1000) {
                state.cache.delete(key);
                return null;
            }
            
            return cached.data;
        },
    },

    actions: {
        // Improved error handling and caching
        async fetchAppConfig() {
            try {
                this.isLoading = true;
                this.error = null;
                
                // Check cache first
                const cached = this.getCachedData('appConfig');
                if (cached) {
                    this.appConfig = cached;
                    return;
                }
                
                const config = await window.api.getAppConfig();
                this.appConfig = config || {};
                
                // Cache the result
                this.cache.set('appConfig', {
                    data: this.appConfig,
                    timestamp: Date.now()
                });
                
                console.log("this.appConfig =>", this.appConfig);
            } catch (error) {
                console.error("Failed to fetch app config:", error);
                this.error = error.message;
                throw error;
            } finally {
                this.isLoading = false;
            }
        },

        async fetchCursorInfo() {
            try {
                this.isLoading = true;
                this.error = null;
                
                const cursorInfo = await window.api.getCursorInfo();
                this.cursorInfo = cursorInfo || {};
                console.log("this.cursorInfo =>", this.cursorInfo);

                this.setCursorAccountsInfo({
                    email: this.cursorInfo.cachedEmail,
                    accessToken: this.cursorInfo.accessToken,
                    refreshToken: this.cursorInfo.refreshToken,
                    cachedSignUpType: this.cursorInfo.cachedSignUpType,
                });
                
                this.lastFetchTime = Date.now();
            } catch (error) {
                console.error("Failed to fetch cursor info:", error);
                this.error = error.message;
                throw error;
            } finally {
                this.isLoading = false;
            }
        },
        
        async fetchSystemInfo() {
            try {
                this.isLoading = true;
                this.error = null;
                
                const systemInfo = await window.api.getSystemInfo();
                this.systemInfo = systemInfo || {};
                console.log("this.systemInfo =>", this.systemInfo);
                
                let machineId_ASCII;
                const machineId = this.systemInfo.cursorStorageConfig?.["telemetry.machineId"];
                if (machineId) {
                    machineId_ASCII = machineId
                        .match(/.{1,2}/g)
                        ?.map((hex) => String.fromCharCode(parseInt(hex, 16)))
                        .join("") || "";
                }

                this.setCursorAccountsInfo({
                    machineGuid: this.systemInfo.machineGuid,
                    machineId: this.systemInfo.cursorStorageConfig?.["telemetry.machineId"],
                    macMachineId: this.systemInfo.cursorStorageConfig?.["telemetry.macMachineId"],
                    devDeviceId: this.systemInfo.cursorStorageConfig?.["telemetry.devDeviceId"],
                    sqmId: this.systemInfo.cursorStorageConfig?.["telemetry.sqmId"],
                    machineId_ASCII: machineId_ASCII || "",
                });
            } catch (error) {
                console.error("Failed to fetch system info:", error);
                this.error = error.message;
                throw error;
            } finally {
                this.isLoading = false;
            }
        },

        // Improved license validation with better error handling
        setAppLicenseInfo(licenseInfo) {
            this.appLicenseInfo = licenseInfo;
            
            // Clear any previous errors
            this.error = null;
            
            const status = this.appLicenseInfo.status;
            const message = this.appLicenseInfo.message;
            
            switch (status) {
                case 0:
                    return true;
                case 1:
                    this.showLicenseError("连接服务器失败", "服务器错误", "warning");
                    return false;
                case 2:
                case 3:
                    this.showLicenseError(message || "未获得权限", "权限验证失败", "warning");
                    return false;
                case 11:
                    this.showLicenseError(message || "需要升级APP版本", "升级提示", "warning");
                    return false;
                case 12:
                    this.showLicenseError(message || "用户已被封禁", "封禁提示", "error");
                    return false;
                default:
                    console.warn(`Unknown license status: ${status}`);
                    return false;
            }
        },
        
        // Helper method for showing license errors
        showLicenseError(message, title, type = "warning") {
            ElMessageBox.confirm(message, title, {
                confirmButtonText: "确定",
                showCancelButton: false,
                type: type,
            }).catch(() => {
                // User dismissed the dialog
            });
        },

        async setCursorAccountsInfo(accountsInfo) {
            this.cursorAccountsInfo = { ...this.cursorAccountsInfo, ...accountsInfo };
            
            // Clear cache when account info changes
            this.cache.clear();
        },
        
        setIsAutoLoginFlow(isAutoLogin) {
            this.isAutoLoginFlow = isAutoLogin;
        },
        
        setActiveEmail(email) {
            this.activeEmail = email;
        },
        
        setAboutNotice(aboutNotice) {
            this.aboutNotice = aboutNotice;
        },
        
        // New methods for better state management
        clearError() {
            this.error = null;
        },
        
        clearCache() {
            this.cache.clear();
        },
        
        // Batch operations for better performance
        async refreshAllData() {
            try {
                this.isLoading = true;
                this.error = null;
                
                await Promise.allSettled([
                    this.fetchAppConfig(),
                    this.fetchCursorInfo(),
                    this.fetchSystemInfo()
                ]);
                
                this.lastFetchTime = Date.now();
            } catch (error) {
                console.error("Failed to refresh all data:", error);
                this.error = error.message;
                throw error;
            } finally {
                this.isLoading = false;
            }
        },
    },
});

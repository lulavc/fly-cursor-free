<script setup>
    import { ref, nextTick, provide, computed, watch } from "vue";
    import { onMounted, onUnmounted } from "vue";
    import { storeToRefs } from "pinia";
    import { useAppStore } from "../stores/app.js";
    // eslint-disable-next-line no-unused-vars
    import { getUsage, getStripeProfile, clearApiCache } from "../api/cursor_api.js";
    import AccountManagement from "./AccountManagement.vue";
    import UseAccountConfirmationDialog from "./UseAccountConfirmationDialog.vue";
    import Settings from "./Settings.vue";
    import SettingsDialog from "./SettingsDialog.vue";
    import BackupSettingsDialog from "./BackupSettingsDialog.vue";
    import RestoreBackupDialog from "./RestoreBackupDialog.vue";
    import { Refresh, CircleCheck, WarningFilled, Delete } from "@element-plus/icons-vue";
    import { ElMessage, ElMessageBox } from "element-plus";
    import { jwtDecode } from "jwt-decode";
    
    const SUBSCRIBE_FREE_NAME = "free";
    const SUBSCRIBE_PRO_NAME = "free_trial";

    const appStore = useAppStore();
    const { 
        cursorInfo, 
        appConfig, 
        systemInfo, 
        cursorAccountsInfo, 
        appLicenseInfo, 
        aboutNotice,
        isLoading,
        error,
        lastFetchTime
    } = storeToRefs(appStore);

    // Component state
    const activeName = ref("first");
    const accountManagementRef = ref(null);
    const settingsRef = ref(null);
    const logScrollbarRef = ref(null);
    
    // Loading states
    const isRefreshLoading = ref(false);
    const isInitLoading = ref(false);
    const loadingAutoRegister = ref(false);
    
    // Dialog states
    const useAccountDialogVisible = ref(false);
    const settingsDialogVisible = ref(false);
    const backupSettingsDialogVisible = ref(false);
    const restoreBackupDialogVisible = ref(false);
    
    // Data states
    const accountToUse = ref(null);
    const isAdmin = ref(false);
    const loopCount = ref(1);
    const logs = ref([]);
    const isAutoRegistAndLogin = ref(false);
    
    // Auto-refresh interval
    let refreshIntervalId = null;
    let unsubscribeLog = null;

    // Enhanced logging with better performance
    const addLog = async ({ level = "info", data }) => {
        const message = `[${new Date().toLocaleTimeString()}] ${data}`;
        logs.value.push({ level, message, timestamp: Date.now() });
        
        // Keep only last 400 logs for memory management
        if (logs.value.length > 400) {
            logs.value = logs.value.slice(-400);
        }
        
        await nextTick();
        scrollToBottom();
    };

    // Optimized scroll function
    const scrollToBottom = () => {
        if (logScrollbarRef.value?.wrapRef) {
            const scrollWrapper = logScrollbarRef.value.wrapRef;
            if (scrollWrapper) {
                logScrollbarRef.value.scrollTo({
                    top: scrollWrapper.scrollHeight,
                    behavior: "smooth",
                });
            }
        }
    };

    // Provide addLog to child components
    provide("addLog", addLog);

    // Computed properties with better performance
    const accountInfoShow = computed(() => {
        const info = { ...cursorAccountsInfo.value };
        info.membershipTypeShow = checkMembershipType(info);
        info.accessTokenExpStatus = checkAccessTokenExpireTime(info.accessToken);
        return info;
    });

    const versionText = computed(() => {
        const ver = appConfig.value.version || "";
        return `${ver}`.trim();
    });

    const signatureText = computed(() => appLicenseInfo.value?.signature || "");

    // Enhanced admin rights check
    const checkAdminRights = async () => {
        try {
            isAdmin.value = await window.api.checkAdminRights();
        } catch (error) {
            console.error("Failed to check admin rights:", error);
            isAdmin.value = false;
        }
    };

    // Enhanced initialization
    const initializeApp = async () => {
        isInitLoading.value = true;
        try {
            await Promise.allSettled([
                window.api.getAppLicenseInfo(),
                window.api.initAppConfig(),
                window.api.renderOnMounted(),
                checkAdminRights(),
            ]);
        } catch (error) {
            console.error("Initialization failed", error);
            await addLog({ level: "error", data: `Initialization failed: ${error.message}` });
        } finally {
            isInitLoading.value = false;
        }
        await refresh();
    };

    // Enhanced refresh function with better error handling
    const refresh = async () => {
        if (isRefreshLoading.value) return;
        
        isRefreshLoading.value = true;
        const timeStart = Date.now();
        
        try {
            await window.api.initAppConfig();
            
            // Use the new batch refresh method from store
            await appStore.refreshAllData();
            
            if (!cursorAccountsInfo.value.accessToken || !cursorAccountsInfo.value.email) {
                throw new Error("Not logged in");
            }

            // Enhanced subscription info update
            await updateSubscriptionInfo();
            
            await addLog({ level: "info", data: "Page information refreshed successfully" });
            
        } catch (error) {
            console.error("Refresh failed:", error);
            await addLog({ level: "error", data: `Failed to refresh page information: ${error.message}` });
        } finally {
            // Update account in database
            await window.api.accounts.createOrUpdateAccount(
                JSON.parse(JSON.stringify(cursorAccountsInfo.value))
            );

            const timeEnd = Date.now();
            const remainingTime = Math.max(0, 2000 - (timeEnd - timeStart));
            
            setTimeout(() => {
                isRefreshLoading.value = false;
            }, remainingTime);

            // Clear API cache after refresh
            clearApiCache();
        }
    };

    // Separate function for subscription info update
    const updateSubscriptionInfo = async () => {
        try {
            const stripeProfileResult = await getStripeProfile(cursorAccountsInfo.value.accessToken);
            console.log("home stripeProfileResult :>> ", stripeProfileResult);
            
            appStore.setCursorAccountsInfo({
                membershipType: stripeProfileResult.membershipType,
                daysRemainingOnTrial: stripeProfileResult.daysRemainingOnTrial,
            });
            
            await addLog({ level: "info", data: "Subscription information updated successfully" });
        } catch (error) {
            console.error("Failed to update subscription information:", error);
            await addLog({ level: "error", data: "Failed to update subscription information" });
        }
    };

    // Enhanced log handling from main process
    const handleLogFromMain = async (log) => {
        const { level, data } = log;
        
        switch (level) {
            case "info":
            case "success":
            case "warning":
            case "error":
                await addLog(log);
                break;
            case "begin":
                loadingAutoRegister.value = true;
                break;
            case "end":
                loadingAutoRegister.value = false;
                break;
            case "account": {
                const isAutoLoginFlow = appStore.isAutoLoginFlow;
                if (isAutoLoginFlow) {
                    await addLog({ level: "info", data: "Logging in with new account..." });
                    await window.api.resetCursorAccount({
                        ...data,
                        isResetMachines: true,
                        isResetCursor: true,
                        isResetCursorAll: false,
                    });
                    await addLog({ level: "info", data: "Login completed" });
                    await refresh();
                }
                break;
            }
            case "license": {
                appStore.setAppLicenseInfo(data);
                break;
            }
            case "license-error": {
                ElMessage.error(data);
                await addLog({ level: "error", data: data });
                break;
            }
            case "box-tips": {
                ElMessageBox.confirm(data.message, data.title || "Notice", {
                    confirmButtonText: "OK",
                    showCancelButton: false,
                    type: data.type || "",
                });
                break;
            }
            case "log-tips": {
                await addLog({ level: "warning", data: data });
                break;
            }
            case "about-notice": {
                appStore.setAboutNotice(data);
                break;
            }
            default:
                break;
        }
    };

    // Enhanced tab click handler
    const handleClick = (tab) => {
        console.log("Tab clicked:", tab.props.name);
        
        if (tab.props.name === "second") {
            accountManagementRef.value?.fetchAccounts();
        }
        if (tab.props.name === "fourth") {
            settingsRef.value?.updateConfig();
        }
    };

    // Enhanced account switching
    const showUseAccountDialog = (account) => {
        accountToUse.value = account;
        useAccountDialogVisible.value = true;
    };

    const handleConfirmUseAccount = async (data) => {
        const account = Object.assign({}, accountToUse.value, data);
        console.log("Preparing to use account :>> ", account.email);

        try {
            const result = await window.api.resetCursorAccount(JSON.parse(JSON.stringify(account)));
            useAccountDialogVisible.value = false;
            
            if (result.success) {
                ElMessage.success("Account switched successfully");
                await addLog({ level: "success", data: "Account switched successfully" });
            } else {
                ElMessage.error("Failed to switch account");
                await addLog({ level: "error", data: "Failed to switch account" });
            }

            await refresh();
        } catch (error) {
            console.error("Failed to switch account:", error);
            ElMessage.error("Failed to switch account");
            await addLog({ level: "error", data: `Failed to switch account: ${error.message}` });
        }
    };

    // Enhanced token expiration check
    const checkAccessTokenExpireTime = (token) => {
        if (!token || typeof token !== "string") return null;

        try {
            const decodedToken = jwtDecode(token);
            if (decodedToken && typeof decodedToken.exp === "number") {
                const expTimestamp = decodedToken.exp * 1000;
                const now = Date.now();
                const remainingMilliseconds = expTimestamp - now;
                
                if (remainingMilliseconds < 0) {
                                            return {
                            label: "Expired",
                            type: "danger",
                            isExpired: true,
                        };
                }
                
                const days = Math.floor(remainingMilliseconds / (1000 * 60 * 60 * 24));
                if (days > 0) {
                                    return {
                    label: `${days} days`,
                    type: "success",
                    isExpired: false,
                };
                }

                const hours = Math.floor(remainingMilliseconds / (1000 * 60 * 60));
                if (hours > 0) {
                                    return {
                    label: `${hours} hours`,
                    type: "warning",
                    isExpired: false,
                };
                }

                const minutes = Math.ceil(remainingMilliseconds / (1000 * 60));
                return {
                    label: `${minutes} minutes`,
                    type: "danger",
                    isExpired: false,
                };
            }
        } catch (error) {
            console.warn("JWT decoding failed:", error);
            return null;
        }
    };

    // Enhanced membership type check
    const checkMembershipType = (info) => {
        let remainingDays = info.daysRemainingOnTrial ?? calculateRemainingDays(info.registerTimeStamp);
        
        if (info.membershipType === SUBSCRIBE_FREE_NAME) {
            remainingDays = 0;
        }
        
        let membershipTypeShow = "";
        if (info.membershipType === SUBSCRIBE_FREE_NAME) {
            membershipTypeShow = "(Expired) " + info.membershipType;
        } else if (info.membershipType === SUBSCRIBE_PRO_NAME) {
            membershipTypeShow = "(" + remainingDays + " days trial) " + info.membershipType;
        } else if (info.membershipType) {
            membershipTypeShow = info.membershipType;
            remainingDays = 999;
        } else {
            membershipTypeShow = "";
        }
        return membershipTypeShow;
    };

    // Enhanced remaining days calculation
    const calculateRemainingDays = (registerTime) => {
        if (!registerTime) return 0;
        
        try {
            const now = new Date();
            const registerDate = new Date(registerTime);
            const expiryDate = new Date(registerDate.getTime() + 15 * 24 * 60 * 60 * 1000); // 15 days

            if (now > expiryDate) {
                return 0;
            }

            const remainingMilliseconds = expiryDate - now;
            return Math.ceil(remainingMilliseconds / (1000 * 60 * 60 * 24));
        } catch (error) {
            console.error("Failed to calculate remaining days:", error);
            return 0;
        }
    };

    // Enhanced machine reset
    const resetMachine = async () => {
        try {
            await ElMessageBox.confirm(
                "Are you sure you want to reset the machine code? Software that depends on the machine code may become invalid. This operation requires administrator privileges", 
                "Reset Machine Code", 
                {
                    confirmButtonText: "OK",
                    cancelButtonText: "Cancel",
                    type: "warning",
                }
            );
            
            await window.api.setRandomMachineInfo();
            await appStore.fetchSystemInfo();
            await appStore.fetchCursorInfo();
            ElMessage.success("Machine code has been reset");
            await addLog({ level: "success", data: "Machine code has been reset" });
        } catch (error) {
            if (error !== 'cancel') {
                console.error("Failed to reset machine code:", error);
                ElMessage.error("Failed to reset machine code");
                await addLog({ level: "error", data: `Failed to reset machine code: ${error.message}` });
            }
        }
    };

    // Enhanced backup functions
    const backup = async () => {
        backupSettingsDialogVisible.value = true;
    };

    const restoreBackup = async () => {
        restoreBackupDialogVisible.value = true;
    };

    // Enhanced auto-registration with better validation
    const validateRegistrationConfig = () => {
        const { RECEIVING_EMAIL, RECEIVING_EMAIL_PIN, EMAIL_DOMAIN } = appConfig.value;

        if (!RECEIVING_EMAIL || !RECEIVING_EMAIL_PIN || !EMAIL_DOMAIN) {
            settingsDialogVisible.value = true;
            return false;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(RECEIVING_EMAIL)) {
            ElMessage.error("Invalid email format, please modify");
            settingsDialogVisible.value = true;
            return false;
        }

        return true;
    };

    const autoRegisterAndLogin = async () => {
        if (loadingAutoRegister.value) {
            ElMessage.error("Registration process is running, please try again later");
            return;
        }

        if (!validateRegistrationConfig()) return;

        try {
            await ElMessageBox.confirm(
                "Are you sure you want to register and login with a new account? This operation will reset the machine code and overwrite the login account.", 
                "One-Click Register & Login", 
                {
                    confirmButtonText: "OK",
                    cancelButtonText: "Cancel",
                    type: "warning",
                }
            );
            
            const { RECEIVING_EMAIL, RECEIVING_EMAIL_PIN, EMAIL_DOMAIN } = appConfig.value;
            
            isAutoRegistAndLogin.value = true;
            await addLog({ data: "Starting one-click register and login..." });
            appStore.setIsAutoLoginFlow(true);
            
            await window.api.runAutoRegister({
                email: RECEIVING_EMAIL,
                pin: RECEIVING_EMAIL_PIN,
                domain: EMAIL_DOMAIN,
                LOOP_COUNT: 1,
            });
        } catch (error) {
            if (error !== 'cancel') {
                console.error("One-click register and login failed:", error);
                ElMessage.error("An error occurred during one-click register and login");
                await addLog({ level: "error", data: `An error occurred during one-click register and login: ${error.message}` });
                appStore.setIsAutoLoginFlow(false);
            }
        }
    };

    const autoRegister = async () => {
        if (loadingAutoRegister.value) {
            ElMessage.error("Registration process is running, please try again later");
            return;
        }

        if (!validateRegistrationConfig()) return;

        loopCount.value = 1;
        const registerNum = appStore.appLicenseInfo?.license?.permissions?.registerNum || 2;
        
        try {
            const { value } = await ElMessageBox.prompt(
                "Please enter the number of batch registrations. Registering too many may result in domain blocking", 
                "Batch Auto Registration", 
                {
                    confirmButtonText: "OK",
                    cancelButtonText: "Cancel",
                    customClass: "auto-register-dialog",
                    inputValue: loopCount.value,
                    inputPattern: /^\d+$/,
                    inputValidator: (value) => {
                        const num = Number(value);
                        if (!Number.isInteger(num) || num < 1 || num > registerNum) {
                            return `Please enter an integer between 1 and ${registerNum}`;
                        }
                        return true;
                    },
                }
            );
            
            const { RECEIVING_EMAIL, RECEIVING_EMAIL_PIN, EMAIL_DOMAIN } = appConfig.value;
            
            loopCount.value = parseInt(value, 10);
            isAutoRegistAndLogin.value = false;
            
            await window.api.runAutoRegister({
                email: RECEIVING_EMAIL,
                pin: RECEIVING_EMAIL_PIN,
                domain: EMAIL_DOMAIN,
                LOOP_COUNT: loopCount.value,
                AUTO_LOGIN: false,
            });
        } catch (error) {
            if (error !== 'cancel') {
                console.error("Batch auto registration failed:", error);
                ElMessage.error("An error occurred during batch auto registration");
                await addLog({ level: "error", data: `An error occurred during batch auto registration: ${error.message}` });
            }
        }
    };

    const cancelAutoRegister = async () => {
        if (loadingAutoRegister.value) {
            try {
                await ElMessageBox.confirm("Registration process is running, are you sure you want to cancel?", "Notice", {
                    confirmButtonText: "OK",
                    cancelButtonText: "Cancel",
                    type: "warning",
                });
                
                await window.api.cleanupAutoRegister();
                await addLog({ level: "warning", data: "Cancelling auto registration process..." });
            } catch (error) {
                if (error !== 'cancel') {
                    console.error("Failed to cancel auto registration:", error);
                }
            }
        }
    };

    const clearLogs = () => {
        logs.value = [];
    };

    const openLink = (url) => {
        if (url) {
            window.api.openExternalLink(url);
        }
    };

    // Watch for store errors
    watch(error, (newError) => {
        if (newError) {
            addLog({ level: "error", data: newError });
        }
    });

    // Lifecycle hooks
    onMounted(async () => {
        unsubscribeLog = window.api.onLog(handleLogFromMain);
        await initializeApp();
    });

    onUnmounted(() => {
        if (unsubscribeLog) {
            unsubscribeLog();
        }
        if (refreshIntervalId) {
            clearInterval(refreshIntervalId);
        }
    });
</script>

<template>
    <div v-loading="isInitLoading" class="body-card">
        <el-tabs v-model="activeName" class="demo-tabs" @tab-click="handleClick">
            <el-tab-pane label="Home" name="first">
                <div class="body-card-item">
                    <el-scrollbar>
                        <div class="card-container">
                            <el-card style="">
                                <div class="card-header">
                                    <span>Current Login Account</span>
                                </div>
                                <p class="card-item">
                                    <span class="card-item-label">Login Email:</span>
                                    <span
                                        :class="{
                                            'is-expired': !cursorAccountsInfo.email,
                                            'is-trial': cursorAccountsInfo.email,
                                        }"
                                    >
                                        {{ cursorAccountsInfo.email || "Not logged in" }}
                                    </span>
                                </p>
                                <p class="card-item">
                                    <span class="card-item-label">Subscription Status:</span>
                                    <span
                                        :class="{
                                            'is-expired': accountInfoShow.membershipType === SUBSCRIBE_FREE_NAME,
                                            'is-trial': accountInfoShow.membershipType === SUBSCRIBE_PRO_NAME,
                                        }"
                                    >
                                        {{ accountInfoShow.membershipTypeShow }}
                                    </span>
                                </p>
                                <!-- <p class="card-item">
                                    <span class="card-item-label">Token Expiration:</span>
                                    <span
                                        v-if="accountInfoShow.accessTokenExpStatus"
                                        size="small"
                                        :type="accountInfoShow.accessTokenExpStatus.type"
                                    >
                                        {{ accountInfoShow.accessTokenExpStatus.label }}
                                    </span>
                                </p> -->
                                <p class="card-item">
                                    <span class="card-item-label">Model Usage:</span>
                                    <template v-if="accountInfoShow.modelUsageTotal">
                                        <span
                                            >{{ accountInfoShow.modelUsageUsed }} /
                                            {{ accountInfoShow.modelUsageTotal }}
                                        </span>
                                        <el-progress
                                            class="model-usage-progress"
                                            :percentage="
                                                accountInfoShow.modelUsageTotal
                                                    ? (accountInfoShow.modelUsageUsed /
                                                          accountInfoShow.modelUsageTotal) *
                                                      100
                                                    : 0
                                            "
                                            :show-text="false"
                                            :stroke-width="10"
                                            striped
                                            striped-flow
                                            :duration="15"
                                        />
                                    </template>
                                    <template v-else>
                                        <span class="is-trial">Unlimited</span>
                                    </template>
                                </p>
                                <el-icon
                                    class="refresh-icon"
                                    :class="{ 'is-loading': isRefreshLoading }"
                                    :size="20"
                                    @click="refresh"
                                    ><Refresh
                                /></el-icon>
                            </el-card>
                            <el-card style="">
                                <div class="card-header">
                                    <span>Version Information</span>
                                </div>
                                <p class="card-item">
                                    <span class="card-item-label"> Version: </span>
                                    <span v-if="systemInfo.platform === 'win32'">Windows</span>
                                    <span v-else-if="systemInfo.platform === 'darwin'">Mac</span>
                                    <span v-else-if="systemInfo.platform === 'linux'">Linux</span>
                                    <span v-else-if="systemInfo.platform">Unknown</span>
                                    <span v-else></span>
                                    &nbsp;|&nbsp;
                                    <span>{{ appConfig.appName }}{{ appConfig.version }}</span>
                                    &nbsp;|&nbsp;
                                    <span> Cursor {{ appConfig.cursorVersion }} </span>
                                </p>

                                <p class="card-item">
                                    <span class="card-item-label">machineGuid:</span>
                                    <span class="card-item-value">{{ cursorAccountsInfo.machineGuid }}</span>
                                </p>
                                <p class="card-item">
                                    <span class="card-item-label">machineId:</span>
                                    <span class="card-item-value">{{ cursorAccountsInfo.machineId }}</span>
                                </p>
                                <!-- <p class="card-item">
                                    <span class="card-item-label">machineId_ASCII:</span>
                                    <span>{{ cursorAccountsInfo.machineId_ASCII }}</span>
                                </p>
                                <p class="card-item">
                                    <span class="card-item-label">macMachineId:</span>
                                    <span>{{ cursorAccountsInfo.macMachineId }}</span>
                                </p>
                                <p class="card-item">
                                    <span class="card-item-label">devDeviceId:</span>
                                    <span>{{ cursorAccountsInfo.devDeviceId }}</span>
                                </p>
                                <p class="card-item">
                                    <span class="card-item-label">sqmId:</span>
                                    <span>{{ cursorAccountsInfo.sqmId }}</span>
                                </p> -->

                                <el-icon
                                    v-if="false"
                                    class="refresh-icon"
                                    :class="{ 'is-loading': isRefreshLoading }"
                                    :size="20"
                                    @click="refresh"
                                    ><Refresh
                                /></el-icon>
                            </el-card>
                        </div>
                        <div class="card-container">
                            <el-card style="">
                                <div class="card-header" style="margin-bottom: 3px">
                                    <span>Features</span>
                                </div>

                                <el-tooltip
                                    :visible="
                                        !appConfig.EMAIL_DOMAIN ||
                                        !appConfig.RECEIVING_EMAIL ||
                                        !appConfig.RECEIVING_EMAIL_PIN
                                            ? undefined
                                            : false
                                    "
                                    content="Enable registration function after setting domain"
                                    effect="customized"
                                    placement="right"
                                >
                                    <p class="card-item check-item">
                                        <span class="card-item-label">Set domain and verification email</span>
                                        <span
                                            v-if="
                                                appConfig.EMAIL_DOMAIN &&
                                                appConfig.RECEIVING_EMAIL &&
                                                appConfig.RECEIVING_EMAIL_PIN
                                            "
                                        >
                                            <el-icon class="check-icon" :size="20" style="color: #67c23a"
                                                ><CircleCheck
                                            /></el-icon>
                                        </span>
                                        <span v-else>
                                            <el-icon class="check-icon" :size="20" style="color: #f56c6c"
                                                ><WarningFilled
                                            /></el-icon>
                                        </span>
                                    </p>
                                </el-tooltip>

                                <el-tooltip
                                    :visible="!isAdmin ? undefined : false"
                                    content="Please start as administrator, otherwise functionality will be limited"
                                    effect="customized"
                                    placement="right"
                                >
                                    <p class="card-item check-item">
                                        <span class="card-item-label">Start as administrator</span>
                                        <span v-if="isAdmin">
                                            <el-icon class="check-icon" :size="20" style="color: #67c23a"
                                                ><CircleCheck
                                            /></el-icon>
                                        </span>
                                        <span v-else>
                                            <el-icon class="check-icon" :size="20" style="color: #f56c6c"
                                                ><WarningFilled
                                            /></el-icon>
                                        </span>
                                    </p>
                                </el-tooltip>

                                <el-tooltip
                                    :visible="!appConfig.path_cursor_exe ? undefined : false"
                                    content="Cursor installation path not found, open Cursor and click refresh to search again"
                                    effect="customized"
                                    placement="right"
                                >
                                    <p class="card-item check-item">
                                        <span class="card-item-label">Get Cursor installation path</span>
                                        <span v-if="appConfig.path_cursor_exe">
                                            <el-icon class="check-icon" :size="20" style="color: #67c23a"
                                                ><CircleCheck
                                            /></el-icon>
                                        </span>
                                        <span v-else>
                                            <el-icon class="check-icon" :size="20" style="color: #f56c6c"
                                                ><WarningFilled
                                            /></el-icon>
                                        </span>
                                    </p>
                                </el-tooltip>

                                <el-tooltip
                                    :visible="!appConfig.path_cursor_user_db ? undefined : false"
                                    content="Cursor data file path not found, recommended to install in default path"
                                    effect="customized"
                                    placement="right"
                                >
                                    <p class="card-item check-item">
                                        <span class="card-item-label">Get Cursor data file path</span>
                                        <span v-if="appConfig.path_cursor_user_db">
                                            <el-icon class="check-icon" :size="20" style="color: #67c23a"
                                                ><CircleCheck
                                            /></el-icon>
                                        </span>
                                        <span v-else>
                                            <el-icon class="check-icon" :size="20" style="color: #f56c6c"
                                                ><WarningFilled
                                            /></el-icon>
                                        </span>
                                    </p>
                                </el-tooltip>

                                <el-tooltip
                                    :visible="!appConfig.path_chrome ? undefined : false"
                                    content="Browser path not found, registration function may fail"
                                    effect="customized"
                                    placement="right"
                                >
                                    <p class="card-item check-item">
                                        <span class="card-item-label">Get Chrome browser path</span>
                                        <span v-if="appConfig.path_chrome">
                                            <el-icon class="check-icon" :size="20" style="color: #67c23a"
                                                ><CircleCheck
                                            /></el-icon>
                                        </span>
                                        <span v-else>
                                            <el-icon class="check-icon" :size="20" style="color: #f56c6c"
                                                ><WarningFilled
                                            /></el-icon>
                                        </span>
                                    </p>
                                </el-tooltip>
                                <p class="card-item btn-item">
                                    <span class="card-item-label">One-Click Register & Login</span>
                                    <el-button
                                        v-if="loadingAutoRegister && isAutoRegistAndLogin === true"
                                        @click="cancelAutoRegister"
                                    >
                                        Cancel
                                    </el-button>
                                    <el-button
                                        :loading="loadingAutoRegister && isAutoRegistAndLogin === true"
                                        @click="autoRegisterAndLogin"
                                        >One-Click Register & Login</el-button
                                    >
                                </p>

                                <p class="card-item btn-item">
                                    <span class="card-item-label">Auto Register Account</span>
                                    <el-button
                                        v-if="loadingAutoRegister && isAutoRegistAndLogin === false"
                                        @click="cancelAutoRegister"
                                    >
                                        Cancel
                                    </el-button>
                                    <el-button
                                        :loading="loadingAutoRegister && isAutoRegistAndLogin === false"
                                        @click="autoRegister"
                                        >Batch Auto Registration</el-button
                                    >
                                </p>
                                <p class="card-item btn-item">
                                    <span class="card-item-label">Reset Machine Code</span>
                                    <el-button @click="resetMachine">Reset Machine Code</el-button>
                                </p>
                                <p class="card-item btn-item">
                                    <span class="card-item-label">Backup Cursor settings, shortcuts...</span>
                                    <el-button @click="backup">Backup Settings</el-button>
                                </p>
                                <p class="card-item btn-item">
                                    <span class="card-item-label">Restore Backup</span>
                                    <el-button @click="restoreBackup">Restore Backup</el-button>
                                </p>
                                <!-- <p class="card-item btn-item">
                                    <span class="card-item-label">Block Updates</span>
                                    <el-button @click="restoreBackup">Block Updates</el-button>
                                </p> -->
                            </el-card>
                            <el-card class="log-card" style="">
                                <div class="card-header">
                                    <span>Logs</span>
                                    <el-icon
                                        class="refresh-icon clear-logs-icon"
                                        style="font-size: 16px; right: 25px; top: 18px"
                                        @click="clearLogs"
                                        ><Delete
                                    /></el-icon>
                                </div>
                                <el-scrollbar ref="logScrollbarRef" class="log-container">
                                    <p
                                        v-for="(log, index) in logs"
                                        :key="index"
                                        class="log-item"
                                        :class="`log-item-${log.level}`"
                                    >
                                        {{ log.message }}
                                    </p>
                                </el-scrollbar>
                            </el-card>
                        </div>
                    </el-scrollbar>
                </div>
            </el-tab-pane>
            <el-tab-pane label="Accounts" name="second">
                <div class="body-card-item">
                    <AccountManagement ref="accountManagementRef" @show-use-account-dialog="showUseAccountDialog" />
                </div>
            </el-tab-pane>
            <!-- <el-tab-pane label="Features" name="third">
                <div class="body-card-item">
                    <el-scrollbar>
                        <el-button type="primary" @click="register">Register</el-button>
                    </el-scrollbar>
                </div>
            </el-tab-pane> -->
            <el-tab-pane label="Settings" name="fourth">
                <div class="body-card-item">
                    <Settings ref="settingsRef" />
                </div>
            </el-tab-pane>

            <el-tab-pane label="About" name="fifth">
                <el-scrollbar>
                    <div class="body-card-item" style="padding-top: 20px">
                        <div class="about-notice-container">
                            <div
                                v-for="(notice, index) in aboutNotice"
                                :key="index"
                                class="about-notice-item"
                                :class="{ 'has-link': notice.url }"
                                :style="{
                                    color: notice.color || (notice.url ? 'var(--el-color-primary)' : ''),
                                    'font-size': notice.fontSize || '',
                                }"
                                @click="notice.url ? openLink(notice.url) : null"
                            >
                                {{ notice.title }}: {{ notice.message }}
                            </div>
                        </div>

                        <div class="license-display">
                            <div>Fly Cursor {{ versionText }}</div>
                            <div>Contact QQ: 3663856429</div>
                            <div v-if="signatureText">{{ signatureText }}</div>
                        </div>
                    </div>
                </el-scrollbar>
            </el-tab-pane>
        </el-tabs>
        <UseAccountConfirmationDialog
            v-model="useAccountDialogVisible"
            :account="accountToUse"
            @confirm="handleConfirmUseAccount"
        />
        <SettingsDialog v-model="settingsDialogVisible" />
        <BackupSettingsDialog v-model="backupSettingsDialogVisible" />
        <RestoreBackupDialog v-model="restoreBackupDialogVisible" />
    </div>
</template>

<style lang="scss" scoped>
    // .body-card {
    //     font-size: 20px;
    // }
    // .el-tabs__item.is-active {
    //     // background-color: #262c321c;
    // }

    :deep(.el-tabs__item) {
        color: var(--ev-c-text-1);
        user-select: none;
    }
    :deep(.el-tabs__nav-wrap::after) {
        background-color: #f8f9fa26;
    }
    .body-card-item {
        position: relative;
        height: calc(100vh - 120px);
        padding: 10px;
        background-color: #f8f9fa26;
        // box-shadow: 0 0 5px 0px rgb(64 64 64 / 50%);
        box-shadow: 0 5px 25px rgba(0, 0, 0, 0.05);
        border-radius: 10px;

        .card-container {
            display: flex;
            flex-direction: row;
            flex-wrap: wrap;
            gap: 10px;
            margin-bottom: 10px;
            .el-card {
                flex: 1;
                position: relative;
                --el-card-bg-color: #f8f9fa0a;
                --el-card-border-color: #f8f9fa00;
                --el-card-border-radius: 10px;

                color: var(--ev-c-text-1);
                max-width: 1880px;
                min-width: 300px;
                :deep(.el-card__body) {
                    padding-top: 10px;
                }
                &.log-card {
                    // height: 100%;
                    :deep(.el-card__body) {
                        // height: 100%;
                        height: 450px;
                        display: flex;
                        flex-direction: column;
                        .el-scrollbar {
                            flex-grow: 1;
                            min-height: 0;
                            padding-bottom: 0;
                            padding-top: 0;
                            .el-scrollbar__view {
                                padding-bottom: 10px;
                            }
                        }
                    }
                }
                .card-header {
                    font-size: 16px;
                    font-weight: 800;
                    color: var(--el-color-primary);
                    user-select: none;
                    .clear-logs-icon {
                        cursor: pointer;
                        position: absolute;
                        right: 20px;
                        top: 20px;
                        color: var(--ev-c-text-2);
                        &:hover {
                            color: var(--el-color-primary);
                        }
                    }
                }
                .card-item {
                    display: flex;
                    font-size: 14px;
                    margin-top: 10px;
                    word-break: break-all;
                    &.check-item {
                        align-items: center;
                        justify-content: space-between;
                        margin-top: 0px;
                    }
                    &.btn-item {
                        align-items: center;
                        justify-content: space-between;
                        .el-button {
                            color: var(--ev-c-text-1);
                            --el-button-bg-color: #ffffff15;
                            --el-button-border-color: #ffffff15;

                            &:hover {
                                color: var(--el-color-primary);
                            }
                        }
                    }

                    .card-item-label {
                        flex-grow: 1;
                        flex-shrink: 0;
                        color: rgba(255, 255, 255, 0.308);
                        display: inline-block;
                        // min-width: 100px;
                        margin-right: 10px;
                        user-select: none;
                    }
                    .card-item-value {
                        display: inline-block;
                        max-width: 38ch;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        direction: rtl;
                        text-align: left;
                        vertical-align: bottom;
                        // margin-left: 30px;
                    }
                    .is-trial {
                        color: #67c23a;
                    }
                    .is-expired {
                        color: #f56c6c;
                    }
                }
                .refresh-icon {
                    cursor: pointer;
                    position: absolute;
                    right: 20px;
                    top: 20px;
                    &:hover {
                        color: var(--el-color-primary);
                    }
                }
            }
            .model-usage-progress {
                margin-top: 10px;
                .el-progress-bar__outer {
                    background-color: #f8f9fa1f;
                }
            }
            .log-container {
                margin-top: 10px;
                background-color: #0000001a;
                padding: 0;
                border-radius: 5px;
                font-size: 12px;
                :deep(.el-scrollbar__view) {
                    padding: 10px;
                }
                .log-item {
                    margin: 0;
                    padding: 2px 0;
                    color: var(--ev-c-text-2);
                    word-break: break-all;
                    white-space: pre-wrap;
                }
                .log-item-error {
                    color: #f56c6c;
                }
                .log-item-account {
                    color: #67c23a;
                }
                .log-item-success {
                    color: #67c23a;
                }
                .log-item-warning {
                    color: #e6a23c;
                }
            }
        }
    }

    .license-display {
        position: absolute;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        font-size: 12px;
        opacity: 0.5;
        color: var(--ev-c-text-1);
        white-space: pre-wrap;
        text-align: center;
    }

    /* about notice */
    .about-notice-item {
        margin-bottom: 10px;
        text-align: center;

        &.has-link {
            cursor: pointer;
            text-decoration: underline;
        }
    }
</style>

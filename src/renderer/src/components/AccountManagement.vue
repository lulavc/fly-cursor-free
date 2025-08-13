<script setup>
    import { ElMessage, ElMessageBox } from "element-plus";
    // eslint-disable-next-line no-unused-vars
    import { getStripeProfile, getUsage, getApiTokens } from "../api/cursor_api";
    import { jwtDecode } from "jwt-decode";
    import { useAppStore } from "../stores/app";
    import { storeToRefs } from "pinia";
    import { UserFilled } from "@element-plus/icons-vue";
    const emit = defineEmits(["show-use-account-dialog"]);

    const appStore = useAppStore();
    const { cursorAccountsInfo } = storeToRefs(appStore);
    // --- Reactive State Definition ---

    const allData = ref([]); // All data fetched from backend
    const loading = ref(true); // Loading state, default true
    const multipleSelection = ref([]); // Multi-selected rows
    const rowLoadingState = ref({}); // Store loading state for each row, using email as key
    const rowLoadingStateSessionToken = ref({}); // Store loading state for each row, using email as key
    const isShowUpdateSessionTokenConst = false; // Whether to show update session token button

    // Pagination state
    const pagination = reactive({
        currentPage: 1,
        pageSize: 100,
        total: 0,
    });
    const SUBSCRIBE_FREE_NAME = "free";
    const SUBSCRIBE_PRO_NAME = "free_trial";
    // Sort state
    const sortOptions = reactive({
        prop: "register_time",
        order: "descending", // "ascending" or "descending"
    });

    // Dialog and form state
    const dialogVisible = ref(false);
    const formRef = ref(null);
    const accountForm = ref({
        email: "",
        accessToken: "",
        // ... Other fields can be added as needed
    });
    const formRules = {
        email: [{ required: true, message: "Please enter email address", trigger: "blur" }],
        accessToken: [{ required: true, message: "Please enter token", trigger: "blur" }],
    };

    // Progress bar state
    const progressState = reactive({
        visible: false,
        title: "",
        percentage: 0,
        message: "",
        handleId: null,
        status: "",
    });

    const resetProgressState = () => {
        progressState.handleId = null;
    };

    // --- Computed Properties ---

    // Pagination layout
    const paginationLayout = computed(() => {
        // When total entries are not greater than page size (i.e., only one page or no data), only show total and page size selection
        if (pagination.total < 11) {
            return "total";
        }

        if (pagination.total <= pagination.pageSize) {
            return "total,sizes";
        }

        const totalPages = Math.ceil(pagination.total / pagination.pageSize);
        let baseLayout = "total, sizes, prev, pager, next";

        // If total pages is greater than 7, add jump control
        if (totalPages > 7) {
            return baseLayout + ", jumper";
        }

        return baseLayout;
    });

    // Map progressState.status to el-progress status
    const progressStatus = computed(() => {
        switch (progressState.status) {
            case "finished":
                return "success";
            case "error":
                return "exception";
            case "warning":
                return "warning";
            default:
                return ""; // When el-progress status is empty string, show default theme color
        }
    });

    // --- Lifecycle Hooks ---

    let cleanupMainProcessListener = null;

    onMounted(() => {
        // fetchAccounts();
        // Listen to main process messages for progress updates
        cleanupMainProcessListener = window.api.onMainProcessMessage((eventData) => {
            // Check if it's a progress message and handleId matches current operation
            if (eventData.type === "progress" && eventData.handleId === progressState.handleId) {
                progressState.percentage =
                    eventData.total > 0 ? Math.round((eventData.processed / eventData.total) * 100) : 0;
                progressState.message = eventData.message;
                progressState.status = eventData.status;
                if (eventData.status === "finished" || eventData.status === "error") {
                    // Progress completed, user manually closes
                }
            }
        });
    });

    onUnmounted(() => {
        if (cleanupMainProcessListener) {
            cleanupMainProcessListener();
        }
    });

    // --- Utility Functions ---

    const getTokenExpTimestamp = (inputString) => {
        if (typeof inputString !== "string") {
            return null;
        }
        const match = inputString.match(/ey[^ ]*$/);
        if (!match) {
            return null;
        }
        const token = match[0];

        try {
            const decodedToken = jwtDecode(token);
            if (decodedToken && typeof decodedToken.exp === "number") {
                return decodedToken.exp * 1000;
            }
        } catch {
            // Decoding failed, not a valid JWT, continue to next
            console.warn("JWT decoding failed for a token, continuing...");
        }
        return null;
    };

    // Get real token
    const getRealAccessToken = (inputString) => {
        if (typeof inputString !== "string") {
            return "";
        }
        const match = inputString.match(/ey[^ ]*$/);
        if (!match) {
            return "";
        }
        return match[0];
    };
    const formatExpTimestamp = (expTimestamp) => {
        if (!expTimestamp) {
            return {
                label: "No Token",
                type: "danger",
                isExpired: true,
            };
        }
        const now = Date.now();
        if (expTimestamp < now) {
            return {
                label: "Expired",
                type: "danger",
                isExpired: true,
            };
        }

        const remainingMilliseconds = expTimestamp - now;

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

        // Less than one hour, show minutes. Round up to avoid showing 0 minutes.
        const minutes = Math.ceil(remainingMilliseconds / (1000 * 60));
        return {
            label: `${minutes} minutes`,
            type: "danger",
            isExpired: false,
        };
    };

    /**
     * Calculate remaining days
     * @param {string} registerTime - Registration time in format "YYYY-MM-DD HH:MM:SS"
     * @returns {number} Remaining days
     */
    const calculateRemainingDays = (registerTime) => {
        if (!registerTime) return 0;
        const now = new Date();
        const registerDate = new Date(registerTime);
        // Expires after 15 days
        const expiryDate = new Date(new Date(registerTime).setDate(registerDate.getDate() + 15));

        // If expired, return 0
        if (now > expiryDate) {
            return 0;
        }

        // Calculate remaining milliseconds and convert to days
        const remainingMilliseconds = expiryDate - now;
        const remainingDays = Math.ceil(remainingMilliseconds / (1000 * 60 * 60 * 24));
        return remainingDays;
    };

    /**
     * Format timestamp
     * @param {number} timestamp - Timestamp (milliseconds)
     * @returns {string|null} Formatted date time string "YYYY-MM-DD HH:MM:SS" or null
     */
    const formatTimestamp = (timestamp) => {
        if (!timestamp) {
            return null;
        }
        const date = new Date(timestamp);
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, "0");
        const day = date.getDate().toString().padStart(2, "0");
        const hours = date.getHours().toString().padStart(2, "0");
        const minutes = date.getMinutes().toString().padStart(2, "0");
        const seconds = date.getSeconds().toString().padStart(2, "0");
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    };

    // --- Data Fetching and Processing ---

    // Fetch account list from backend
    const fetchAccounts = async () => {
        loading.value = true;
        try {
            // Ensure database directory exists
            await window.api.accounts.ensureDatabaseDirectoryExists();
            const sortOrder = sortOptions.order === "ascending" ? "ASC" : "DESC";
            const { accounts, total } = await window.api.accounts.listAccounts({
                sortByRegisterTime: sortOrder,
                page: pagination.currentPage,
                pageSize: pagination.pageSize,
            }); //DESC descending | ASC ascending

            pagination.total = total;

            // Best practice: Check if current page is still valid
            const totalPages = Math.ceil(pagination.total / pagination.pageSize);
            if (pagination.currentPage > 1 && pagination.currentPage > totalPages) {
                // If current page number exceeds new total pages (and not first page), automatically jump to last page and refetch data
                pagination.currentPage = totalPages > 0 ? totalPages : 1;
                await fetchAccounts(); // Re-call to get last page data
                return; // Terminate current function execution, as data will be filled by new call
            }

            // Save previous loading state
            // const previousLoadingState = { ...rowLoadingState.value };

            const now = Date.now();
            allData.value = accounts.map((acc) => {
                let remainingDays = acc.daysRemainingOnTrial
                    ? acc.daysRemainingOnTrial
                    : calculateRemainingDays(acc.registerTimeStamp);
                if (acc.membershipType === SUBSCRIBE_FREE_NAME) {
                    remainingDays = 0;
                }
                let membershipTypeShow;
                if (acc.membershipType === SUBSCRIBE_FREE_NAME) {
                    membershipTypeShow = "Expired";
                } else if (acc.membershipType === SUBSCRIBE_PRO_NAME) {
                    membershipTypeShow = remainingDays + " days trial";
                } else if (acc.membershipType) {
                    membershipTypeShow = acc.membershipType;
                    remainingDays = 999;
                } else {
                    membershipTypeShow = "";
                    remainingDays = 999;
                }
                //accessToken has higher priority than WorkosCursorSessionToken
                const expTimeAccessToken = getTokenExpTimestamp(acc.accessToken);
                const expTimeSessionToken = getTokenExpTimestamp(acc.WorkosCursorSessionToken);

                let expTimestamp, optimalToken;
                if (expTimeAccessToken) {
                    expTimestamp = expTimeAccessToken;
                    optimalToken = getRealAccessToken(acc.accessToken);
                } else if (expTimeSessionToken) {
                    expTimestamp = expTimeSessionToken;
                    optimalToken = getRealAccessToken(acc.WorkosCursorSessionToken);
                } else {
                    expTimestamp = null;
                    optimalToken = null;
                }
                const expTimestampShow = formatExpTimestamp(expTimestamp);

                const percentage = acc.modelUsageTotal > 0 ? (acc.modelUsageUsed / acc.modelUsageTotal) * 100 : 0;
                const percentageStatus = percentage > 99.9 ? "exception" : percentage > 85 ? "warning" : "success";

                return {
                    ...acc,
                    register_time: formatTimestamp(acc.register_time),
                    remainingDays,
                    membershipTypeShow,
                    modelUsage: {
                        used: acc.modelUsageUsed ?? 0,
                        total: acc.modelUsageTotal ?? 0,
                    },
                    expTimeAccessToken,
                    expTimeSessionToken,
                    expTimestamp,
                    optimalToken,
                    expTimestampShow,
                    percentage,
                    percentageStatus,
                    isShowUpdateSessionToken:
                        isShowUpdateSessionTokenConst &&
                        !expTimeAccessToken &&
                        expTimeSessionToken &&
                        expTimeSessionToken > now,
                };
            });

            // Restore previous loading state
            // rowLoadingState.value = previousLoadingState;

            console.log("Found", allData.value.length, "records");
            console.log("allData.value :>> ", allData.value);
        } catch (error) {
            console.error("Failed to get account list:", error);
            ElMessage.error("Failed to get account list: " + error.message);
        } finally {
            loading.value = false;
        }
    };

    // --- Event Handling ---

    // Import button click
    const handleImport = async () => {
        const handleId = `import-${Date.now()}`;
        try {
            progressState.title = "Importing Accounts";
            progressState.visible = true;
            progressState.percentage = 0;
            progressState.message = "Waiting for user to select file...";
            progressState.status = "pending";
            progressState.handleId = handleId;

            const result = await window.api.accounts.importAccountsFromJSON(handleId);

            if (!result.canceled) {
                // ElMessage.success(`Import completed! Successfully imported ${result.successful}, failed ${result.failed}.`);
                await fetchAccounts();
            } else {
                progressState.visible = false;
            }
        } catch (error) {
            console.log("Import operation failed :>> ", error);
            // ElMessage.error("Import operation failed: " + error.message);
        }
    };

    // Export button click
    const handleExport = async () => {
        const handleId = `export-${Date.now()}`;
        try {
            progressState.title = "Exporting Accounts";
            progressState.visible = true;
            progressState.percentage = 0;
            progressState.message = "Waiting for user to select save location...";
            progressState.status = "pending";
            progressState.handleId = handleId;

            const result = await window.api.accounts.exportAccountsToJSON(handleId);

            if (!result.canceled) {
                // ElMessage.success(`Accounts successfully exported to: ${result.filePath}`);
            } else {
                // ElMessage.info("User cancelled the export operation.");
                progressState.visible = false;
            }
        } catch (error) {
            console.log("Export operation failed :>> ", error);
            ElMessage.error("Export operation failed: " + error.message);
            progressState.visible = false;
        }
    };

    // Add button click
    const handleAdd = () => {
        accountForm.value = { id: null, email: "", accessToken: "" };
        nextTick(() => {
            formRef.value && formRef.value.resetFields();
        });
        dialogVisible.value = true;
    };

    // eslint-disable-next-line no-unused-vars
    const importCurrentLoginAccount = () => {
        if (!cursorAccountsInfo.value.email) {
            ElMessage.error("No account currently logged in.");
            return;
        }
        accountForm.value = { ...cursorAccountsInfo.value };
    };

    // // Edit button click
    // const handleEdit = async (row) => {

    //     try {
    //         isEditMode.value = true;
    //         // Use Object.assign to ensure reactivity
    //         Object.assign(accountForm.value, { ...row });
    //         dialogVisible.value = true;
    //     } catch (error) {
    //         console.error("Edit operation error:", error);
    //         ElMessage.error("Operation failed: " + error.message);
    //     }
    // };

    // // Delete button click
    // const handleDelete = (row) => {
    //     ElMessageBox.confirm(`Are you sure you want to delete the account with email "${row.email}"?`, "Warning", {
    //         confirmButtonText: "Confirm",
    //         cancelButtonText: "Cancel",
    //         type: "warning",
    //     })
    //         .then(async () => {
    //             try {
    //                 const success = await window.api.accounts.deleteAccount(row.email);
    //                 if (success) {
    //                     ElMessage.success("Delete successful!");
    //                     await fetchAccounts();
    //                 } else {
    //                     ElMessage.error("Delete failed, account not found.");
    //                 }
    //             } catch (error) {
    //                 ElMessage.error("Delete failed: " + error.message);
    //             }
    //         })
    //         .catch(() => {
    //             // User cancelled
    //         });
    // };

    const handleUpdateSessionToken = async (row) => {
        if (!row.WorkosCursorSessionToken) {
            ElMessage.error("This account has no refresh token.");
            return;
        }

        if (rowLoadingStateSessionToken.value[row.email]) {
            return;
        }
        ElMessageBox.confirm("Use third-party interface to refresh 60-day token, this interface has 5 times per IP per day, may have unknown risks, confirm refresh?", "Notice", {
            confirmButtonText: "Confirm",
            cancelButtonText: "Cancel",
            type: "warning",
        }).then(async () => {
            rowLoadingStateSessionToken.value[row.email] = true;

            // Get api tokens
            console.log("Refreshing token ");
            const updateData = {
                email: row.email,
            };
            try {
                const cursorAccountInfo = await getApiTokens(row.WorkosCursorSessionToken);
                updateData.accessToken = cursorAccountInfo.accessToken;
                updateData.refreshToken = cursorAccountInfo.refreshToken;
                await window.api.accounts.createOrUpdateAccount(updateData);
                await fetchAccounts();
                appStore.setActiveEmail(row.email);
            } catch (error) {
                console.error("Failed to get api tokens:", error);
                ElMessage.error("Failed to refresh token!");
            } finally {
                rowLoadingStateSessionToken.value[row.email] = false;
            }
        });
    };

    const handleUpdateAccount = async (row) => {
        let accessToken = row.optimalToken;
        if (!accessToken) {
            ElMessage.error("This account has no access token.");
            return;
        }
        // Set loading state for current row
        rowLoadingState.value[row.email] = true;

        try {
            const updateData = {
                email: row.email,
            };

            let stripeProfileResult = await getStripeProfile(accessToken);
            console.log("stripeProfileResult :>> ", stripeProfileResult);

            updateData.membershipType = stripeProfileResult.membershipType;
            updateData.daysRemainingOnTrial = stripeProfileResult.daysRemainingOnTrial;

            // let usageResult = await getUsage(accessToken);
            // updateData.modelUsageUsed = usageResult.numRequestsTotal || 0;
            // updateData.modelUsageTotal = usageResult.maxRequestUsage || 0;
            // updateData.registerTimeStamp = new Date(usageResult.startOfMonth).getTime();

            await window.api.accounts.createOrUpdateAccount(updateData);
            await fetchAccounts();
            appStore.setActiveEmail(row.email);
        } catch (error) {
            console.error("Unexpected error occurred while updating subscription information:", error);
            ElMessage.error("Failed to update subscription information");
        } finally {
            rowLoadingState.value[row.email] = false;
        }
    };

    const handleUseAccount = (row) => {
        if (!row.optimalToken) {
            ElMessage.error("This account has no access token.");
            return;
        }
        emit("show-use-account-dialog", { ...row });
    };

    // Batch delete button click
    const handleDeleteBatch = () => {
        if (multipleSelection.value.length === 0) {
            ElMessage.warning("Please select at least one account.");
            return;
        }
        ElMessageBox.confirm(`Are you sure you want to delete the selected ${multipleSelection.value.length} accounts?`, "Warning", {
            confirmButtonText: "Confirm",
            cancelButtonText: "Cancel",
            type: "warning",
        })
            .then(async () => {
                try {
                    const handleId = `delete-batch-${Date.now()}`;
                    const emails = multipleSelection.value.map((item) => item.email);

                    progressState.title = "Batch Deleting";
                    progressState.visible = true;
                    progressState.percentage = 0;
                    progressState.message = "Preparing to start...";
                    progressState.status = "pending";
                    progressState.handleId = handleId;

                    const deletedCount = await window.api.accounts.deleteAccounts(emails, handleId);
                    console.log(`Successfully deleted ${deletedCount} accounts.`);
                    // ElMessage.success(`Successfully deleted ${deletedCount} accounts.`);
                    await fetchAccounts();
                    multipleSelection.value = []; // Clear selection
                } catch (error) {
                    ElMessage.error("Batch delete failed: " + error.message);
                }
            })
            .catch(() => {
                // User cancelled
            });
    };

    // Submit form
    const submitForm = async () => {
        await formRef.value.validate(async (valid) => {
            if (valid) {
                try {
                    const expTimestamp = getTokenExpTimestamp(accountForm.value.accessToken);
                    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
                    if (!emailRegex.test(accountForm.value.email)) {
                        ElMessage.error("Email format is incorrect");
                        return;
                    }
                    if (!expTimestamp) {
                        ElMessage.error("Token is invalid");
                        return;
                    }
                    if (expTimestamp < Date.now()) {
                        ElMessage.error("Token has expired");
                        return;
                    }

                    let saveData = {
                        ...accountForm.value,
                        email: accountForm.value.email,
                    };

                    if (accountForm.value.accessToken.startsWith("user_")) {
                        saveData.WorkosCursorSessionToken = accountForm.value.accessToken;
                    } else {
                        saveData.accessToken = accountForm.value.accessToken;
                    }

                    // Add mode
                    await window.api.accounts.createOrUpdateAccount(saveData);
                    ElMessage.success("Added successfully!");
                    dialogVisible.value = false;

                    await fetchAccounts();
                    appStore.setActiveEmail(accountForm.value.email);
                } catch (error) {
                    console.log("error :>> ", error);
                    ElMessage.error("Operation failed: " + error.message);
                }
            }
        });
    };

    // Handle table multi-selection changes
    const handleSelectionChange = (val) => {
        multipleSelection.value = val;
    };

    // Handle page size changes
    const handleSizeChange = (val) => {
        pagination.pageSize = val;
        pagination.currentPage = 1; // When changing page size, return to first page
        fetchAccounts();
    };

    // Handle current page number changes
    const handleCurrentChange = (val) => {
        pagination.currentPage = val;
        fetchAccounts();
    };

    // Handle sorting changes
    const handleSortChange = ({ prop, order }) => {
        // Currently only supports sorting by registration time
        if (prop === "register_time" && order) {
            sortOptions.order = order;
            // Return to first page after sorting
            pagination.currentPage = 1;
            fetchAccounts();
        }
    };

    const handleRowClick = (row) => {
        console.log("click row.email :>> ", row.email);
        appStore.setActiveEmail("");
    };

    const tableRowClassName = ({ row }) => {
        if (row.email === appStore.activeEmail) {
            return "active-row";
        }
        return "";
    };

    defineExpose({
        fetchAccounts,
    });
</script>

<template>
    <div class="account-management-container">
        <!-- Table Display Area -->
        <div class="table-container">
            <el-table
                v-loading="loading"
                :data="allData"
                style="width: 100%"
                height="100%"
                stripe
                :row-class-name="tableRowClassName"
                :default-sort="{ prop: 'register_time', order: 'descending' }"
                @selection-change="handleSelectionChange"
                @sort-change="handleSortChange"
                @row-click="handleRowClick"
            >
                <el-table-column type="selection" width="55" align="center" />
                <el-table-column
                    label="No."
                    type="index"
                    width="60"
                    align="center"
                    :index="(index) => (pagination.currentPage - 1) * pagination.pageSize + index + 1"
                />
                <el-table-column prop="email" label="Email" min-width="100" show-overflow-tooltip>
                    <template #default="scope">
                        <span style="position: relative; padding-left: 5px">
                            <el-icon
                                v-if="cursorAccountsInfo.email === scope.row.email"
                                color="#67c23a"
                                style="position: absolute; top: 3px; margin-right: 2px; margin-left: -17px"
                                ><UserFilled
                            /></el-icon>
                            <span :style="cursorAccountsInfo.email === scope.row.email ? 'color:#67c23a;' : ''">{{
                                scope.row.email
                            }}</span>
                        </span>
                    </template>
                </el-table-column>

                <el-table-column
                    prop="register_time"
                    label="Created Time"
                    min-width="100"
                    align="center"
                    sortable="custom"
                    show-overflow-tooltip
                >
                    <template #default="scope">
                        <span :style="cursorAccountsInfo.email === scope.row.email ? 'color:#67c23a;' : ''">{{
                            scope.row.register_time
                        }}</span>
                    </template>
                </el-table-column>

                <el-table-column label="Subscription Status" width="100" align="center">
                    <template #default="scope">
                        <el-tag
                            v-if="scope.row.membershipTypeShow"
                            size="small"
                            :type="
                                scope.row.remainingDays > 7
                                    ? 'success'
                                    : scope.row.remainingDays > 3
                                      ? 'warning'
                                      : 'danger'
                            "
                        >
                            {{ scope.row.membershipTypeShow }}
                        </el-tag>
                    </template>
                </el-table-column>
                <!-- <el-table-column
                    prop="modelUsage.membershipType"
                    label="Token Validity Period"
                    width="120"
                    align="center"
                    show-overflow-tooltip
                >
                    <template #default="scope">
                        <el-tag
                            :type="scope.row.expTimestampShow.type"
                            size="small"
                        >
                            {{ scope.row.expTimestampShow.label }}
                        </el-tag>
                    </template>
                </el-table-column> -->

                <el-table-column label="Model Usage" width="100" align="center">
                    <template #default="scope">
                        <div v-if="scope.row.modelUsage.total">
                            <span>{{ scope.row.modelUsage.used }} / {{ scope.row.modelUsage.total }}</span>
                            <el-progress
                                v-if="scope.row.modelUsage.total > 0"
                                :percentage="scope.row.percentage"
                                :status="scope.row.percentageStatus"
                                :stroke-width="5"
                                :show-text="false"
                            />
                        </div>
                        <div v-else style="font-size: 12px; line-height: 23px">Unlimited</div>
                    </template>
                </el-table-column>

                <el-table-column fixed="right" label="Actions" width="160" align="center">
                    <template #default="scope">
                        <template v-if="!scope.row.expTimestampShow.isExpired">
                            <el-button link type="success" size="small" @click="handleUseAccount(scope.row)">{{
                                cursorAccountsInfo.email === scope.row.email ? "In Use" : "Use"
                            }}</el-button>
                            <el-button
                                link
                                type="primary"
                                :loading="rowLoadingState[scope.row.email]"
                                @click="handleUpdateAccount(scope.row)"
                                >Update
                            </el-button>
                            <el-button
                                v-if="scope.row.isShowUpdateSessionToken"
                                link
                                type="primary"
                                :loading="rowLoadingStateSessionToken[scope.row.email]"
                                @click="handleUpdateSessionToken(scope.row)"
                                >Refresh 60-day Token
                            </el-button>
                        </template>

                        <!-- <el-dropdown trigger="click">
                            <el-button text type="primary">
                                <el-icon><MoreFilled /></el-icon>
                            </el-button>
                            <template #dropdown>
                                <el-dropdown-menu>
                                    <el-dropdown-item @click="handleEdit(scope.row)"> Edit </el-dropdown-item>
                                    <el-dropdown-item style="color: #f56c6c" @click="handleDelete(scope.row)">
                                        Delete
                                    </el-dropdown-item>
                                </el-dropdown-menu>
                            </template>
                        </el-dropdown> -->
                    </template>
                </el-table-column>
            </el-table>
        </div>
        <div class="footer">
            <!-- Function Operation Area -->
            <div class="toolbar">
                <el-button type="success" size="small" plain @click="handleAdd">Add Account</el-button>
                <el-button type="danger" size="small" plain @click="handleDeleteBatch">Batch Delete</el-button>
                <el-button type="success" size="small" plain @click="handleImport">Import</el-button>
                <el-button type="warning" size="small" plain @click="handleExport">Export</el-button>
            </div>

            <!-- Pagination Control Area -->
            <div v-if="pagination.total > 0" class="pagination-container">
                <el-pagination
                    v-model:current-page="pagination.currentPage"
                    v-model:page-size="pagination.pageSize"
                    size="small"
                    :page-sizes="[10, 20, 50, 100]"
                    :layout="paginationLayout"
                    :total="pagination.total"
                    @size-change="handleSizeChange"
                    @current-change="handleCurrentChange"
                />
            </div>
        </div>

        <!-- Add/Edit Dialog -->
        <el-dialog v-model="dialogVisible" title="Add Account" width="500px">
            <el-form ref="formRef" :model="accountForm" :rules="formRules" label-width="80px">
                <el-form-item label="Email" prop="email">
                    <el-input v-model="accountForm.email" placeholder="Please enter email address" />
                </el-form-item>
                <el-form-item label="Token" prop="accessToken">
                    <el-input
                        v-model="accountForm.accessToken"
                        type="textarea"
                        :rows="5"
                        placeholder="Please enter accessToken or WorkosCursorSessionToken"
                    />
                </el-form-item>
                <!-- More fields can be added as needed -->
            </el-form>
            <template #footer>
                <span class="dialog-footer">
                    <!-- <el-button @click="importCurrentLoginAccount">Add current Cursor login account</el-button> -->
                    <el-button @click="dialogVisible = false">Cancel</el-button>
                    <el-button type="primary" @click="submitForm">OK</el-button>
                </span>
            </template>
        </el-dialog>

        <!-- Progress Bar Dialog -->
        <el-dialog
            v-model="progressState.visible"
            :title="progressState.title"
            width="400px"
            :close-on-click-modal="false"
            append-to-body
            @close="resetProgressState"
        >
            <div class="progress-content">
                <el-progress :percentage="progressState.percentage" :status="progressStatus" />
                <p class="progress-message">
                    {{ progressState.message }}
                </p>
            </div>
        </el-dialog>
    </div>
</template>

<style lang="scss" scoped>
    .account-management-container {
        padding: 10px;
        display: flex;
        flex-direction: column;
        height: 100%;
        box-sizing: border-box;
        opacity: 0.9;
    }
    .footer {
        display: flex;
        justify-content: space-between;
        align-items: center;

        .toolbar {
            margin-top: 10px;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            flex-wrap: wrap;
        }
        :deep(.pagination-container) {
            display: flex;
            justify-content: flex-end;
            margin-top: 10px;
            flex-shrink: 0;

            .el-pagination {
                .el-pagination__classifier,
                .el-pagination__goto,
                .el-pagination__total {
                    color: var(--ev-c-text-1);
                }
                .btn-prev,
                .btn-next,
                .el-pager li {
                    border-radius: 4px;
                    margin: 0 3px;
                }
                .el-pager li.is-active {
                    color: var(--el-color-white);
                    background-color: var(--el-color-primary);
                }
                .el-pager li:hover {
                    color: var(--el-color-primary);
                }
            }
        }
    }

    .table-container {
        flex: 1;
        min-height: 0;
        border-radius: 4px;
        overflow: hidden;
    }

    /* Beautify UI Styles */
    :deep(.el-table) {
        // Table header
        th.el-table__cell {
            background-color: #f7f9fc;
            color: #333;
            font-weight: 600;
            user-select: none;
        }
        // Hover effect
        .el-table__body tr:hover > td.el-table__cell {
            background-color: #ecf5ff !important;
        }
        .el-table__body tr.active-row > td,
        .el-table__body tr.active-row:hover > td {
            background-color: #d9ecff !important;
        }
    }

    :deep(.el-tag) {
        user-select: none;
    }

    :deep(.el-textarea__inner) {
        &::-webkit-scrollbar {
            width: 6px;
        }

        &::-webkit-scrollbar-track {
            background-color: transparent;
        }

        &::-webkit-scrollbar-thumb {
            background-color: #dcdfe6;
            border-radius: 4px;
            transition: background-color 0.3s;
        }

        &::-webkit-scrollbar-thumb:hover {
            background-color: #c0c4cc;
            cursor: pointer;
        }
    }

    :deep(.dialog-footer) {
        // display: flex;
        // justify-content: space-between;
        // align-items: center;
        // gap: 10px;
        .el-button:first-child {
            margin-right: auto;
        }
    }
</style>

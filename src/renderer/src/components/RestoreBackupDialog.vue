<script setup>
    import { ref, watch } from "vue";
    import { ElMessage } from "element-plus";
    import { storeToRefs } from "pinia";
    import { useAppStore } from "../stores/app.js";

    const appStore = useAppStore();
    const { appConfig } = storeToRefs(appStore);
    const props = defineProps({
        modelValue: Boolean,
    });

    const emits = defineEmits(["update:modelValue", "confirm"]);

    const dialogVisible = ref(props.modelValue);

    const backups = ref([]);
    const selectedBackup = ref("");
    const getBackups = async () => {
        const result = await window.api.listBackups();
        console.log("result:", result);
        backups.value = result.data.map((item, index) => {
            return {
                label: item.replace(
                    /^settings_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/,
                    (match, y, m, d, h, min, s) => {
                        let name = `Backup_${y}-${m}-${d} ${h}:${min}:${s}`;
                        if (index === 0) {
                            name = name + " Latest";
                        }
                        return name;
                    }
                ),
                value: item,
            };
        });
    };
    watch(
        () => props.modelValue,
        (val) => {
            dialogVisible.value = val;
            if (val) {
                getBackups();
                isResetOriginalMachineGuid.value = false;
            }
        }
    );

    watch(dialogVisible, (val) => {
        if (!val) {
            emits("update:modelValue", false);
            selectedBackup.value = "";
            backups.value = [];
        }
    });
    const isResetOriginalMachineGuid = ref(false);
    const handleConfirm = async () => {
        if (isResetOriginalMachineGuid.value) {
            let result = await window.api.setMachineGuid(appConfig.value.originalMachineGuid);
            if (result.success === true) {
                ElMessage.success("Restored initial machine code successfully");
                await appStore.fetchSystemInfo();
            } else {
                ElMessage.error(result.message);
            }
        }

        if (!backups.value.length) {
            dialogVisible.value = false;
            return;
        }

        if (!appConfig.value.path_cursor_user_db) {
            ElMessage.error("Cursor file path not found, recommend installing Cursor to default path");
            return;
        }

        if (!selectedBackup.value) {
            ElMessage.error("Please select a backup file to restore");
            return;
        }

        try {
            console.log("selectedBackup.value :>> ", selectedBackup.value);
            let result = await window.api.restoreBackup(selectedBackup.value);
            if (result.success === true) {
                ElMessage.success("Backup restored successfully");
            } else {
                throw result.message;
            }
        } catch (error) {
            console.error("Failed to restore backup", error);
            ElMessage.error("Failed to restore backup");
        }
        dialogVisible.value = false;
    };
</script>

<template>
    <el-dialog v-model="dialogVisible" title="Restore Backup" width="500">
        <div v-if="backups.length">
            <p>Restore your Cursor settings, shortcuts, extensions, code snippets from backup</p>
            <p style="color: #f56c6c; margin-top: 10px">Note: This operation will overwrite your current Cursor settings and restart Cursor</p>
        </div>

        <el-radio-group
            v-if="backups.length"
            v-model="selectedBackup"
            style="display: flex; flex-direction: column; margin-top: 10px"
        >
            <el-radio v-for="backup in backups" :key="backup.value" :value="backup.value">{{ backup.label }}</el-radio>
        </el-radio-group>
        <p v-else style="margin-top: 5px; opacity: 0.6">No Cursor settings backup available, please backup first</p>
        <p v-if="appConfig.originalMachineGuid" style="margin-top: 10px">
            <el-checkbox v-model="isResetOriginalMachineGuid">Also restore initial machine code MachineGuid</el-checkbox>
        </p>
        <template #footer>
            <div class="dialog-footer">
                <el-button @click="dialogVisible = false">Cancel</el-button>
                <el-button type="primary" @click="handleConfirm"> OK </el-button>
            </div>
        </template>
    </el-dialog>
</template>

<style lang="scss" scoped>
    .el-radio-group {
        align-items: flex-start;
    }
</style>

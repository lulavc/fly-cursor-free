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

    watch(
        () => props.modelValue,
        (val) => {
            dialogVisible.value = val;
        }
    );

    watch(dialogVisible, (val) => {
        if (!val) {
            emits("update:modelValue", false);
        }
    });

    const handleConfirm = async () => {
        if (!appConfig.value.path_cursor_user_db) {
            ElMessage.error("Cursor file path not found!");
            return;
        }

        try {
            let result = await window.api.backup();
            if (result.success === true) {
                ElMessage.success("Backup successful");
            } else {
                throw result.message;
            }
        } catch (error) {
            console.error("Backup failed", error);
            ElMessage.error("Backup failed");
        }
        dialogVisible.value = false;
    };
</script>

<template>
    <el-dialog v-model="dialogVisible" title="Backup Cursor Settings" width="500">
        <div>
            <p>Are you sure you want to backup your Cursor?</p>
            <p style="margin-top: 10px">Including Cursor settings, shortcuts, extensions, code snippets</p>
            <p style="margin-top: 10px">More than 5 backups will automatically delete old backups</p>
        </div>
        <template #footer>
            <div class="dialog-footer">
                <el-button @click="dialogVisible = false">Cancel</el-button>
                <el-button type="primary" @click="handleConfirm"> OK </el-button>
            </div>
        </template>
    </el-dialog>
</template>

<style lang="scss" scoped></style>

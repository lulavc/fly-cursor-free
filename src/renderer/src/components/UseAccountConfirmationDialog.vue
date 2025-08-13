<template>
    <el-dialog
        :model-value="modelValue"
        title="Switch Account"
        width="500px"
        :close-on-click-modal="false"
        @update:model-value="$emit('update:modelValue', $event)"
    >
        <div v-if="account">
            <p>
                Are you sure you want to use account <strong>{{ account.email }}</strong
                >?
            </p>
            <p>This operation may restart Cursor!</p>
            <p>
                <el-checkbox v-model="isResetMachines">Reset machine code (Recommended)</el-checkbox>
            </p>
            <p>
                <el-checkbox v-model="isResetCursor">Special reset Cursor (Recommended)</el-checkbox>
            </p>
            <p>
                <el-checkbox v-model="isResetCursorAll">Complete reset Cursor</el-checkbox>
            </p>
        </div>
        <template #footer>
            <span class="dialog-footer">
                <el-button @click="$emit('update:modelValue', false)">Cancel</el-button>
                <el-button type="primary" @click="handleConfirm">OK</el-button>
            </span>
        </template>
    </el-dialog>
</template>

<script setup>
    // eslint-disable-next-line no-unused-vars
    const props = defineProps({
        modelValue: {
            type: Boolean,
            required: true,
        },
        account: {
            type: Object,
            default: null,
        },
    });

    const isResetMachines = ref(true);
    const isResetCursor = ref(true);
    const isResetCursorAll = ref(false);

    const emit = defineEmits(["update:modelValue", "confirm"]);

    // 然后使用函数形式监听
    watch(
        () => props.modelValue,
        (newVal) => {
            if (!newVal) {
                isResetMachines.value = true;
                isResetCursor.value = true;
                isResetCursorAll.value = false;
            }
        }
    );

    const handleConfirm = () => {
        emit("confirm", {
            isResetMachines: isResetMachines.value,
            isResetCursor: isResetCursor.value,
            isResetCursorAll: isResetCursorAll.value,
        });
        emit("update:modelValue", false);
    };
</script>

<style scoped>
    .dialog-footer {
        text-align: right;
    }
</style>

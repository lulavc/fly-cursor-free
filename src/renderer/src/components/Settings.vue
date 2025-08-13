<script setup>
    import { useAppStore } from "../stores/app.js";
    import { storeToRefs } from "pinia";
    import { ref, onMounted } from "vue";
    import { ElMessage } from "element-plus";

    const formRef = ref(null);

    const rules = ref({
        EMAIL_DOMAIN: [{ required: true, message: "Please enter domain", trigger: "blur" }],
        RECEIVING_EMAIL: [
            { required: true, message: "Please enter tempmail email", trigger: "blur" },
            { type: "email", message: "Please enter correct email format", trigger: ["blur", "change"] },
        ],
        RECEIVING_EMAIL_PIN: [{ required: true, message: "Please enter PIN code", trigger: "blur" }],
    });

    const appStore = useAppStore();
    const { appConfig } = storeToRefs(appStore);

    const localConfig = ref({
        EMAIL_DOMAIN: "",
        RECEIVING_EMAIL: "",
        RECEIVING_EMAIL_PIN: "",
    });

    const updateConfig = () => {
        if (appConfig.value) {
            localConfig.value = JSON.parse(JSON.stringify(appConfig.value));
            formRef.value.clearValidate();
        }
    };

    onMounted(() => {
        updateConfig();
    });

    defineExpose({
        updateConfig,
    });

    const saveConfig = async () => {
        if (!formRef.value) return;
        try {
            await formRef.value.validate();
        } catch {
            return;
        }

        const newConfig = JSON.parse(JSON.stringify(localConfig.value));

        try {
            let setResult = await window.api.setAppConfig(newConfig);
            if (setResult.success) {
                ElMessage.success(`Configuration updated successfully`);
                await appStore.fetchAppConfig();
            } else {
                ElMessage.error("Failed to update configuration");
            }
        } catch (error) {
            console.log("error1 :>> ", error);
            ElMessage.error("Failed to update configuration");
        }
    };

    const openLink = (url) => {
        window.api.openExternalLink(url);
    };
</script>

<template>
    <div v-if="localConfig" class="settings-container">
        <el-form ref="formRef" :model="localConfig" :rules="rules" label-width="150px" style="max-width: 450px">
            <el-form-item label="Domain" prop="EMAIL_DOMAIN">
                <el-input v-model="localConfig.EMAIL_DOMAIN" placeholder="Personal domain e.g.: flyxx.com Alibaba Cloud 1 yuan purchase" />
            </el-form-item>
            <el-form-item label="Tempmail Email" prop="RECEIVING_EMAIL">
                <el-input v-model="localConfig.RECEIVING_EMAIL" placeholder="Temporary email https://tempmail.plus free application" />
            </el-form-item>
            <el-form-item label="PIN Code" prop="RECEIVING_EMAIL_PIN">
                <el-input v-model="localConfig.RECEIVING_EMAIL_PIN" placeholder="Temporary email PIN code" />
            </el-form-item>
            <el-form-item label="">
                <p class="open-link" @click.prevent="openLink('https://tempmail.plus')">
                    Temporary email application address: https://tempmail.plus
                </p>
            </el-form-item>
            <el-form-item label="">
                <p class="open-link" @click.prevent="openLink('https://www.bilibili.com/opus/951275934028136469')">
                    Cloudflare Route Unlimited Email Configuration Tutorial
                </p>
            </el-form-item>
            <el-form-item>
                <el-button type="primary" @click="saveConfig">Save</el-button>
            </el-form-item>
        </el-form>
    </div>
    <div v-else>Loading configuration...</div>
</template>

<style scoped>
    .settings-container {
        padding: 20px;
    }
    .open-link {
        color: var(--el-color-primary);
        cursor: pointer;
        text-decoration: underline;
    }
    :deep(.el-form-item) {
        label {
            color: var(--ev-c-text-1);
        }
    }
</style>

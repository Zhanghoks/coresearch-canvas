import { Button, Modal } from "antd";
import { useTranslation } from "react-i18next";

import { useConfigStore, type ConfigTabKey } from "@/stores/use-config-store";

export function AppConfigPanel({ showDoneButton = false }: { showDoneButton?: boolean; initialTab?: ConfigTabKey }) {
    const { t } = useTranslation();
    const setConfigDialogOpen = useConfigStore((state) => state.setConfigDialogOpen);
    return (
        <div className="py-1 text-sm leading-6 text-stone-600 dark:text-stone-400">
            <p>{t("config.saasNoKeys")}</p>
            {showDoneButton ? (
                <div className="mt-4 flex justify-end">
                    <Button onClick={() => setConfigDialogOpen(false)}>{t("common.done")}</Button>
                </div>
            ) : null}
        </div>
    );
}

export function AppConfigModal() {
    const { t } = useTranslation();
    const isConfigOpen = useConfigStore((state) => state.isConfigOpen);
    const setConfigDialogOpen = useConfigStore((state) => state.setConfigDialogOpen);
    return (
        <Modal title={t("config.title")} open={isConfigOpen} width={480} centered onCancel={() => setConfigDialogOpen(false)} footer={null}>
            <AppConfigPanel showDoneButton />
        </Modal>
    );
}

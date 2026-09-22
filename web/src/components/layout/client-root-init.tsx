import type { ReactNode } from "react";
import { useEffect } from "react";
import { App } from "antd";

import { useUserStore } from "@/stores/use-user-store";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { hostedAgentApi } from "@/services/api/hosted-agent";

const deletingHostedProjects = new Set<string>();

export function ClientRootInit({ children }: { children: ReactNode }) {
    const { message } = App.useApp();
    const initializeUser = useUserStore((state) => state.initialize);
    const loadWorkspace = useCanvasStore((state) => state.loadWorkspace);
    const user = useUserStore((state) => state.user);
    const accessToken = useUserStore((state) => state.accessToken);
    const deletedProjects = useCanvasStore((state) => state.deletedProjects);
    const markAgentProjectDeleted = useCanvasStore((state) => state.markAgentProjectDeleted);

    useEffect(() => {
        void initializeUser();
    }, [initializeUser]);

    useEffect(() => {
        void loadWorkspace();
    }, [loadWorkspace, user?.id]);

    useEffect(() => {
        if (!user || !accessToken) return;
        deletedProjects.filter((item) => item.agentProjectId && item.agentOwnerUserId === user.id).forEach((item) => {
            const agentProjectId = item.agentProjectId!;
            if (deletingHostedProjects.has(agentProjectId)) return;
            deletingHostedProjects.add(agentProjectId);
            void hostedAgentApi.deleteProject(accessToken, agentProjectId).then(() => markAgentProjectDeleted(item.id)).catch((error) => {
                deletingHostedProjects.delete(agentProjectId);
                message.error(error instanceof Error ? error.message : "删除托管项目失败");
            });
        });
    }, [accessToken, deletedProjects, markAgentProjectDeleted, message, user]);

    return <>{children}</>;
}

import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { AgentPanel } from "@/components/agent/agent-panel";
import { CanvasDeleteProjectsDialog } from "@/components/canvas/canvas-delete-projects-dialog";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AuthGate } from "@/components/layout/auth-gate";
import { hostedAgentConfigured } from "@/services/api/supabase";
import { useUserStore } from "@/stores/use-user-store";

const PROJECT_PATH = /^\/canvas\/[^/]+/;

export default function UserLayout({ children }: { children: ReactNode }) {
    const { pathname } = useLocation();
    const user = useUserStore((state) => state.user);
    const loading = useUserStore((state) => state.loading);
    const showAgent = PROJECT_PATH.test(pathname);

    if (hostedAgentConfigured && loading) {
        return <div className="h-dvh w-full bg-background" />;
    }
    if (hostedAgentConfigured && !user) {
        return <AuthGate />;
    }

    return (
        <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground md:flex-row">
            <AppSidebar />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
            {showAgent ? <AgentPanel /> : null}
            <CanvasDeleteProjectsDialog />
        </div>
    );
}

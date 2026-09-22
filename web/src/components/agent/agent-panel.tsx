import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";

import { LocalAgentPanel } from "./local-agent-panel";
import { HostedAgentPanel } from "./hosted-agent-panel";
import { useHostedAgentProject } from "./use-hosted-agent-project";
import { canvasThemes } from "@/lib/canvas-theme";
import { CANVAS_AGENT_PANEL_MOTION_MS, useAgentStore } from "@/stores/use-agent-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";
import { hostedAgentConfigured } from "@/services/api/supabase";

const PANEL_MOTION_SECONDS = CANVAS_AGENT_PANEL_MOTION_MS / 1000;
const AGENT_PANEL_WIDTH_KEY = "canvas-agent-panel-width-v2";

export function AgentPanel() {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const width = useAgentStore((state) => state.width);
    const [resizing, setResizing] = useState(false);
    const panelMounted = useAgentStore((state) => state.panelMounted);
    const panelOpen = useAgentStore((state) => state.panelOpen);
    const panelClosing = useAgentStore((state) => state.panelClosing);
    const setAgentState = useAgentStore((state) => state.setAgentState);
    const user = useUserStore((state) => state.user);
    const hostedScope = useHostedAgentProject();
    const useHosted = hostedAgentConfigured && Boolean(user);
    const projectId = hostedScope.project?.id || "";
    const lastProjectIdRef = useRef(projectId);

    // 本地 Agent 的会话存在本机守护进程里、没有项目维度，切项目时至少不要把上一个项目的消息留在屏幕上。
    useEffect(() => {
        const previous = lastProjectIdRef.current;
        lastProjectIdRef.current = projectId;
        if (useHosted || !projectId || previous === projectId) return;
        setAgentState({ messages: [], tokenUsage: null, activeThreadId: "", activeTurnId: "" });
    }, [projectId, setAgentState, useHosted]);

    const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = width;
        let nextWidth = startWidth;
        const onMove = (moveEvent: PointerEvent) => {
            nextWidth = Math.min(760, Math.max(360, startWidth + startX - moveEvent.clientX));
            setAgentState({ width: nextWidth });
        };
        const onUp = () => {
            localStorage.setItem(AGENT_PANEL_WIDTH_KEY, String(nextWidth));
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            setResizing(false);
        };
        setResizing(true);
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    };

    if (!panelMounted) return null;

    return (
        <motion.div
            className="relative z-[70] flex h-full shrink-0"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: panelOpen ? width + 1 : 0, opacity: panelOpen ? 1 : 0 }}
            transition={{ duration: resizing ? 0 : PANEL_MOTION_SECONDS, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: "clip", pointerEvents: panelOpen && !panelClosing ? undefined : "none" }}
        >
            <motion.aside
                className="relative flex h-full shrink-0 flex-col border-l"
                data-canvas-shortcuts-ignore
                initial={{ x: 48 }}
                animate={{ x: panelClosing ? 28 : 0 }}
                transition={{ duration: resizing ? 0 : PANEL_MOTION_SECONDS, ease: [0.22, 1, 0.36, 1] }}
                style={{ width, background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text, boxShadow: "-16px 0 40px rgba(0,0,0,.07)" }}
            >
                <button type="button" className="absolute inset-y-0 left-0 z-40 w-4 -translate-x-1/2 cursor-col-resize" onPointerDown={startResize} aria-label={t("agent.panel.resize")} />
                <div className="flex min-h-0 flex-1 flex-col">
                    {useHosted ? <HostedAgentPanel key={hostedScope.project?.id || "unbound"} scope={hostedScope} /> : <LocalAgentPanel embedded />}
                </div>
            </motion.aside>
        </motion.div>
    );
}

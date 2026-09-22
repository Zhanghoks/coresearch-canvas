import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { useAgentStore } from "@/stores/use-agent-store";
import type { CanvasNodeData } from "@/types/canvas";

export function researchNodeCopyText(node: CanvasNodeData) {
    return [node.metadata?.summary, node.metadata?.document].filter((value) => typeof value === "string" && value.trim()).join("\n\n").trim();
}

export function attachResearchNodeToAgent(node: CanvasNodeData, options?: { prompt?: string; send?: boolean }) {
    const store = useAgentStore.getState();
    const reference: CanvasResourceReference = {
        id: node.id,
        nodeId: node.id,
        kind: "text",
        label: node.title,
        title: node.title,
        text: researchNodeCopyText(node),
        active: true,
    };
    store.openPanel();
    store.setAgentState({
        activeTab: "chat",
        ...(options?.prompt != null ? { prompt: options.prompt } : {}),
        canvasReferences: [...store.canvasReferences.filter((item) => item.nodeId !== node.id), reference],
        ...(options?.send ? { pendingSend: store.pendingSend + 1 } : {}),
    });
}

export function openNodeDocumentSession(node: CanvasNodeData) {
    const store = useAgentStore.getState();
    const previousThreadId = store.documentSession?.nodeId === node.id ? store.documentSession.previousThreadId : store.activeThreadId;
    attachResearchNodeToAgent(node);
    store.setAgentState({
        documentSession: { nodeId: node.id, title: node.title, previousThreadId },
        prompt: "",
        activeTab: "chat",
    });
}

export function closeNodeDocumentSession() {
    useAgentStore.getState().setAgentState({ documentSession: null });
}

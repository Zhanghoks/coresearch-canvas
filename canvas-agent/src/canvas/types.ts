/** 画布坐标。 */
export type Position = { x: number; y: number };
export type Viewport = { x: number; y: number; k: number };
export const RESEARCH_FLOW_NODE_TYPES = ["seed", "direction", "research_question", "problem", "hypothesis", "approach", "method", "evaluation", "idea"] as const;
export type ResearchFlowNodeType = (typeof RESEARCH_FLOW_NODE_TYPES)[number];
export type CanvasNodeType = "image" | "text" | "config" | "video" | "audio" | "group" | "web" | "pdf" | ResearchFlowNodeType;
export type CanvasNode = { id: string; type: CanvasNodeType; title?: string; position: Position; width: number; height: number; metadata?: Record<string, unknown> };

export function isResearchFlowNodeType(type: string): type is ResearchFlowNodeType {
    return (RESEARCH_FLOW_NODE_TYPES as readonly string[]).includes(type);
}
export type CanvasConnection = { id: string; fromNodeId: string; toNodeId: string };
export type CanvasSnapshot = { projectId?: string; ownerUserId?: string; title?: string; nodes?: CanvasNode[]; connections?: CanvasConnection[]; selectedNodeIds?: string[]; viewport?: Viewport; clientId?: string };

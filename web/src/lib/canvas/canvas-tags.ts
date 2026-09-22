export type CanvasTagPreset = {
    id: string;
    color: string;
};

export const CANVAS_TAG_PRESETS: CanvasTagPreset[] = [
    { id: "core", color: "#3b82f6" },
    { id: "alt", color: "#c084fc" },
    { id: "lit", color: "#f59e0b" },
    { id: "method", color: "#818cf8" },
    { id: "evidence", color: "#f87171" },
    { id: "confirmed", color: "#4ade80" },
    { id: "draft", color: "#facc15" },
];

export function canvasTagById(id: string) {
    return CANVAS_TAG_PRESETS.find((tag) => tag.id === id);
}

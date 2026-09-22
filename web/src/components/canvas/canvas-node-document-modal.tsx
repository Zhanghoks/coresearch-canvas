import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { nodeDocumentMarkdown } from "@/lib/canvas/research-node-contract";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasNodeData } from "@/types/canvas";

export function CanvasNodeDocumentModal({ node, open, onSave, onClose }: { node: CanvasNodeData | null; open: boolean; onSave: (nodeId: string, document: string) => void; onClose: () => void }) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [draft, setDraft] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const writtenRef = useRef("");
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!node || !open) return;
        const next = nodeDocumentMarkdown(node);
        setDraft(next);
        writtenRef.current = next;
        requestAnimationFrame(() => textareaRef.current?.focus());
    }, [node?.id, open]);

    useEffect(() => {
        if (!node || !open) return;
        if (document.activeElement === textareaRef.current) return;
        const incoming = nodeDocumentMarkdown(node);
        if (incoming === writtenRef.current) return;
        setDraft(incoming);
        writtenRef.current = incoming;
    }, [node, open]);

    useEffect(() => {
        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        };
    }, []);

    if (!open || !node) return null;

    const persist = (value: string) => {
        writtenRef.current = value;
        onSave(node.id, value);
    };

    const close = () => {
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
        }
        persist(draft);
        onClose();
    };

    return (
        <div className="absolute inset-0 z-[200] flex flex-col" data-canvas-shortcuts-ignore style={{ background: theme.canvas.background, color: theme.node.text }}>
            <div className="flex h-12 shrink-0 items-center justify-between gap-3 px-4" style={{ color: theme.node.muted }}>
                <span className="min-w-0 truncate text-sm">{node.title || t("canvas.node.untitled")}</span>
                <button type="button" className="grid size-8 place-items-center rounded-lg opacity-70 transition hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10" aria-label={t("canvas.nodeDocument.close")} onClick={close}>
                    <X className="size-4" />
                </button>
            </div>
            <textarea
                ref={textareaRef}
                value={draft}
                onChange={(event) => {
                    const value = event.target.value;
                    setDraft(value);
                    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
                    saveTimerRef.current = setTimeout(() => persist(value), 400);
                }}
                onKeyDown={(event) => {
                    if (event.key === "Escape") {
                        event.preventDefault();
                        close();
                    }
                }}
                spellCheck={false}
                placeholder={t("canvas.nodeDocument.editorPlaceholder")}
                className="thin-scrollbar min-h-0 flex-1 resize-none border-0 bg-transparent px-5 pb-8 pt-1 text-[15px] leading-7 outline-none"
                style={{ color: theme.node.text }}
            />
        </div>
    );
}

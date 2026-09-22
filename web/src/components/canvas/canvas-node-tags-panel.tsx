import { useState } from "react";
import { Tooltip } from "antd";
import { MessagesSquare, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CANVAS_TAG_PRESETS, canvasTagById } from "@/lib/canvas/canvas-tags";
import type { CanvasTheme } from "@/lib/canvas-theme";
import type { CanvasNodeData } from "@/types/canvas";

type CanvasNodeTagsPanelProps = {
    node: CanvasNodeData;
    theme: CanvasTheme;
    open: boolean;
    onToggle: () => void;
    onChange: (patch: { tags?: string[]; keywords?: string[] }) => void;
};

export function CanvasNodeTagsButton({ open, theme, onToggle }: Pick<CanvasNodeTagsPanelProps, "open" | "theme" | "onToggle">) {
    const { t } = useTranslation();
    return (
        <Tooltip title={t("canvas.nodeTags.hint")} placement="top" mouseEnterDelay={0.2}>
            <button
                type="button"
                data-canvas-no-zoom
                className="grid size-7 place-items-center rounded-full border shadow-sm transition hover:bg-black/5 dark:hover:bg-white/10"
                style={{ background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text, opacity: open ? 1 : 0.88 }}
                aria-label={t("canvas.nodeTags.title")}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                    event.stopPropagation();
                    onToggle();
                }}
            >
                <MessagesSquare className="size-3.5" />
            </button>
        </Tooltip>
    );
}

export function CanvasNodeTagChips({ node, theme }: { node: CanvasNodeData; theme: CanvasTheme }) {
    const { t } = useTranslation();
    const tags = (node.metadata?.tags || []).flatMap((id) => {
        const preset = canvasTagById(id);
        return preset ? [{ ...preset, name: t(`canvas.nodeTags.presets.${preset.id}`) }] : [];
    });
    if (!tags.length) return null;
    return (
        <div className="flex max-w-[min(220px,100%)] flex-wrap gap-1">
            {tags.map((tag) => (
                <span key={tag.id} className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] leading-4" style={{ color: theme.node.text, background: "color-mix(in srgb, currentColor 8%, transparent)" }}>
                    <span className="size-1.5 shrink-0 rounded-full" style={{ background: tag.color }} />
                    <span className="truncate">{tag.name}</span>
                </span>
            ))}
        </div>
    );
}

export function CanvasNodeTagsPanel({ node, theme, onChange }: Omit<CanvasNodeTagsPanelProps, "open" | "onToggle">) {
    const { t } = useTranslation();
    const [draft, setDraft] = useState("");
    const [adding, setAdding] = useState(false);
    const selected = new Set(node.metadata?.tags || []);
    const keywords = node.metadata?.keywords || [];

    const addKeyword = () => {
        const value = draft.trim();
        if (!value || keywords.includes(value)) {
            setDraft("");
            setAdding(false);
            return;
        }
        onChange({ keywords: [...keywords, value] });
        setDraft("");
        setAdding(false);
    };

    return (
        <div
            data-canvas-no-zoom
            data-canvas-shortcuts-ignore
            className="w-[220px] rounded-2xl border py-3 shadow-2xl backdrop-blur"
            style={{ background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
        >
            <div className="px-3 text-[11px] font-medium" style={{ color: theme.node.muted }}>
                {t("canvas.nodeTags.title")}
            </div>
            <div className="mt-2 flex flex-col">
                {CANVAS_TAG_PRESETS.map((tag) => {
                    const active = selected.has(tag.id);
                    return (
                        <button
                            key={tag.id}
                            type="button"
                            className="flex h-9 items-center gap-2.5 px-3 text-left text-[13px] transition hover:bg-black/5 dark:hover:bg-white/10"
                            style={{ color: theme.node.text, background: active ? "color-mix(in srgb, currentColor 8%, transparent)" : undefined }}
                            onClick={() => {
                                const next = active ? (node.metadata?.tags || []).filter((id) => id !== tag.id) : [...(node.metadata?.tags || []), tag.id];
                                onChange({ tags: next });
                            }}
                        >
                            <span className="size-2.5 shrink-0 rounded-full" style={{ background: tag.color }} />
                            <span className="truncate">{t(`canvas.nodeTags.presets.${tag.id}`)}</span>
                        </button>
                    );
                })}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 border-t px-3 pt-2" style={{ borderColor: theme.node.stroke }}>
                <span className="text-[11px]" style={{ color: theme.node.muted }}>
                    {t("canvas.nodeTags.keywords")}
                </span>
                {adding ? (
                    <input
                        autoFocus
                        value={draft}
                        maxLength={24}
                        className="h-7 min-w-0 flex-1 rounded-md bg-transparent px-1 text-[12px] outline-none"
                        style={{ color: theme.node.text }}
                        placeholder={t("canvas.nodeTags.keywordPlaceholder")}
                        onChange={(event) => setDraft(event.target.value)}
                        onBlur={addKeyword}
                        onKeyDown={(event) => {
                            event.stopPropagation();
                            if (event.key === "Enter") {
                                event.preventDefault();
                                addKeyword();
                            }
                            if (event.key === "Escape") {
                                setDraft("");
                                setAdding(false);
                            }
                        }}
                    />
                ) : (
                    <button type="button" className="flex h-7 items-center gap-1 rounded-full px-2 text-[11px] transition hover:bg-black/5 dark:hover:bg-white/10" style={{ color: theme.node.text }} onClick={() => setAdding(true)}>
                        <Plus className="size-3" />
                        {t("canvas.nodeTags.add")}
                    </button>
                )}
            </div>
            {keywords.length ? (
                <div className="mt-2 flex flex-wrap gap-1 px-3">
                    {keywords.map((keyword) => (
                        <button
                            key={keyword}
                            type="button"
                            className="rounded-full px-2 py-0.5 text-[11px] transition hover:bg-black/5 dark:hover:bg-white/10"
                            style={{ color: theme.node.muted, background: "color-mix(in srgb, currentColor 8%, transparent)" }}
                            title={t("canvas.nodeTags.removeKeyword")}
                            onClick={() => onChange({ keywords: keywords.filter((item) => item !== keyword) })}
                        >
                            {keyword}
                        </button>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

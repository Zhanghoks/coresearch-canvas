import { AlertTriangle, ArrowUp, Compass, FilePenLine, GitBranch, HelpCircle, Lightbulb, Maximize2, MessageSquare, Plus, Scale, Sparkles, Sprout, Wrench, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { attachResearchNodeToAgent } from "@/lib/canvas/research-node-agent";
import { getResearchContract } from "@/lib/canvas/research-node-contract";
import { isImeComposing, isPlainEnterKey } from "@/lib/keyboard-event";
import { useAgentStore } from "@/stores/use-agent-store";
import { CanvasNodeType, type ResearchFlowNodeType } from "@/types/canvas";
import type { CanvasNodeContext } from "@/types/canvas-plugin";
import { isDocumentSkeleton } from "@research-headings";

export const RESEARCH_FLOW_META: Record<ResearchFlowNodeType, { color: string; Icon: LucideIcon }> = {
    // Desaturated accents so cards sit in the canvas instead of glowing against it.
    [CanvasNodeType.Seed]: { color: "#6f9b7c", Icon: Sprout },
    [CanvasNodeType.Direction]: { color: "#6d91ad", Icon: Compass },
    [CanvasNodeType.ResearchQuestion]: { color: "#7a7eb8", Icon: HelpCircle },
    [CanvasNodeType.Problem]: { color: "#c4895c", Icon: AlertTriangle },
    [CanvasNodeType.Hypothesis]: { color: "#9a7db8", Icon: Lightbulb },
    [CanvasNodeType.Approach]: { color: "#5f9a90", Icon: GitBranch },
    [CanvasNodeType.Method]: { color: "#8a9a5e", Icon: Wrench },
    [CanvasNodeType.Evaluation]: { color: "#b8974a", Icon: Scale },
    [CanvasNodeType.Idea]: { color: "#b67a94", Icon: Sparkles },
};

export function researchFlowIcon(type: ResearchFlowNodeType, className = "size-5"): ReactNode {
    const Icon = RESEARCH_FLOW_META[type].Icon;
    return <Icon className={className} />;
}

function EditableTextArea({ value, placeholder, color, placeholderColor, onChange, autoEdit = false }: { value: string; placeholder: string; color: string; placeholderColor: string; onChange: (value: string) => void; autoEdit?: boolean }) {
    const [editing, setEditing] = useState(autoEdit);
    const textStyle = { flex: 1, minHeight: 0, fontSize: 14, lineHeight: 1.55, color } as React.CSSProperties;

    if (editing) {
        return (
            <textarea
                autoFocus
                value={value}
                placeholder={placeholder}
                onChange={(e) => onChange(e.target.value)}
                onBlur={() => {
                    setEditing(false);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                onWheel={(e) => e.stopPropagation()}
                style={{ ...textStyle, width: "100%", resize: "none", border: "none", outline: "none", background: "transparent" }}
            />
        );
    }
    return (
        <div onClick={() => setEditing(true)} onDoubleClick={(e) => e.stopPropagation()} style={{ ...textStyle, overflow: "auto", whiteSpace: "pre-wrap", cursor: "text" }}>
            {value || <span style={{ color: placeholderColor }}>{placeholder}</span>}
        </div>
    );
}

function ResearchTryButton({ label, color, onClick, children }: { label: string; color: string; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            className="flex h-10 w-full shrink-0 items-center gap-2.5 rounded-xl px-3 text-left text-[13px] transition hover:bg-black/[0.07] dark:hover:bg-white/10"
            style={{ color, background: "color-mix(in srgb, currentColor 8%, transparent)" }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={onClick}
        >
            {children}
            <span className="truncate">{label}</span>
        </button>
    );
}

function ResearchCardStatus({ ctx }: { ctx: CanvasNodeContext }) {
    const { t } = useTranslation();
    if (!ctx.isSelected) return null;
    const confirmed = ctx.node.metadata?.researchWorkflow?.decision === "saved";
    const emptySkeleton = isDocumentSkeleton(typeof ctx.node.metadata?.document === "string" ? ctx.node.metadata.document : "");
    if (!confirmed && !emptySkeleton) return null;
    return (
        <div className="mt-2 flex shrink-0 flex-wrap gap-x-2 text-[10px] leading-4" style={{ color: ctx.theme.node.muted }}>
            {confirmed ? <span>{t("canvas.researchNodes.statusConfirmed")}</span> : null}
            {emptySkeleton ? <span>{t("canvas.researchNodes.statusEmptyDocument")}</span> : null}
        </div>
    );
}

export function ResearchCardContent({ ctx }: { ctx: CanvasNodeContext }) {
    const { t } = useTranslation();
    const type = ctx.node.type as ResearchFlowNodeType;
    const meta = RESEARCH_FLOW_META[type];
    const Icon = meta.Icon;
    const summary = ctx.node.metadata?.summary || "";
    const contract = getResearchContract(type)!;
    const direction = type === CanvasNodeType.Direction ? ctx.node.metadata?.direction : undefined;
    const [drafting, setDrafting] = useState(false);

    if (!summary && !drafting) {
        return (
            <div data-canvas-no-zoom className="flex h-full min-h-0 w-full flex-col items-stretch justify-between box-border px-4 pb-5 pt-6">
                <div className="grid min-h-0 flex-1 place-items-center overflow-hidden">
                    <Icon className="size-16 max-h-full max-w-full opacity-[0.18]" strokeWidth={1.1} style={{ color: ctx.theme.node.text }} />
                </div>
                <div className="mt-3 flex shrink-0 flex-col gap-2">
                    <div className="text-xs leading-5" style={{ color: ctx.theme.node.muted }}>
                        {t("canvas.researchNodes.tryLabel")}
                    </div>
                    <ResearchTryButton label={t("canvas.researchNodes.tryWrite")} color={ctx.theme.node.text} onClick={() => setDrafting(true)}>
                        <FilePenLine className="size-3.5 shrink-0 opacity-60" />
                    </ResearchTryButton>
                    <ResearchTryButton
                        label={t("canvas.researchNodes.tryAskAgent")}
                        color={ctx.theme.node.text}
                        onClick={() => {
                            ctx.openPanel();
                            requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>(`textarea[data-research-prompt="${ctx.node.id}"]`)?.focus());
                        }}
                    >
                        <MessageSquare className="size-3.5 shrink-0 opacity-60" />
                    </ResearchTryButton>
                    {contract.actions.slice(0, 2).map((action) => (
                        <ResearchTryButton key={action} label={action} color={ctx.theme.node.text} onClick={() => sendResearchNodePrompt(ctx, action)}>
                            <Sparkles className="size-3.5 shrink-0 opacity-60" />
                        </ResearchTryButton>
                    ))}
                </div>
            </div>
        );
    }

    if (direction) {
        return (
            <div data-canvas-no-zoom className="flex h-full w-full flex-col box-border p-4">
                <div className="mb-3 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: ctx.theme.node.muted }}>
                    <span>L{direction.level} · Direction</span>
                    <span>{direction.subDirections.length} branches</span>
                </div>
                <EditableTextArea value={summary} placeholder={t("canvas.researchNodes.summaryPlaceholder")} color={ctx.theme.node.text} placeholderColor={ctx.theme.node.placeholder} onChange={(value) => ctx.updateMetadata({ summary: value })} />
                <div className="mt-3 flex shrink-0 flex-wrap gap-1.5">
                    {direction.includes.slice(0, 6).map((item) => (
                        <span key={item} className="rounded-full border px-2 py-1 text-[10px]" style={{ borderColor: ctx.theme.node.stroke, color: ctx.theme.node.muted }}>
                            {item}
                        </span>
                    ))}
                </div>
                <ResearchCardStatus ctx={ctx} />
            </div>
        );
    }

    return (
        <div data-canvas-no-zoom className="flex h-full w-full flex-col box-border p-4">
            <p className="mb-3 shrink-0 text-[11px] leading-5" style={{ color: ctx.theme.node.muted }}>
                {contract.question}
            </p>
            <EditableTextArea value={summary} placeholder={contract.question} color={ctx.theme.node.text} placeholderColor={ctx.theme.node.placeholder} autoEdit={drafting && !summary} onChange={(value) => ctx.updateMetadata({ summary: value })} />
            {summary.trim() ? (
                <button
                    type="button"
                    className="mt-3 flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg px-3 text-xs font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
                    style={{ color: ctx.theme.node.text }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={() => ctx.openPanel()}
                >
                    <Compass className="size-3.5" />
                    继续研究
                </button>
            ) : null}
            <ResearchCardStatus ctx={ctx} />
        </div>
    );
}

function sendResearchNodePrompt(ctx: CanvasNodeContext, promptText: string) {
    const trimmed = promptText.trim();
    if (!trimmed) return;
    attachResearchNodeToAgent(ctx.node, { prompt: trimmed, send: true });
}

export function ResearchPromptPanel({ ctx, onClose }: { ctx: CanvasNodeContext; onClose: () => void }) {
    const { t } = useTranslation();
    const [expanded, setExpanded] = useState(false);
    const [draftKey, setDraftKey] = useState(0);
    const [hasText, setHasText] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const composingRef = useRef(false);
    const contract = getResearchContract(ctx.node.type)!;
    const agentModel = useAgentStore((state) => state.models.find((item) => item.id === state.model)?.displayName || state.model);
    const minTextHeight = expanded ? 120 : 44;
    const maxTextHeight = expanded ? 280 : 160;

    const readDraft = () => textareaRef.current?.value ?? "";

    const fitTextarea = () => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(maxTextHeight, Math.max(minTextHeight, el.scrollHeight))}px`;
    };

    const syncHasText = () => {
        setHasText(Boolean(readDraft().trim()));
        fitTextarea();
    };

    useEffect(() => {
        fitTextarea();
    }, [draftKey, expanded, maxTextHeight, minTextHeight]);

    const submit = () => {
        const trimmed = readDraft().trim();
        if (!trimmed) return;
        sendResearchNodePrompt(ctx, trimmed);
        setDraftKey((key) => key + 1);
        setHasText(false);
    };

    return (
        <div
            data-canvas-no-zoom
            data-canvas-shortcuts-ignore
            className="rounded-2xl border px-3 pb-2 pt-2.5 shadow-2xl backdrop-blur"
            style={{ width: expanded ? 560 : 420, background: ctx.theme.node.panel, borderColor: ctx.theme.node.stroke, color: ctx.theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
        >
            <textarea
                key={draftKey}
                ref={textareaRef}
                data-research-prompt={ctx.node.id}
                autoFocus
                defaultValue=""
                onInput={syncHasText}
                onCompositionStart={() => {
                    composingRef.current = true;
                }}
                onCompositionEnd={() => {
                    composingRef.current = false;
                    syncHasText();
                }}
                onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Escape") {
                        event.preventDefault();
                        onClose();
                        return;
                    }
                    if (composingRef.current || isImeComposing(event)) return;
                    if (isPlainEnterKey(event)) {
                        event.preventDefault();
                        submit();
                    }
                }}
                placeholder={t("canvas.researchNodes.promptPlaceholder")}
                rows={expanded ? 5 : 2}
                className="thin-scrollbar w-full resize-none overflow-y-auto bg-transparent px-0.5 text-sm leading-5 outline-none"
                style={{ color: ctx.theme.node.text, minHeight: minTextHeight, height: minTextHeight }}
            />
            {contract.actions.length ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                    {contract.actions.map((action) => (
                        <button
                            key={action}
                            type="button"
                            className="h-7 rounded-full px-2.5 text-xs transition hover:bg-black/5 dark:hover:bg-white/10"
                            style={{ color: ctx.theme.node.muted }}
                            onClick={() => sendResearchNodePrompt(ctx, action)}
                        >
                            {action}
                        </button>
                    ))}
                </div>
            ) : null}
            <div className="mt-1.5 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-0.5">
                    <button
                        type="button"
                        className="grid size-8 shrink-0 place-items-center rounded-full border border-dashed opacity-70 transition hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10"
                        style={{ borderColor: ctx.theme.node.stroke, color: ctx.theme.node.muted }}
                        title={t("canvas.researchNodes.attachHint")}
                        onClick={() => useAgentStore.getState().openPanel()}
                    >
                        <Plus className="size-3.5" />
                    </button>
                    <span className="max-w-[168px] truncate px-1.5 text-xs" style={{ color: ctx.theme.node.faint }}>
                        {agentModel || t("canvas.researchNodes.promptHint")}
                    </span>
                    <button
                        type="button"
                        className="grid size-8 shrink-0 place-items-center rounded-full opacity-60 transition hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10"
                        style={{ color: ctx.theme.node.muted }}
                        aria-label={t("canvas.researchNodes.expandPrompt")}
                        onClick={() => setExpanded((value) => !value)}
                    >
                        <Maximize2 className="size-3.5" />
                    </button>
                </div>
                <button
                    type="button"
                    onClick={submit}
                    disabled={!hasText}
                    aria-label={t("canvas.researchNodes.sendPrompt")}
                    className="grid size-8 shrink-0 place-items-center rounded-full transition disabled:opacity-35"
                    style={hasText ? { background: ctx.theme.node.text, color: ctx.theme.node.panel } : { color: ctx.theme.node.muted }}
                >
                    <ArrowUp className="size-3.5" />
                </button>
            </div>
        </div>
    );
}

export function NoteContent({ ctx }: { ctx: CanvasNodeContext }) {
    const { t } = useTranslation();
    const content = ctx.node.metadata?.content || "";
    return (
        <div data-canvas-no-zoom style={{ height: "100%", width: "100%", display: "flex", padding: 14, boxSizing: "border-box" }}>
            <EditableTextArea value={content} placeholder={t("canvas.researchNodes.notePlaceholder")} color={ctx.theme.node.text} placeholderColor={ctx.theme.node.placeholder} onChange={(value) => ctx.updateMetadata({ content: value })} />
        </div>
    );
}

export function QuestionContent({ ctx }: { ctx: CanvasNodeContext }) {
    const { t } = useTranslation();
    const summary = ctx.node.metadata?.summary || "";
    return (
        <div data-canvas-no-zoom style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", gap: 8, padding: 14, boxSizing: "border-box" }}>
            <EditableTextArea value={summary} placeholder={t("canvas.researchNodes.questionPlaceholder")} color={ctx.theme.node.text} placeholderColor={ctx.theme.node.placeholder} onChange={(value) => ctx.updateMetadata({ summary: value })} />
            <span style={{ fontSize: 11, color: ctx.theme.node.placeholder }}>{t("canvas.researchNodes.questionHint")}</span>
        </div>
    );
}

export function SourceLinkContent({ ctx }: { ctx: CanvasNodeContext }) {
    const { t } = useTranslation();
    const sourceUrl = ctx.node.metadata?.sourceUrl || "";
    const isPdf = ctx.node.type === CanvasNodeType.Pdf;
    return (
        <div data-canvas-no-zoom style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", gap: 8, padding: 14, boxSizing: "border-box", color: ctx.theme.node.text }}>
            <input
                value={sourceUrl}
                placeholder={isPdf ? t("canvas.researchNodes.pdfPlaceholder") : t("canvas.researchNodes.webPlaceholder")}
                onChange={(e) => ctx.updateMetadata({ sourceUrl: e.target.value })}
                onMouseDown={(e) => e.stopPropagation()}
                style={{ border: `1px solid ${ctx.theme.node.stroke}`, borderRadius: 8, background: "transparent", color: ctx.theme.node.text, fontSize: 12, padding: "6px 8px", outline: "none" }}
            />
            {sourceUrl ? (
                <a href={sourceUrl} target="_blank" rel="noreferrer" onMouseDown={(e) => e.stopPropagation()} style={{ fontSize: 11, color: ctx.theme.toolbar.activeText, wordBreak: "break-all" }}>
                    {sourceUrl}
                </a>
            ) : (
                <span style={{ fontSize: 11, color: ctx.theme.node.placeholder }}>{t("canvas.researchNodes.sourceEmpty")}</span>
            )}
        </div>
    );
}

export function FrameContent({ ctx }: { ctx: CanvasNodeContext }) {
    return (
        <div className="pointer-events-none flex h-full w-full items-start p-3" style={{ color: ctx.theme.node.muted }}>
            <span className="truncate text-xs font-semibold uppercase tracking-wide">{ctx.node.title}</span>
        </div>
    );
}

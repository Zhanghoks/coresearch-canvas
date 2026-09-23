import { useRef, useState, type ReactNode } from "react";
import { Button, Dropdown, Tooltip } from "antd";
import { ArrowUp, Check, ChevronUp, Cpu, Gauge, Hand, ImagePlus, LoaderCircle, RefreshCw, Square, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { canvasThemes } from "@/lib/canvas-theme";
import { useAgentStore, type AgentCanvasReference, type AgentModel, type AgentReasoningEffort } from "@/stores/use-agent-store";
import { canvasReferenceIcon } from "./agent-canvas-reference-preview";
import type { AgentChatAttachment } from "./agent-chat-message";
import { AgentChatPromptInput } from "./agent-chat-prompt-input";
import { agentReferenceMarker } from "./agent-chat-inline-tokens";

export function AgentChatComposer({
    prompt,
    attachments = [],
    disabled,
    sending,
    placeholder,
    theme,
    onPromptChange,
    onSubmit,
    onStop,
    onAddFiles,
    onRemoveAttachment,
    confirmTools,
    onConfirmToolsChange,
    models,
    model,
    reasoningEffort,
    onModelChange,
    onReasoningEffortChange,
    left,
}: {
    prompt: string;
    attachments?: AgentChatAttachment[];
    disabled?: boolean;
    sending?: boolean;
    placeholder: string;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    onPromptChange: (value: string) => void;
    onSubmit: () => void;
    onStop?: () => void;
    onAddFiles?: (files: FileList | File[] | null) => void | Promise<void>;
    onRemoveAttachment?: (id: string) => void;
    confirmTools?: boolean;
    onConfirmToolsChange?: (confirmTools: boolean) => void;
    models?: AgentModel[];
    model?: string;
    reasoningEffort?: AgentReasoningEffort | "";
    onModelChange?: (model: string) => void;
    onReasoningEffortChange?: (effort: AgentReasoningEffort) => void;
    left?: ReactNode;
}) {
    const { t } = useTranslation();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const canvasReferences = useAgentStore((state) => state.canvasReferences);
    const draftReferences = canvasReferences.filter((item) => !prompt.includes(agentReferenceMarker(item)));
    const canSubmit = !disabled && !sending && Boolean(prompt.trim() || attachments.length || canvasReferences.length);
    const removeReference = (nodeId: string) => {
        const state = useAgentStore.getState();
        useAgentStore.getState().setAgentState({ canvasReferences: state.canvasReferences.filter((item) => item.nodeId !== nodeId) });
    };
    return (
        <div className="px-4 pb-3 pt-1.5" onWheelCapture={(event) => event.stopPropagation()}>
            <div className="rounded-2xl border px-2.5 pb-2 pt-2 backdrop-blur-xl" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, boxShadow: "0 10px 28px rgba(0,0,0,.08)" }}>
                {draftReferences.length ? (
                    <div className="mb-2 flex flex-col gap-1.5">
                        {draftReferences.map((item) => <CanvasReferenceChip key={item.nodeId} reference={item} theme={theme} disabled={disabled || sending} onRemove={() => removeReference(item.nodeId)} />)}
                    </div>
                ) : null}
                {attachments.length ? (
                    <div className="thin-scrollbar mb-2 flex gap-2 overflow-x-auto pb-1">
                        {attachments.map((item) => (
                            <div key={item.id} className="group relative size-12 shrink-0 overflow-hidden rounded-lg border" style={{ borderColor: theme.node.stroke }} title={item.name}>
                                <img src={item.url} alt={item.name} className="size-full object-cover" />
                                {onRemoveAttachment ? (
                                    <button type="button" className="absolute right-1 top-1 grid size-5 place-items-center rounded-full border opacity-0 shadow-sm transition group-hover:opacity-100" style={{ background: theme.toolbar.panel, borderColor: theme.node.stroke, color: theme.node.text }} onClick={() => onRemoveAttachment(item.id)} aria-label={t("agent.composer.removeImage")}>
                                        <X className="size-3" />
                                    </button>
                                ) : null}
                            </div>
                        ))}
                    </div>
                ) : null}
                <AgentChatPromptInput value={prompt} disabled={disabled || sending} placeholder={placeholder} theme={theme} onChange={onPromptChange} onSubmit={() => { if (canSubmit) void onSubmit(); }} onAddFiles={onAddFiles} />
                <div className="@container mt-1.5 flex items-center justify-between gap-1.5">
                    <div className="flex min-w-0 items-center gap-0.5">
                        {onAddFiles ? (
                            <>
                                <input ref={fileInputRef} hidden type="file" accept="image/*" multiple onChange={(event) => {
                                    void onAddFiles(event.target.files);
                                    event.target.value = "";
                                }} />
                                <Tooltip title={t("agent.composer.uploadImage")}>
                                    <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" disabled={disabled || sending} style={{ color: theme.node.muted }} icon={<ImagePlus className="size-3.5" />} onClick={() => fileInputRef.current?.click()} aria-label={t("agent.composer.uploadImage")} />
                                </Tooltip>
                            </>
                        ) : null}
                        {onConfirmToolsChange ? <ToolConfirmationMenu confirmTools={Boolean(confirmTools)} theme={theme} onChange={onConfirmToolsChange} /> : null}
                        {models?.length && model && onModelChange ? <AgentModelControls models={models} model={model} reasoningEffort={reasoningEffort} onModelChange={onModelChange} onReasoningEffortChange={onReasoningEffortChange} /> : null}
                        {left}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        {sending && onStop ? (
                            <Tooltip title={t("agent.composer.stop")} placement="top"><Button danger shape="circle" className="!h-8 !w-8 !min-w-8" icon={<Square className="size-3.5" />} onClick={() => void onStop()} aria-label={t("agent.composer.stop")} /></Tooltip>
                        ) : (
                            <Tooltip title={t("agent.composer.send")} placement="top"><Button type="primary" shape="circle" className="!h-8 !w-8 !min-w-8" disabled={!canSubmit} icon={sending ? <LoaderCircle className="size-3.5 animate-spin" /> : <ArrowUp className="size-3.5" />} onClick={() => void onSubmit()} aria-label={t("agent.composer.send")} /></Tooltip>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function referenceExcerpt(reference: AgentCanvasReference) {
    const cleaned = (reference.text || "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .split("\n")
        .filter((line) => line.trim() && !/^\s*#{1,6}\s+/.test(line))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    if (!cleaned || cleaned === reference.title.trim()) return "";
    return cleaned.slice(0, 160);
}

function CanvasReferenceChip({ reference, theme, disabled, onRemove }: { reference: AgentCanvasReference; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; disabled?: boolean; onRemove: () => void }) {
    const { t } = useTranslation();
    const Icon = canvasReferenceIcon(reference.kind);
    const preview = referenceExcerpt(reference);
    return (
        <div className="flex min-w-0 items-start gap-2 rounded-xl border px-2.5 py-2" style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text }}>
            <Icon className="mt-0.5 size-4 shrink-0" style={{ color: theme.node.muted }} />
            <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium leading-5">{reference.title}</div>
                {preview ? <div className="line-clamp-2 text-xs leading-4" style={{ color: theme.node.muted }}>{preview}</div> : null}
            </div>
            <button type="button" className="grid size-5 shrink-0 place-items-center rounded-md transition hover:bg-black/5 disabled:opacity-40 dark:hover:bg-white/10" style={{ color: theme.node.muted }} disabled={disabled} onClick={onRemove} aria-label={t("agent.composer.removeReference")}>
                <X className="size-3" />
            </button>
        </div>
    );
}

function AgentModelControls({ models, model, reasoningEffort, onModelChange, onReasoningEffortChange }: { models: AgentModel[]; model: string; reasoningEffort?: AgentReasoningEffort | ""; onModelChange: (model: string) => void; onReasoningEffortChange?: (effort: AgentReasoningEffort) => void }) {
    const { t } = useTranslation();
    const current = models.find((item) => item.model === model) || models[0];
    const thinkingLevels = current.thinkingLevels?.length ? current.thinkingLevels : current.supportedReasoningEfforts.map((item) => item.reasoningEffort);
    const effortLabel = (effort: AgentReasoningEffort) => t(`agent.composer.effort.${effort}`);
    const [modelOpen, setModelOpen] = useState(false);
    const [reasoningOpen, setReasoningOpen] = useState(false);
    return (
        <div className="flex min-w-0 items-center gap-1">
            <Tooltip title={t("agent.composer.model", { model: current.displayName || current.model })} placement="top" open={modelOpen ? false : undefined}>
                <span className="inline-flex shrink-0">
                    <Select value={model} open={modelOpen} onOpenChange={setModelOpen} onValueChange={onModelChange}>
                        <SelectTrigger hideChevron className="h-8 w-8 min-w-8 justify-center gap-0 rounded-full border-0 bg-transparent px-0 text-xs font-medium shadow-none hover:bg-black/5 focus:ring-0 @min-[660px]:w-auto @min-[660px]:min-w-36 @min-[660px]:max-w-36 @min-[660px]:justify-start @min-[660px]:gap-1.5 @min-[660px]:px-2 dark:bg-transparent dark:hover:bg-white/10" aria-label={t("agent.composer.selectModel", { model: current.displayName || current.model })}>
                            <Cpu className="size-3.5 shrink-0 opacity-70" />
                            <span className="hidden min-w-0 flex-1 truncate text-left @min-[660px]:inline">{current.displayName || current.model}</span>
                            <ChevronUp className="hidden size-3 opacity-50 @min-[660px]:block" />
                        </SelectTrigger>
                        <SelectContent data-canvas-no-zoom position="popper" side="top" align="start" sideOffset={6} className="z-[1200] w-64 rounded-xl border border-border/70 bg-popover p-1 shadow-xl">
                            {models.map((item) => <SelectItem key={item.model} value={item.model}>{item.displayName || item.model}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </span>
            </Tooltip>
            {thinkingLevels.length > 0 && reasoningEffort && onReasoningEffortChange ? (
                <Tooltip title={t("agent.composer.reasoning", { effort: effortLabel(reasoningEffort) })} placement="top" open={reasoningOpen ? false : undefined}>
                    <span className="inline-flex shrink-0">
                        <Select value={reasoningEffort} open={reasoningOpen} onOpenChange={setReasoningOpen} onValueChange={(value) => onReasoningEffortChange(value as AgentReasoningEffort)}>
                            <SelectTrigger hideChevron className="h-8 w-8 min-w-8 justify-center gap-0 rounded-full border-0 bg-transparent px-0 text-xs font-medium shadow-none hover:bg-black/5 focus:ring-0 @min-[660px]:w-auto @min-[660px]:min-w-[4.5rem] @min-[660px]:justify-start @min-[660px]:gap-1.5 @min-[660px]:px-2 dark:bg-transparent dark:hover:bg-white/10" aria-label={t("agent.composer.selectReasoning", { effort: effortLabel(reasoningEffort) })}>
                                <Gauge className="size-3.5 opacity-70" />
                                <span className="hidden @min-[660px]:inline">{effortLabel(reasoningEffort)}</span>
                                <ChevronUp className="hidden size-3 opacity-50 @min-[660px]:block" />
                            </SelectTrigger>
                            <SelectContent data-canvas-no-zoom position="popper" side="top" align="start" sideOffset={6} className="z-[1200] min-w-32 rounded-xl border border-border/70 bg-popover p-1 shadow-xl">
                                {thinkingLevels.map((level) => <SelectItem key={level} value={level}>{effortLabel(level)}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </span>
                </Tooltip>
            ) : null}
        </div>
    );
}

function ToolConfirmationMenu({ confirmTools, theme, onChange }: { confirmTools: boolean; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onChange: (confirmTools: boolean) => void }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const mode = t(confirmTools ? "agent.composer.tools.manual" : "agent.composer.tools.automatic");
    return (
        <Dropdown
            trigger={["click"]}
            placement="topLeft"
            open={open}
            onOpenChange={setOpen}
            destroyOnHidden
            getPopupContainer={() => document.body}
            overlayClassName="z-[1300]"
            menu={{
                onClick: ({ key }) => {
                    setOpen(false);
                    onChange(key === "manual");
                },
                items: [
                    {
                        key: "manual",
                        label: <ConfirmationOption icon={<Hand className="size-4" />} title={t("agent.composer.tools.manual")} description={t("agent.composer.tools.manualDescription")} selected={confirmTools} />,
                    },
                    {
                        key: "automatic",
                        label: <ConfirmationOption icon={<RefreshCw className="size-4" />} title={t("agent.composer.tools.automatic")} description={t("agent.composer.tools.automaticDescription")} selected={!confirmTools} />,
                    },
                ],
            }}
        >
            <button
                type="button"
                title={open ? undefined : t("agent.composer.tools.label", { mode })}
                className="flex h-8 w-8 min-w-8 shrink-0 items-center justify-center gap-0 rounded-full px-0 text-xs font-medium transition hover:bg-black/5 @min-[660px]:w-auto @min-[660px]:min-w-0 @min-[660px]:justify-start @min-[660px]:gap-1.5 @min-[660px]:px-2 dark:hover:bg-white/10"
                style={{ color: theme.node.text }}
                aria-label={t("agent.composer.tools.select", { mode })}
                aria-expanded={open}
            >
                {confirmTools ? <Hand className="size-3.5" /> : <RefreshCw className="size-3.5" />}
                <span className="hidden @min-[660px]:inline">{mode}</span>
                <ChevronUp className="hidden size-3 opacity-50 @min-[660px]:block" />
            </button>
        </Dropdown>
    );
}

function ConfirmationOption({ icon, title, description, selected }: { icon: ReactNode; title: string; description: string; selected: boolean }) {
    return (
        <div className="flex min-w-64 items-start gap-3 py-1">
            <span className="mt-0.5 shrink-0">{icon}</span>
            <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{title}</span>
                <span className="mt-0.5 block text-xs leading-5 opacity-60">{description}</span>
            </span>
            {selected ? <Check className="mt-0.5 size-4 shrink-0" /> : null}
        </div>
    );
}

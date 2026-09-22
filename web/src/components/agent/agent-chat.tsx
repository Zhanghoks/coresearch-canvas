import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useSpring, useTransform } from "motion/react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { summarizeCanvasAgentOps } from "@/lib/canvas/canvas-agent-ops";
import { useAgentStore, type AgentChatItem, type AgentPendingApproval, type AgentPendingToolCall, type AgentTokenUsage } from "@/stores/use-agent-store";
import { useUserStore } from "@/stores/use-user-store";
import { AgentApprovalCard, AgentChatMessage, AgentCommandGroup, AgentPendingToolCard, AgentToolCard, AgentWorkingMessage } from "./agent-chat-message";
import { agentMessageToChatMessage, currentPlanMessage, hoistTurnUserMessages, isPlanMessage, latestPlanMessage, toolCallDetail, toolName, workingActivity } from "./agent-event-formatters";
import { AgentScrollToBottom } from "./agent-scroll-to-bottom";

const SCROLL_BOTTOM_THRESHOLD = 48;
const historyMessageStyle = { contentVisibility: "auto", containIntrinsicSize: "0 80px" } as const;

export function AgentChatTimeline({
    theme,
    pendingTool,
    pendingApprovals,
    sending,
    waiting,
    editingUserMessageId,
    onEditUserMessage,
    onRejectTool,
    onApproveTool,
    onApprovalDecision,
}: {
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    pendingTool: AgentPendingToolCall | null;
    pendingApprovals: AgentPendingApproval[];
    sending: boolean;
    waiting: boolean;
    editingUserMessageId?: string;
    onEditUserMessage?: (item: AgentChatItem) => void;
    onRejectTool: () => void;
    onApproveTool: () => void;
    onApprovalDecision: (approval: AgentPendingApproval, decision: "accept" | "acceptForSession" | "decline") => void;
}) {
    const { t } = useTranslation();
    const messages = useAgentStore((state) => state.messages);
    const orderedMessages = useMemo(() => hoistTurnUserMessages(messages), [messages]);
    const username = useUserStore((state) => state.user?.username || "test");
    const bootstrapStatus = useAgentStore((state) => state.bootstrapStatus);
    const mcpStartupStatuses = useAgentStore((state) => state.mcpStartupStatuses);
    const timeline = useMemo(() => groupTimelineMessages(orderedMessages), [orderedMessages]);
    const editingIndex = editingUserMessageId ? orderedMessages.findIndex((item) => item.id === editingUserMessageId) : -1;
    const listRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const followMessagesRef = useRef(true);
    const [showScrollToBottom, setShowScrollToBottom] = useState(false);
    const streaming = messages.some((message) => message.streamId);
    const showBootstrap = Boolean(bootstrapStatus && !messages.some((message) => message.role === "user" || message.role === "assistant"));
    const working = showBootstrap ? bootstrapStatus! : workingActivity(messages.at(-1));
    const updateScrollState = useCallback(() => {
        const list = listRef.current;
        if (!list) return;
        const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight <= SCROLL_BOTTOM_THRESHOLD;
        followMessagesRef.current = atBottom;
        setShowScrollToBottom(!atBottom);
    }, []);
    const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
        const list = listRef.current;
        if (!list) return;
        followMessagesRef.current = true;
        list.scrollTo({ top: list.scrollHeight, behavior });
        setShowScrollToBottom(false);
    }, []);
    useEffect(() => {
        const content = contentRef.current;
        if (!content) return;
        let frame = 0;
        const follow = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => (followMessagesRef.current ? scrollToBottom("auto") : updateScrollState()));
        };
        const observer = new ResizeObserver(follow);
        observer.observe(content);
        follow();
        return () => {
            observer.disconnect();
            cancelAnimationFrame(frame);
        };
    }, [scrollToBottom, updateScrollState]);
    return (
        <div className="relative min-h-0 flex-1">
            <div ref={listRef} className="thin-scrollbar h-full select-text overflow-y-auto" onScroll={updateScrollState}>
                <div ref={contentRef} className="space-y-3 px-4 pt-4 pb-2">
                    {!timeline.length && !pendingTool && !pendingApprovals.length && !sending && !waiting && !showBootstrap ? (
                        <DocumentOrDefaultWelcome theme={theme} name={username} />
                    ) : null}
                    {timeline.map((entry) => {
                        if (entry.type === "commands") return <AgentCommandGroupRow key={entry.id} items={entry.items} theme={theme} />;
                        const messageIndex = orderedMessages.findIndex((item) => item.id === entry.item.id);
                        const dimmed = editingIndex >= 0 && messageIndex > editingIndex;
                        const canEdit = entry.item.role === "user" && Boolean(entry.item.turnId) && !sending && !waiting && Boolean(onEditUserMessage);
                        return (
                            <AgentChatMessageRow
                                key={entry.item.id}
                                item={entry.item}
                                theme={theme}
                                editing={editingUserMessageId === entry.item.id}
                                dimmed={dimmed}
                                onEdit={canEdit ? () => onEditUserMessage?.(entry.item) : undefined}
                            />
                        );
                    })}
                    {pendingTool ? (
                        <AgentPendingToolCard
                            summary={summarizeCanvasAgentOps(pendingTool.input?.ops || []) || toolName(pendingTool.name)}
                            detail={toolCallDetail(pendingTool.name, pendingTool.input, "pending")}
                            theme={theme}
                            onReject={onRejectTool}
                            onApprove={onApproveTool}
                        />
                    ) : null}
                    {pendingApprovals.map((approval) => <AgentApprovalCard key={approval.requestId} approval={approval} theme={theme} onDecision={(decision) => onApprovalDecision(approval, decision)} />)}
                    {(sending || waiting || showBootstrap) && !streaming && !pendingTool && !pendingApprovals.length ? <AgentWorkingMessage text={working.text} detail={"detail" in working && typeof working.detail === "string" ? working.detail : undefined} status={showBootstrap ? bootstrapStatus?.status : undefined} mcpStatuses={showBootstrap ? Object.entries(mcpStartupStatuses).map(([name, item]) => ({ name, ...item })) : []} activityKey={working.key} theme={theme} /> : null}
                </div>
            </div>
            {showScrollToBottom ? (
                <AgentScrollToBottom theme={theme} title={t("agent.chat.latestMessages")} onClick={() => scrollToBottom()} />
            ) : null}
        </div>
    );
}

export function AgentTaskProgress({ theme, busy }: { theme: (typeof canvasThemes)[keyof typeof canvasThemes]; busy: boolean }) {
    const { t } = useTranslation();
    const plan = useAgentStore((state) => busy ? currentPlanMessage(state.messages) : latestPlanMessage(state.messages));
    if (!plan) return null;
    return (
        <div className="shrink-0 px-4 pt-2">
            <AgentToolCard key={plan.id} title={plan.title || t("agent.events.progress")} text={plan.text} detail={plan.detail} theme={theme} />
        </div>
    );
}

const AgentChatMessageRow = memo(function AgentChatMessageRow({ item, theme, editing, dimmed, onEdit }: { item: AgentChatItem; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; editing?: boolean; dimmed?: boolean; onEdit?: () => void }) {
    const endpoint = useAgentStore((state) => state.url);
    const token = useAgentStore((state) => state.token);
    return (
        <div style={item.streamId ? undefined : historyMessageStyle}>
            <AgentChatMessage item={agentMessageToChatMessage(item, endpoint, token)} theme={theme} editing={editing} dimmed={dimmed} onEdit={onEdit} />
        </div>
    );
});

const AgentCommandGroupRow = memo(function AgentCommandGroupRow({ items, theme }: { items: AgentChatItem[]; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    return (
        <div style={items.some((item) => item.streamId) ? undefined : historyMessageStyle}>
            <AgentCommandGroup items={items} theme={theme} />
        </div>
    );
});

type AgentTimelineEntry = { type: "message"; item: AgentChatItem } | { type: "commands"; id: string; items: AgentChatItem[] };

function groupTimelineMessages(messages: AgentChatItem[]) {
    const timeline: AgentTimelineEntry[] = [];
    let commands: AgentChatItem[] = [];
    let commandScope = "";
    const flushCommands = () => {
        if (!commands.length) return;
        timeline.push({ type: "commands", id: `commands:${commands[0].id}`, items: commands });
        commands = [];
        commandScope = "";
    };
    messages.forEach((item) => {
        if (isPlanMessage(item)) return;
        if (isCommandMessage(item)) {
            const scope = item.threadId && item.turnId ? `${item.threadId}\0${item.turnId}` : item.id;
            if (commands.length && scope !== commandScope) flushCommands();
            commands.push(item);
            commandScope = scope;
            return;
        }
        flushCommands();
        timeline.push({ type: "message", item });
    });
    flushCommands();
    return timeline;
}

function isCommandMessage(item: AgentChatItem) {
    return item.role === "tool" && item.detail && typeof item.detail === "object" && (item.detail as { kind?: unknown }).kind === "command";
}

export function AgentUsageBar({ usage, theme }: { usage: AgentTokenUsage; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    const { t } = useTranslation();
    return (
        <div className="flex items-center justify-center gap-4 px-4 pb-1 pt-1.5 text-[11px] tabular-nums" style={{ color: theme.node.muted }}>
            <span className="opacity-70">{t("agent.chat.latestCall")}</span>
            <UsageNumber label={t("agent.chat.input")} value={usage.input} color={theme.node.text} />
            <UsageNumber label={t("agent.chat.cached")} value={usage.cached} color={theme.node.text} />
            <UsageNumber label={t("agent.chat.output")} value={usage.output} color={theme.node.text} />
        </div>
    );
}

function DocumentOrDefaultWelcome({ theme, name }: { theme: (typeof canvasThemes)[keyof typeof canvasThemes]; name: string }) {
    const { t } = useTranslation();
    const documentSession = useAgentStore((state) => state.documentSession);
    if (!documentSession) {
        return (
            <div className="pb-3 pt-2">
                <span className="grid size-10 place-items-center rounded-xl text-xs font-semibold" style={{ background: theme.toolbar.itemHover }}>CR</span>
                <h2 className="mt-4 text-xl font-semibold tracking-[-0.025em]">{t("agent.chat.welcome", { name })}</h2>
                <p className="mt-1 text-sm leading-6" style={{ color: theme.node.muted }}>{t("agent.chat.welcomeDescription")}</p>
            </div>
        );
    }
    return (
        <div className="pb-3 pt-2">
            <span className="grid size-10 place-items-center rounded-xl text-xs font-semibold" style={{ background: theme.toolbar.itemHover }}>文</span>
            <h2 className="mt-4 text-xl font-semibold tracking-[-0.025em]">{t("agent.chat.documentWelcome", { name })}</h2>
            <p className="mt-1 text-sm leading-6" style={{ color: theme.node.muted }}>{t("agent.chat.documentWelcomeDescription", { title: documentSession.title || t("canvas.node.untitled") })}</p>
            <p className="mt-3 text-sm leading-6" style={{ color: theme.node.text }}>{t("agent.chat.documentWelcomeHint")}</p>
            <p className="mt-4 text-sm font-medium">{t("agent.chat.documentHelpTitle")}</p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-6" style={{ color: theme.node.muted }}>
                <li>{t("agent.chat.documentHelpRewrite")}</li>
                <li>{t("agent.chat.documentHelpPolish")}</li>
                <li>{t("agent.chat.documentHelpLocal")}</li>
                <li>{t("agent.chat.documentHelpFull")}</li>
            </ul>
        </div>
    );
}

function UsageNumber({ label, value, color }: { label: string; value: number; color: string }) {
    const spring = useSpring(value, { stiffness: 110, damping: 24, mass: 0.7 });
    const text = useTransform(spring, (current) => Math.round(current).toLocaleString());
    useEffect(() => spring.set(value), [spring, value]);
    return (
        <span className="inline-flex items-baseline gap-1" aria-label={`${label} ${value.toLocaleString()}`}>
            <span>{label}</span>
            <motion.span aria-hidden className="font-medium" style={{ color }}>
                {text}
            </motion.span>
        </span>
    );
}

import { useEffect, useState } from "react";
import { Button } from "antd";
import { ChevronDown, ChevronRight, Link2, PlugZap } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import type { AgentProviderStatus, AgentSearchApiStatus } from "@/services/api/canvas-agent";

export function AgentConnectView({
    theme,
    url,
    enabled,
    connected,
    activity,
    connectError,
    providers,
    searchApis,
    hasModels,
    onDisconnect,
    onRetry,
}: {
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    url: string;
    enabled: boolean;
    connected: boolean;
    activity: string;
    connectError: string;
    providers: AgentProviderStatus[];
    searchApis: AgentSearchApiStatus[];
    hasModels: boolean;
    onDisconnect: () => void;
    onRetry: () => void;
}) {
    const { t } = useTranslation();
    const statusText = connectError ? t("agent.status.failed") : connected ? activity : enabled ? t("agent.status.connecting") : t("agent.status.disconnected");
    const statusColor = connectError ? "#dc2626" : connected ? "#16a34a" : enabled ? "#d97706" : theme.node.muted;
    const [manualOpen, setManualOpen] = useState(Boolean(connectError));
    useEffect(() => {
        if (connectError) setManualOpen(true);
    }, [connectError]);
    return (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
            <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                            <span className="shrink-0 text-base font-semibold leading-6">{t("agent.connect.title")}</span>
                            <span
                                className="inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] leading-4"
                                style={{ borderColor: connected || enabled || connectError ? statusColor : theme.node.stroke, color: statusColor }}
                            >
                                <span className="size-1.5 shrink-0 rounded-full" style={{ background: statusColor }} />
                                <span className="truncate">{statusText}</span>
                            </span>
                        </div>
                        <div className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>
                            {t("agent.connect.description")}
                        </div>
                    </div>
                    {connectError ? (
                        <Button className="!h-8 !px-3" type="primary" icon={<PlugZap className="size-4" />} onClick={onRetry}>
                            {t("agent.connect.retry")}
                        </Button>
                    ) : connected ? (
                        <Button className="!h-8 !px-3" icon={<PlugZap className="size-4" />} onClick={onDisconnect}>
                            {t("agent.connect.disconnect")}
                        </Button>
                    ) : null}
                </div>
                {connected && url ? (
                    <div className="flex items-center gap-1.5 text-xs leading-5" style={{ color: theme.node.muted }}>
                        <Link2 className="size-3.5 shrink-0" />
                        <span className="truncate">{url}</span>
                    </div>
                ) : null}
                {connectError ? (
                    <div className="rounded-md border px-2.5 py-2 text-xs leading-5" style={{ borderColor: "rgba(220,38,38,.35)", color: "#dc2626" }}>
                        {connectError}
                    </div>
                ) : null}
                {!connected && !enabled && !connectError ? (
                    <div className="rounded-md border px-2.5 py-2 text-xs leading-5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
                        {t("agent.connect.autoPending")}
                    </div>
                ) : null}
                <div className="grid gap-2.5 border-t pt-4" style={{ borderColor: theme.node.stroke }}>
                    <div>
                        <div className="text-sm font-medium">{t("agent.connect.modelsStatusTitle")}</div>
                        <div className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>
                            {t("agent.connect.modelsAutoHint")}
                        </div>
                    </div>
                    {!connected ? (
                        <div className="text-xs leading-5" style={{ color: theme.node.muted }}>{t("agent.connect.statusAfterConnect")}</div>
                    ) : hasModels ? (
                        <div className="text-xs leading-5" style={{ color: "#16a34a" }}>{t("agent.connect.modelsReady")}</div>
                    ) : (
                        <div className="rounded-md border px-2.5 py-2 text-xs leading-5" style={{ borderColor: "rgba(217,119,6,.4)", color: "#d97706" }}>
                            {t("agent.connect.modelsMissing")}
                        </div>
                    )}
                    {connected && providers.length ? (
                        <ul className="grid gap-1 text-xs leading-5" style={{ color: theme.node.muted }}>
                            {providers.map((item) => (
                                <li key={item.id} className="flex items-center justify-between gap-2">
                                    <span>{item.name}</span>
                                    <span style={{ color: item.configured ? "#16a34a" : theme.node.faint }}>
                                        {t(item.configured ? "agent.connect.configured" : "agent.connect.notConfigured")}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    ) : configuredProviders.length ? null : null}
                </div>
                <div className="grid gap-2 border-t pt-4" style={{ borderColor: theme.node.stroke }}>
                    <div className="text-sm font-medium">{t("agent.connect.searchTitle")}</div>
                    <div className="text-xs leading-5" style={{ color: theme.node.muted }}>{t("agent.connect.searchAutoHint")}</div>
                    {connected && searchApis.length ? (
                        <ul className="mt-1 grid gap-1 text-xs leading-5" style={{ color: theme.node.muted }}>
                            {searchApis.map((api) => (
                                <li key={api.id} className="flex items-start justify-between gap-2">
                                    <span>{api.name}</span>
                                    <span className="shrink-0 text-right" style={{ color: api.kind === "none" || api.configured ? "#16a34a" : theme.node.faint }}>
                                        {t(api.kind === "none" ? "agent.connect.searchNoKey" : api.configured ? "agent.connect.configured" : "agent.connect.searchUnset")}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    ) : null}
                </div>
                {connectError ? (
                    <button
                        type="button"
                        className="flex items-center gap-1 text-xs font-medium transition hover:opacity-80"
                        style={{ color: theme.node.muted }}
                        onClick={() => setManualOpen((open) => !open)}
                    >
                        {manualOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                        {t("agent.connect.manualConnect")}
                    </button>
                ) : null}
                {connectError && manualOpen ? (
                    <div className="rounded-md border px-2.5 py-2 text-xs leading-5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
                        {t("agent.connect.manualHint")}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

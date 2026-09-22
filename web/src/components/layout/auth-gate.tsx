import { useState } from "react";
import { Button, Input } from "antd";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";

export function AuthGate() {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const signIn = useUserStore((state) => state.signIn);
    const registerWithInvite = useUserStore((state) => state.registerWithInvite);
    const [mode, setMode] = useState<"signin" | "invite">("signin");
    const [nickname, setNickname] = useState("");
    const [password, setPassword] = useState("");
    const [inviteCode, setInviteCode] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const submit = async () => {
        setSubmitting(true);
        setError("");
        try {
            if (mode === "invite") await registerWithInvite(inviteCode, nickname, password);
            else await signIn(nickname, password);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : t("auth.failed"));
        } finally {
            setSubmitting(false);
        }
    };

    const canSubmit = nickname.trim() && password && (mode === "signin" || inviteCode.trim());

    return (
        <div className="flex h-dvh w-full items-center justify-center px-6" style={{ background: theme.canvas.background, color: theme.node.text }}>
            <div className="w-full max-w-[380px]">
                <div className="flex items-center gap-2.5">
                    <span className="grid size-8 place-items-center rounded-xl bg-blue-500 text-[11px] font-bold text-white">CR</span>
                    <div>
                        <div className="text-base font-semibold tracking-tight">{t("meta.title")}</div>
                        <div className="text-xs" style={{ color: theme.node.muted }}>{t("auth.gateDescription")}</div>
                    </div>
                </div>
                <div className="mt-8 rounded-2xl border px-5 py-5" style={{ background: theme.node.panel, borderColor: theme.node.stroke }}>
                    <h1 className="text-lg font-semibold">{t(mode === "invite" ? "auth.inviteTitle" : "auth.title")}</h1>
                    <div className="mt-4 flex flex-col gap-3">
                        {mode === "invite" ? (
                            <Input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} placeholder={t("auth.inviteCode")} autoComplete="off" />
                        ) : null}
                        <Input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder={t("auth.nickname")} autoComplete="username" />
                        <Input.Password value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t("auth.password")} autoComplete={mode === "invite" ? "new-password" : "current-password"} onPressEnter={() => void submit()} />
                        {error ? <div className="text-sm text-red-600">{error}</div> : null}
                        <Button type="primary" loading={submitting} disabled={!canSubmit} onClick={() => void submit()}>
                            {t(mode === "invite" ? "auth.register" : "auth.signIn")}
                        </Button>
                    </div>
                    <button
                        type="button"
                        className="mt-4 text-sm underline-offset-2 hover:underline"
                        style={{ color: theme.node.muted }}
                        onClick={() => { setMode(mode === "invite" ? "signin" : "invite"); setError(""); }}
                    >
                        {t(mode === "invite" ? "auth.backToSignIn" : "auth.needInvite")}
                    </button>
                </div>
            </div>
        </div>
    );
}

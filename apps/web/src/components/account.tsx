import React, { useState } from "react";
import {
  Briefcase,
  Building2,
  Users,
  Target,
  Shield,
  Globe,
  ArrowUpLeft,
} from "lucide-react";
import { Button } from "../../../../packages/ui/src/button";
import { api } from "../api";
type Row = { id: string; [key: string]: any };
export function Empty({
  fa,
  title,
  onClick,
  action,
}: {
  fa: boolean;
  title: string;
  onClick?: () => void;
  action?: string;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Briefcase size={28} />
      </div>
      <h3>{title}</h3>
      <p>
        {fa
          ? "اطلاعات واقعی تیم شما اینجا نمایش داده می‌شود."
          : "Your team’s real data will appear here."}
      </p>
      {onClick && (
        <button className="text-button" onClick={onClick}>
          {action}
          <Plus size={15} />
        </button>
      )}
    </div>
  );
}
export function Auth({
  fa,
  onUser,
  setLang,
}: {
  fa: boolean;
  onUser: (u: Row) => Promise<void>;
  setLang: () => void;
}) {
  const [mode, setMode] = useState("login"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const tr = (a: string, b: string) => (fa ? a : b);
  return (
    <div className="auth">
      <section className="auth-story">
        <div className="brand">
          <div className="brand-icon">
            <Briefcase />
          </div>
          <span>
            {tr("مدار", "Madar")}
            <small>CRM WORKSPACE</small>
          </span>
        </div>
        <div>
          <span className="auth-kicker">
            {tr(
              "ارتباط بهتر. رشد بیشتر.",
              "BETTER CONNECTIONS. GREATER GROWTH.",
            )}
          </span>
          <h1>
            {tr("هر ارتباط،", "Every connection,")}
            <br />
            {tr("یک فرصت تازه.", "a new opportunity.")}
          </h1>
          <p>
            {tr(
              "مشتریان، تیم و فروش شما؛ در یک فضای کاری منظم، مستقل و امن.",
              "Your customers, team and sales in one organized, independent and secure workspace.",
            )}
          </p>
          <div className="auth-graphic">
            <div className="graphic-node">
              <Building2 size={30} />
            </div>
            <div className="graphic-node">
              <Users size={27} />
            </div>
            <div className="graphic-node">
              <Target size={27} />
            </div>
            <div className="graphic-line" />
          </div>
        </div>
        <small>
          {tr(
            "برای کسب‌وکارهایی که به آینده فکر می‌کنند",
            "For businesses that think ahead",
          )}
        </small>
      </section>
      <section className="auth-form">
        <button className="lang-switch" onClick={setLang}>
          <Globe size={17} />
          {fa ? "English" : "فارسی"}
        </button>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const b = Object.fromEntries(new FormData(e.currentTarget));
            try {
              const r = await api("/auth/" + mode, "POST", b);
              await onUser(r.user);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="eyebrow">
            {tr("فضای کاری هوشمند شما", "YOUR BUSINESS WORKSPACE")}
          </div>
          <h2>
            {tr(
              mode === "login" ? "خوش آمدید" : "شروع یک مسیر تازه",
              mode === "login" ? "Welcome back" : "Start something great",
            )}
          </h2>
          <p>
            {tr(
              mode === "login"
                ? "برای ادامه وارد حساب خود شوید."
                : "حساب بسازید و شرکت خود را راه‌اندازی کنید.",
              mode === "login"
                ? "Sign in to continue to your workspace."
                : "Create an account and set up your organization.",
            )}
          </p>
          {mode === "register" && (
            <label>
              {tr("نام و نام خانوادگی", "Full name")}
              <input name="name" required autoComplete="name" />
            </label>
          )}
          <label>
            {tr("ایمیل کاری", "Work email")}
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              dir="ltr"
              placeholder="you@company.com"
            />
          </label>
          <label>
            {tr("رمز عبور", "Password")}
            <input
              type="password"
              name="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              dir="ltr"
            />
            <small>{tr("حداقل ۱۲ کاراکتر", "At least 12 characters")}</small>
          </label>
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          <Button disabled={busy} type="submit">
            {busy
              ? tr("در حال اتصال…", "Connecting…")
              : tr(
                  mode === "login" ? "ورود به فضای کاری" : "ایجاد حساب",
                  mode === "login" ? "Sign in" : "Create account",
                )}
            <ArrowUpLeft size={17} />
          </Button>
          <div className="auth-switch">
            {tr(
              mode === "login" ? "حساب ندارید؟" : "قبلاً ثبت‌نام کرده‌اید؟",
              mode === "login" ? "New here?" : "Already have an account?",
            )}{" "}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
              }}
            >
              {tr(
                mode === "login" ? "ثبت‌نام کنید" : "وارد شوید",
                mode === "login" ? "Create account" : "Sign in",
              )}
            </button>
          </div>
          <div className="auth-security">
            <Shield size={15} />
            {tr(
              "داده‌های هر شرکت، مستقل و محافظت‌شده",
              "Independent and protected organization data",
            )}
          </div>
        </form>
      </section>
    </div>
  );
}

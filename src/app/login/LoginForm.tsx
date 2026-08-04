"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertIcon, ArrowRightIcon, LockIcon, ShieldIcon, UserIcon } from "@/components/icons";
import { checkCredentialsAndMaybeSendOtp, completeLoginAction } from "@/app/actions/mfa-actions";

type Step = "credentials" | "otp";

/** Only ever follow a same-origin, relative callbackUrl — anything else (an
 * absolute URL or a protocol-relative "//host" one) gets dropped in favor of
 * the default. Prevents an attacker-crafted /login?callbackUrl=https://evil
 * link from hard-navigating a just-authenticated user off-site. */
function safeCallbackUrl(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

const fieldClass =
  "w-full rounded-lg border border-line bg-white py-3 pl-11 pr-4 text-[13.5px] text-navy-900 placeholder:text-navy-400 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/12";

/** Input with a muted icon in the leading gutter, plus room for an optional
 * trailing control (the password Show/Hide toggle). */
function IconField({
  icon,
  trailing,
  ...props
}: { icon: ReactNode; trailing?: ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-navy-400">{icon}</span>
      <input {...props} className={`${fieldClass} ${trailing ? "pr-20" : ""}`} />
      {trailing}
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <span className="mb-1.5 block text-[12.5px] font-semibold text-navy-900">{children}</span>;
}

function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-brand-50 px-3 py-2.5 text-[12.5px] font-medium text-brand-700">
      <AlertIcon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /> {children}
    </p>
  );
}

function SubmitButton({ loading, children, label }: { loading: boolean; children: ReactNode; label: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-3.5 text-[14px] font-bold text-white shadow-cta transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:bg-navy-400 disabled:shadow-none"
    >
      {loading ? label : children}
    </button>
  );
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = safeCallbackUrl(searchParams.get("callbackUrl"));

  const [step, setStep] = useState<Step>("credentials");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function completeSignIn(mfaCode?: string) {
    const result = await completeLoginAction({
      username: username.trim(),
      password,
      mfaCode: mfaCode ?? "",
      trustDevice: mfaCode ? trustDevice : false,
    });

    if (result.status === "mfa_required") {
      setStep("otp");
      setNotice("Enter the 6-digit code we emailed you.");
      return;
    }
    if (result.status === "mfa_invalid") {
      setError("That code is invalid or has expired.");
      return;
    }
    if (result.status === "rate_limited") {
      setError("Too many attempts. Wait a few minutes and try again.");
      return;
    }
    if (result.status === "invalid_credentials") {
      setError("Invalid Prognosis username or password.");
      return;
    }

    router.push(callbackUrl);
    router.refresh();
  }

  async function handleCredentialsSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!username.trim()) {
      setError("Username or email is required.");
      return;
    }
    if (!password) {
      setError("Password is required.");
      return;
    }

    setLoading(true);
    try {
      const check = await checkCredentialsAndMaybeSendOtp(username.trim(), password);
      if (check.status === "invalid_credentials") {
        setError("Invalid Prognosis username or password.");
        return;
      }
      if (check.status === "rate_limited") {
        setError("Too many attempts. Wait a few minutes and try again.");
        return;
      }
      if (check.status === "no_email_on_file") {
        setError("MFA is enabled on your account but no email is on file. Contact the IT Help Desk.");
        return;
      }
      if (check.status === "otp_sent") {
        setStep("otp");
        setNotice("We emailed you a 6-digit code. It expires in 10 minutes.");
        return;
      }
      // no_mfa_needed — this device already completed MFA and is trusted
      await completeSignIn();
    } catch {
      // An unexpected server-side error (as opposed to a normal typed
      // CredentialsCheckResult) previously left the button silently
      // reverting to "Sign In" with no feedback at all — the finally below
      // always ran, but nothing here ever called setError for a throw.
      setError("Something went wrong signing in. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleOtpSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!/^\d{6}$/.test(code.trim())) {
      setError("Enter the 6-digit code.");
      return;
    }

    setLoading(true);
    try {
      await completeSignIn(code.trim());
    } catch {
      setError("Something went wrong verifying that code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError(null);
    setLoading(true);
    try {
      const check = await checkCredentialsAndMaybeSendOtp(username.trim(), password);
      if (check.status === "rate_limited") {
        setError("Too many code requests. Wait a few minutes and try again.");
        return;
      }
      setNotice(check.status === "otp_sent" ? "We sent a new code to your email." : "Enter the 6-digit code we emailed you.");
    } catch {
      setError("Something went wrong requesting a new code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const card = "rounded-2xl border border-line-subtle bg-white px-8 py-9 shadow-panel";

  if (step === "otp") {
    return (
      <form onSubmit={handleOtpSubmit} className={card}>
        <div className="text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-50 text-accent">
            <ShieldIcon className="h-6 w-6" />
          </span>
          <h2 className="mt-4 text-[22px] font-bold text-navy-900">Verify it&apos;s you</h2>
          <p className="mt-1.5 text-[13px] text-navy-600">{notice ?? "Enter the 6-digit code we emailed you."}</p>
        </div>

        <label className="mt-7 block">
          <Label>Verification Code</Label>
          <input
            className="w-full rounded-lg border border-line bg-white py-3 text-center text-[22px] font-bold tracking-[0.4em] text-navy-900 placeholder:font-normal placeholder:tracking-[0.3em] placeholder:text-navy-300 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/12"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
          />
        </label>

        <label className="mt-4 flex items-center gap-2.5 text-[12.5px] text-navy-600">
          <input
            type="checkbox"
            checked={trustDevice}
            onChange={(e) => setTrustDevice(e.target.checked)}
            className="h-4 w-4 rounded border-line text-accent accent-accent focus:ring-accent"
          />
          Trust this device for 45 days
        </label>

        {error && <div className="mt-4">{<ErrorNote>{error}</ErrorNote>}</div>}

        <div className="mt-6">
          <SubmitButton loading={loading} label="Verifying…">
            Verify &amp; Sign In <ArrowRightIcon className="h-[17px] w-[17px]" />
          </SubmitButton>
        </div>

        <div className="mt-5 flex items-center justify-between text-[12.5px]">
          <button
            type="button"
            onClick={() => {
              setStep("credentials");
              setCode("");
              setError(null);
              setNotice(null);
            }}
            className="font-semibold text-navy-500 hover:text-navy-900"
          >
            ← Back
          </button>
          <button type="button" onClick={handleResend} disabled={loading} className="font-semibold text-accent hover:text-accent-600">
            Resend code
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleCredentialsSubmit} className={card}>
      <div className="text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-50 text-accent">
          <LockIcon className="h-6 w-6" />
        </span>
        <h2 className="mt-4 text-[22px] font-bold text-navy-900">Welcome back</h2>
        <p className="mt-1.5 text-[13px] text-navy-600">Sign in with your Leadway Health staff credentials</p>
      </div>

      <label className="mt-7 block">
        <Label>Username or Email</Label>
        <IconField
          icon={<UserIcon className="h-[18px] w-[18px]" />}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter your username or email"
          autoComplete="username"
        />
      </label>

      <label className="mt-4 block">
        <Label>Password</Label>
        <IconField
          icon={<LockIcon className="h-[18px] w-[18px]" />}
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter your password"
          autoComplete="current-password"
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 px-4 text-[12.5px] font-semibold text-navy-500 hover:text-navy-900"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          }
        />
      </label>

      {error && <div className="mt-4">{<ErrorNote>{error}</ErrorNote>}</div>}

      <div className="mt-6">
        <SubmitButton loading={loading} label="Signing in…">
          Sign In <ArrowRightIcon className="h-[17px] w-[17px]" />
        </SubmitButton>
      </div>
    </form>
  );
}

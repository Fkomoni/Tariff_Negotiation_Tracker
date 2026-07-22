"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { inputClass } from "@/components/ui";
import { AlertIcon } from "@/components/icons";
import { checkCredentialsAndMaybeSendOtp } from "@/app/actions/mfa-actions";

type Step = "credentials" | "otp";

/** Only ever follow a same-origin, relative callbackUrl — anything else (an
 * absolute URL or a protocol-relative "//host" one) gets dropped in favor of
 * the default. Prevents an attacker-crafted /login?callbackUrl=https://evil
 * link from hard-navigating a just-authenticated user off-site. */
function safeCallbackUrl(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
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
    const result = await signIn("credentials", {
      username: username.trim(),
      password,
      mfaCode: mfaCode ?? "",
      trustDevice: mfaCode ? String(trustDevice) : "false",
      redirect: false,
    });

    if (result?.code === "mfa_required") {
      setStep("otp");
      setNotice("Enter the 6-digit code we emailed you.");
      return;
    }
    if (result?.code === "mfa_invalid") {
      setError("That code is invalid or has expired.");
      return;
    }
    if (result?.code === "rate_limited") {
      setError("Too many attempts. Wait a few minutes and try again.");
      return;
    }
    if (result?.error) {
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

  if (step === "otp") {
    return (
      <form onSubmit={handleOtpSubmit} className="w-full max-w-[420px] space-y-5">
        <div>
          <h2 className="text-[26px] font-bold text-white">Verify it&apos;s you</h2>
          <p className="mt-1 text-[13.5px] text-ink-300">{notice ?? "Enter the 6-digit code we emailed you."}</p>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-200">Verification Code</span>
          <input
            className={`${inputClass} text-center text-[20px] tracking-[0.4em]`}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
          />
        </label>

        <label className="flex items-center gap-2 text-[12.5px] text-ink-300">
          <input
            type="checkbox"
            checked={trustDevice}
            onChange={(e) => setTrustDevice(e.target.checked)}
            className="h-4 w-4 rounded border-ink-400"
          />
          Trust this device for 45 days
        </label>

        {error && (
          <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-brand-400">
            <AlertIcon className="h-3.5 w-3.5 flex-shrink-0" /> {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-brand py-2.5 text-[13.5px] font-semibold text-white shadow-glow transition-colors hover:bg-brand-600 disabled:opacity-60"
        >
          {loading ? "Verifying…" : "Verify & Sign In"}
        </button>

        <div className="flex items-center justify-between text-[12.5px]">
          <button
            type="button"
            onClick={() => {
              setStep("credentials");
              setCode("");
              setError(null);
              setNotice(null);
            }}
            className="font-semibold text-ink-400 hover:text-ink-200"
          >
            ← Back
          </button>
          <button type="button" onClick={handleResend} disabled={loading} className="font-semibold text-ink-200 hover:text-white">
            Resend code
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleCredentialsSubmit} className="w-full max-w-[420px] space-y-5">
      <div>
        <h2 className="text-[26px] font-bold text-white">Sign in to your account</h2>
        <p className="mt-1 text-[13.5px] text-ink-300">Use your Leadway Health staff credentials</p>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-200">Username or Email</span>
        <input
          className={inputClass}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="e.g. f-komoni-mbaekwe"
          autoComplete="username"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-200">Password</span>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            className={`${inputClass} pr-16`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute inset-y-0 right-0 px-3 text-[12px] font-semibold text-ink-500 hover:text-ink-800"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </label>

      {error && (
        <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-brand-400">
          <AlertIcon className="h-3.5 w-3.5 flex-shrink-0" /> {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-brand py-2.5 text-[13.5px] font-semibold text-white shadow-glow transition-colors hover:bg-brand-600 disabled:opacity-60"
      >
        {loading ? "Signing in…" : "Sign In"}
      </button>

      <p className="text-center text-[12.5px] text-ink-400">
        Trouble signing in? Contact <span className="font-semibold text-ink-200">IT Help Desk</span>
      </p>
    </form>
  );
}

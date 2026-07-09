"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { inputClass } from "@/components/ui";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!username.trim()) {
      setError("Username or email is required.");
      return;
    }
    if (!password) {
      setError("Password is required.");
      return;
    }

    setLoading(true);
    const result = await signIn("credentials", {
      username: username.trim(),
      password,
      redirect: false,
    });
    setLoading(false);

    if (result?.error) {
      setError("Invalid Prognosis username or password.");
      return;
    }

    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-[420px] space-y-5">
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
        <input
          type="password"
          className={inputClass}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </label>

      {error && (
        <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-brand-400">
          <span aria-hidden>⚠</span> {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-brand py-3 text-[14px] font-bold text-white shadow-glow transition-colors hover:bg-brand-600 disabled:opacity-60"
      >
        {loading ? "Signing in…" : "Sign In"}
      </button>

      <p className="text-center text-[12.5px] text-ink-400">
        Trouble signing in? Contact <span className="font-semibold text-ink-200">IT Help Desk</span>
      </p>
    </form>
  );
}

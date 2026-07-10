import { Suspense } from "react";
import Image from "next/image";
import { LoginForm } from "./LoginForm";

const FEATURES = [
  "Log every provider tariff negotiation request",
  "Track delay time from log to resolution in real time",
  "Notify members automatically when care may be delayed",
  "Full audit trail & reporting",
];

export default function LoginPage() {
  return (
    <div className="flex min-h-screen bg-ink-950">
      <div className="hidden w-[46%] flex-col justify-between px-14 py-14 lg:flex">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 items-center rounded-xl bg-white px-3 py-2 shadow-glow">
              <Image src="/leadway-logo.png" alt="Leadway Health" width={1370} height={453} className="h-6 w-auto" />
            </div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Staff Portal</p>
          </div>

          <h1 className="mt-16 text-[42px] font-extrabold leading-[1.1] text-white">
            Provider Tariff
            <br />
            <span className="text-brand-400">Negotiation</span>
            <br />
            Tracker
          </h1>
          <p className="mt-6 max-w-md text-[14.5px] leading-relaxed text-ink-300">
            Logging every provider negotiation request end-to-end — from contact centre intake through
            provider review, agreed tariff, and member notification.
          </p>

          <ul className="mt-10 space-y-4">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-3 text-[13.5px] text-ink-200">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand" />
                {f}
              </li>
            ))}
          </ul>
        </div>

        <p className="max-w-sm text-[11.5px] leading-relaxed text-ink-500">
          Authorised personnel only. All access is logged and monitored. For access issues contact the IT
          Help Desk.
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center px-6 py-14">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}

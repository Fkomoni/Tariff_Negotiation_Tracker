import { Suspense } from "react";
import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LoginForm } from "./LoginForm";
import { BellIcon, ClockIcon, LogIcon, ReportIcon, ShieldIcon, HeadsetIcon } from "@/components/icons";

const FEATURES = [
  { icon: LogIcon, label: "Log every provider tariff negotiation request" },
  { icon: ClockIcon, label: "Track delay time from log to resolution in real time" },
  { icon: BellIcon, label: "Notify members automatically when care may be delayed" },
  { icon: ReportIcon, label: "Full audit trail & reporting" },
];

/** Faint dot grid used in the corners of both panels. Inline so it stays a
 * single request and inherits the surrounding colour. */
function DotGrid({ className = "", tone = "rgba(255,255,255,0.16)" }: { className?: string; tone?: string }) {
  return (
    <svg className={className} width="180" height="120" viewBox="0 0 180 120" fill="none" aria-hidden>
      {Array.from({ length: 6 }).map((_, row) =>
        Array.from({ length: 9 }).map((_, col) => (
          <circle key={`${row}-${col}`} cx={4 + col * 21} cy={4 + row * 21} r="2" fill={tone} />
        ))
      )}
    </svg>
  );
}

/** Line-art hospital, mirroring the reference art bottom-left of the panel. */
function HospitalArt({ className = "" }: { className?: string }) {
  const stroke = "rgba(232,119,34,0.42)";
  return (
    <svg className={className} viewBox="0 0 300 150" fill="none" aria-hidden>
      <g stroke={stroke} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        {/* Main block with a cross sign above the entrance. */}
        <rect x="108" y="52" width="84" height="88" rx="2.5" />
        <rect x="140" y="30" width="20" height="20" rx="2.5" />
        <path d="M150 34v12M144 40h12" />
        <text x="150" y="24" fill={stroke} stroke="none" fontSize="8.5" textAnchor="middle" letterSpacing="1.6">
          HOSPITAL
        </text>
        {/* Windows, then a taller doorway centred at the base. */}
        <path d="M120 66h12M144 66h12M168 66h12M120 88h12M144 88h12M168 88h12M120 110h12M168 110h12" />
        <rect x="141" y="108" width="18" height="32" rx="1.5" />
        {/* Trees either side, kept low so they read as a skyline. */}
        <path d="M62 140c0-10 7-17 15-17s15 7 15 17" />
        <path d="M77 123v-9" />
        <path d="M208 140c0-10 7-17 15-17s15 7 15 17" />
        <path d="M223 123v-9" />
        <path d="M30 140c0-7 5-12 11-12s11 5 11 12" />
        <path d="M248 140c0-7 5-12 11-12s11 5 11 12" />
      </g>
    </svg>
  );
}

export default async function LoginPage() {
  // Real check against the database, not just the middleware's cookie-
  // presence check - a stale cookie from an already-expired session must
  // still land here, not bounce to /dashboard and back.
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="flex min-h-screen bg-surface-page">
      {/* Left: navy brand panel. Hidden below lg so the form gets the full
          width on a phone rather than being pushed below a tall banner. */}
      <div className="relative hidden w-[51%] flex-col overflow-hidden bg-navy-900 lg:flex">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full bg-navy-800/50 blur-[2px]" />
          <DotGrid className="absolute right-16 top-16" />
          {/* Orange arc kept to the lower third so it never crosses the
              heading or the feature list, with the dot sitting on it. */}
          <svg className="absolute bottom-0 left-0 h-[34%] w-full" viewBox="0 0 700 240" fill="none" preserveAspectRatio="none" aria-hidden>
            <path d="M-30 240C90 150 300 66 730 40" stroke="#E87722" strokeWidth="1.4" opacity="0.7" />
            {/* Sits on the curve: the cubic evaluated at t≈0.45. Kept in the
                same stretched viewBox as the path so it tracks it at any
                panel size - the slight oval from the non-uniform scale is
                imperceptible at this radius. */}
            <circle cx="198" cy="127" r="4.5" fill="#E87722" />
          </svg>
          <HospitalArt className="absolute bottom-[13%] left-[42%] w-[32%] opacity-90" />
        </div>

        <div className="relative flex flex-1 flex-col px-14 py-12">
          <div className="flex items-center gap-4">
            <div className="flex h-[62px] items-center rounded-xl bg-white px-4 shadow-panel">
              <Image src="/leadway-logo.png" alt="Leadway Health" width={1370} height={453} unoptimized className="h-8 w-auto" />
            </div>
            <span className="h-9 w-px bg-white/25" />
            <p className="text-[12.5px] font-bold uppercase tracking-[0.13em] text-white/85">Staff Portal</p>
          </div>

          <div className="mt-16">
            <h1 className="text-[44px] font-extrabold leading-[1.08] tracking-tight text-white">
              Provider Tariff
              <br />
              <span className="text-accent">Negotiation</span>
              <br />
              Tracker
            </h1>
            <span className="mt-6 block h-[3px] w-16 rounded-full bg-accent" />
            <p className="mt-6 max-w-[27rem] text-[14px] leading-relaxed text-navy-200">
              Logging every provider negotiation request end-to-end - from contact centre intake through provider review,
              agreed tariff, and member notification.
            </p>
          </div>

          <ul className="mt-11 space-y-4">
            {FEATURES.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-4">
                <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-accent">
                  <Icon className="h-[19px] w-[19px]" />
                </span>
                <span className="text-[13.5px] text-white/90">{label}</span>
              </li>
            ))}
          </ul>

          <div className="mt-auto flex items-start gap-3.5 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-accent">
              <ShieldIcon className="h-[18px] w-[18px]" />
            </span>
            <p className="text-[11.5px] leading-relaxed text-navy-300">
              Authorised personnel only. All access is logged and monitored.
              <br />
              For access issues contact the IT Help Desk.
            </p>
          </div>
        </div>
      </div>

      {/* Right: the form itself. */}
      <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-14">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -right-32 -top-40 h-[380px] w-[380px] rounded-full bg-navy-900/[0.04]" />
          <div className="absolute -bottom-32 -right-24 h-[300px] w-[300px] rounded-full bg-navy-900/[0.03]" />
          <DotGrid className="absolute bottom-10 right-8" tone="rgba(26,26,46,0.12)" />
        </div>

        <div className="relative w-full max-w-[452px]">
          <Suspense>
            <LoginForm />
          </Suspense>

          <p className="mt-7 flex items-center justify-center gap-2 text-[12.5px] text-navy-600">
            <HeadsetIcon className="h-[17px] w-[17px] text-accent" />
            Trouble signing in? Contact <span className="font-semibold text-accent">IT Help Desk</span>
          </p>
        </div>
      </div>
    </div>
  );
}

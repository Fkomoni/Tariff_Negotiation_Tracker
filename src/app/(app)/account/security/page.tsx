import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { Card, CardHeader, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ShieldIcon } from "@/components/icons";
import { formatDateTime } from "@/lib/domain";
import {
  requestEnableMfaCode,
  confirmEnableMfa,
  disableMfa,
  revokeTrustedDevice,
} from "@/app/actions/mfa-actions";

export default async function AccountSecurityPage({
  searchParams,
}: {
  searchParams: { error?: string; codeSent?: string; enabled?: string; disabled?: string };
}) {
  const session = await auth();
  if (!session?.user) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { trustedDevices: { orderBy: { createdAt: "desc" } } },
  });
  if (!user) return null;

  const activeTrustedDevices = user.trustedDevices.filter((d) => d.expiresAt > new Date());

  return (
    <>
      <Header
        title="Account Security"
        subtitle="Manage multi-factor authentication for your own account"
        icon={<ShieldIcon />}
        user={{ name: session.user.name ?? session.user.prognosisUsername, role: session.user.role }}
      />

      <div className="flex-1 space-y-4 px-8 py-8">
        {searchParams.error && (
          <p className="rounded-lg bg-brand-50 px-3.5 py-2.5 text-[12.5px] font-medium text-brand-700">
            {searchParams.error}
          </p>
        )}
        {searchParams.enabled && (
          <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3.5 py-2.5 text-[12.5px] font-medium text-emerald-700">
            <span aria-hidden>✓</span> MFA is now enabled on your account.
          </p>
        )}
        {searchParams.disabled && (
          <p className="rounded-lg bg-ink-100 px-3.5 py-2.5 text-[12.5px] font-medium text-ink-700">
            MFA has been disabled on your account.
          </p>
        )}

        <Card>
          <CardHeader
            title="Multi-Factor Authentication"
            subtitle="Adds a 6-digit email code to sign-in, on top of your Prognosis password"
          />
          <div className="space-y-4 px-5 py-4">
            <p className="text-[12.5px] text-ink-500">
              Status:{" "}
              <span className={`font-bold ${user.mfaEnabled ? "text-emerald-600" : "text-ink-500"}`}>
                {user.mfaEnabled ? "Enabled" : "Disabled"}
              </span>
              {user.email && <span className="text-ink-400"> · codes are sent to {user.email}</span>}
            </p>

            {!user.mfaEnabled && !searchParams.codeSent && (
              <form action={requestEnableMfaCode}>
                <SubmitButton pendingLabel="Sending code…">Enable MFA</SubmitButton>
              </form>
            )}

            {!user.mfaEnabled && searchParams.codeSent && (
              <form action={confirmEnableMfa} className="flex items-end gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                    Enter the code we emailed you
                  </span>
                  <input
                    name="code"
                    required
                    maxLength={6}
                    inputMode="numeric"
                    placeholder="000000"
                    className={`${inputClass} w-40 text-center tracking-[0.3em]`}
                  />
                </label>
                <SubmitButton pendingLabel="Confirming…">Confirm & Enable</SubmitButton>
                <form action={requestEnableMfaCode}>
                  <SubmitButton variant="ghost" pendingLabel="Sending…">
                    Resend code
                  </SubmitButton>
                </form>
              </form>
            )}

            {user.mfaEnabled && (
              <form action={disableMfa} className="flex items-end gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                    Enter your password to disable
                  </span>
                  <input type="password" name="password" required className={`${inputClass} w-56`} autoComplete="current-password" />
                </label>
                <SubmitButton
                  variant="danger"
                  pendingLabel="Disabling…"
                  confirmMessage="Disable MFA on your account? Anyone with your password alone will be able to sign in."
                >
                  Disable MFA
                </SubmitButton>
              </form>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Trusted Devices"
            subtitle="Browsers you chose to trust for 90 days after completing an MFA challenge"
          />
          {activeTrustedDevices.length === 0 ? (
            <p className="px-5 py-4 text-[12.5px] text-ink-400">No trusted devices on record.</p>
          ) : (
            <div className="divide-y divide-ink-100">
              {activeTrustedDevices.map((d) => (
                <div key={d.id} className="flex items-center justify-between px-5 py-3">
                  <div className="text-[12.5px]">
                    <p className="font-semibold text-ink-800">Trusted since {formatDateTime(d.createdAt)}</p>
                    <p className="text-ink-400">
                      Last used {formatDateTime(d.lastUsedAt)} · expires {formatDateTime(d.expiresAt)}
                    </p>
                  </div>
                  <form action={revokeTrustedDevice}>
                    <input type="hidden" name="deviceId" value={d.id} />
                    <SubmitButton variant="ghost" className="px-2 py-1.5 text-brand-600 hover:bg-brand-50" pendingLabel="Revoking…">
                      Revoke
                    </SubmitButton>
                  </form>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

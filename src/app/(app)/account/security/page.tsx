import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { Card, CardHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ShieldIcon } from "@/components/icons";
import { formatDateTime } from "@/lib/domain";
import { revokeTrustedDevice } from "@/app/actions/mfa-actions";

export default async function AccountSecurityPage() {
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
        subtitle="Multi-factor authentication and trusted devices"
        icon={<ShieldIcon />}
        user={{ name: session.user.name ?? session.user.prognosisUsername, role: session.user.role }}
      />

      <div className="flex-1 space-y-4 px-8 py-8">
        <Card>
          <CardHeader
            title="Multi-Factor Authentication"
            subtitle="Required for every account — a 6-digit email code on top of your Prognosis password"
          />
          <div className="px-5 py-4">
            <p className="text-[12.5px] text-ink-500">
              Status: <span className="font-bold text-emerald-600">Required</span>
              {user.email ? (
                <span className="text-ink-400"> · codes are sent to {user.email}</span>
              ) : (
                <span className="font-semibold text-brand-600"> · no email on file — contact the IT Help Desk, you won&apos;t be able to sign in without one</span>
              )}
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Trusted Devices"
            subtitle="Browsers you chose to trust for 45 days after completing an MFA challenge"
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

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { Card, CardHeader, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfigIcon } from "@/components/icons";
import { ROLE_LABELS, formatDateTime } from "@/lib/domain";
import { assignRole } from "@/app/actions/admin-actions";

export default async function ConfigurationPage() {
  const session = await auth();
  if (!session?.user) return null;

  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <>
      <Header
        title="Configuration"
        subtitle="Assign staff roles for the Provider Tariff Negotiation module"
        icon={<ConfigIcon />}
        user={{ name: session.user.name ?? session.user.prognosisUsername, role: session.user.role }}
      />

      <div className="flex-1 space-y-4 px-8 py-8">
        <Card className="border-brand-100 bg-brand-50/40 px-5 py-3">
          <p className="text-[12.5px] text-brand-800">
            Role changes take effect the next time that person signs in — ask them to sign out and back
            in after you update their role.
          </p>
        </Card>
        <Card>
          <CardHeader title="Staff & Roles" subtitle={`${users.length} account${users.length === 1 ? "" : "s"} signed in so far`} />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead className="border-b border-ink-100 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                <tr>
                  <th className="px-5 py-2.5">Prognosis Username</th>
                  <th className="px-5 py-2.5">First Signed In</th>
                  <th className="px-5 py-2.5">Role</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="px-5 py-3 font-semibold text-ink-900">{u.prognosisUsername}</td>
                    <td className="px-5 py-3 text-ink-500">{formatDateTime(u.createdAt)}</td>
                    <td className="px-5 py-3">
                      <form action={assignRole} className="flex items-center gap-2">
                        <input type="hidden" name="userId" value={u.id} />
                        <select name="role" defaultValue={u.role} className={`${inputClass} w-48 py-1.5`}>
                          {Object.entries(ROLE_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                        <SubmitButton variant="secondary" className="px-3 py-1.5" pendingLabel="Saving…">
                          Save
                        </SubmitButton>
                      </form>
                    </td>
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}

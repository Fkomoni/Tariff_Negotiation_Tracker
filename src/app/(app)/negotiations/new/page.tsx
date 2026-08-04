import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui";
import { LogIcon } from "@/components/icons";
import { LogNegotiationForm } from "@/components/LogNegotiationForm";
import type { ProviderInitial } from "@/components/ProviderFields";
import type { EnrolleeInitial } from "@/components/EnrolleeFields";

export default async function LogNegotiationPage(
  props: {
    searchParams: Promise<{ repeatFrom?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const session = await auth();
  if (!session?.user) return null;
  // The Edge middleware used to gate this route to Contact Centre/Admin; it
  // can no longer read the role behind the opaque session cookie without
  // Prisma, so this page enforces it directly instead.
  if (!["CONTACT_CENTER", "ADMIN"].includes(session.user.role)) redirect("/dashboard");

  let initialProvider: ProviderInitial | undefined;
  let initialEnrollee: EnrolleeInitial | undefined;
  let sessionGroupId: string | undefined;

  if (searchParams.repeatFrom) {
    const source = await prisma.negotiationCase.findUnique({ where: { id: searchParams.repeatFrom } });
    if (source) {
      initialProvider = {
        code: source.providerCode ?? "",
        id: source.providerId ?? undefined,
        name: source.providerName,
        email: source.providerEmail ?? "",
        phone: source.providerPhone ?? "",
      };
      initialEnrollee = {
        enrolleeId: source.enrolleeId ?? "",
        fullName: source.enrolleeName,
        email: source.enrolleeEmail ?? "",
        phone: source.enrolleePhone ?? "",
        company: source.enrolleeCompany ?? "",
        scheme: source.enrolleeScheme ?? "",
        age: source.enrolleeAge?.toString() ?? "",
      };
      sessionGroupId = source.sessionGroupId ?? source.id;
    }
  }

  return (
    <>
      <Header
        title="Log Negotiation Request"
        subtitle="Leadway Health · Provider Tariff Negotiation"
        icon={<LogIcon />}
        user={{ name: session.user.name ?? session.user.prognosisUsername, role: session.user.role }}
      />

      <div className="mx-auto w-full max-w-3xl px-8 py-8">
        <Card className="p-6">
          <h2 className="text-[13.5px] font-bold text-ink-900">New Provider Tariff Negotiation</h2>
          <p className="mt-1 text-[12.5px] text-ink-400">
            The timer starts the moment this request is logged. Your name and the current time are
            recorded automatically.
          </p>

          {initialProvider && (
            <p className="mt-4 rounded-lg bg-emerald-50 px-3.5 py-2.5 text-[12.5px] font-medium text-emerald-700">
              Logging another service for {initialProvider.name} — {initialEnrollee?.fullName}. Provider and
              enrollee details are carried over; just fill in the new service.
            </p>
          )}

          <LogNegotiationForm
            initialProvider={initialProvider}
            initialEnrollee={initialEnrollee}
            sessionGroupId={sessionGroupId}
          />
        </Card>
      </div>
    </>
  );
}

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui";
import { ArrowLeftIcon, InfoIcon, LogIcon } from "@/components/icons";
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
      <Header user={{ name: session.user.name ?? session.user.prognosisUsername, role: session.user.role }} />

      <div className="mx-auto w-full max-w-4xl px-8 py-7">
        <div className="mb-5 flex items-start gap-3">
          <Link
            href="/dashboard"
            aria-label="Back to dashboard"
            className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-navy-500 transition-colors hover:bg-white hover:text-navy-900"
          >
            <ArrowLeftIcon className="h-[18px] w-[18px]" />
          </Link>
          <div>
            <h2 className="text-[21px] font-bold leading-tight text-navy-900">Log Negotiation Request</h2>
            <p className="mt-0.5 text-[13px] text-navy-500">Capture provider tariff negotiation details</p>
          </div>
        </div>

        <Card>
          <CardHeader
            title="Request Details"
            subtitle="Provide accurate information to ensure quick resolution."
            icon={<LogIcon className="h-[18px] w-[18px]" />}
          />
          <div className="px-6 pb-6">
            {initialProvider && (
              <p className="mt-5 rounded-lg border border-emerald-100 bg-emerald-50 px-3.5 py-2.5 text-[12.5px] font-medium text-emerald-700">
                Logging another service for {initialProvider.name} - {initialEnrollee?.fullName}. Provider and enrollee details
                are carried over; just fill in the new service.
              </p>
            )}

            <LogNegotiationForm
              initialProvider={initialProvider}
              initialEnrollee={initialEnrollee}
              sessionGroupId={sessionGroupId}
            />
          </div>
        </Card>

        <p className="mt-4 flex items-center gap-2 text-[12px] text-navy-500">
          <InfoIcon className="h-4 w-4 flex-shrink-0 text-accent" />
          The timer starts the moment this request is logged. Your name and the current time are recorded automatically.
        </p>
      </div>
    </>
  );
}

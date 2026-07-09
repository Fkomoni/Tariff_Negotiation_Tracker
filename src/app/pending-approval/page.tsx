import { auth } from "@/lib/auth";
import { logoutAction } from "@/app/actions/auth-actions";
import { ShieldIcon } from "@/components/icons";
import { Button } from "@/components/ui";

export default async function PendingApprovalPage() {
  const session = await auth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 px-6">
      <div className="w-full max-w-md rounded-2xl border border-ink-800 bg-ink-900 p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-white shadow-glow">
          <ShieldIcon className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-lg font-bold text-white">Awaiting role assignment</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-300">
          Your account (<span className="font-semibold text-white">{session?.user?.prognosisUsername}</span>) has
          signed in successfully but hasn&apos;t been assigned a role yet. Ask an Admin to assign you as
          Contact Centre or Provider Team in Configuration.
        </p>
        <form action={logoutAction} className="mt-6">
          <Button type="submit" variant="secondary" className="w-full">
            Sign out
          </Button>
        </form>
      </div>
    </div>
  );
}

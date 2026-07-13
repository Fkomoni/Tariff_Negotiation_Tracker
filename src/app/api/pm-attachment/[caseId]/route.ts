import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { sanitizeFilename } from "@/lib/file-validation";
import { withCors, corsPreflight } from "@/lib/cors";

export const GET = withCors(async (req: NextRequest, props: { params: Promise<{ caseId: string }> }) => {
  const params = await props.params;
  const session = await requireApiSession(["ADMIN", "CONTACT_CENTER", "PROVIDER_TEAM"]);
  if (session instanceof NextResponse) return session;

  const negotiationCase = await prisma.negotiationCase.findUnique({
    where: { id: params.caseId },
    select: { pmAttachmentData: true, pmAttachmentMimeType: true, pmAttachmentName: true },
  });

  if (!negotiationCase?.pmAttachmentData) {
    return NextResponse.json({ error: "No attachment on this case" }, { status: 404 });
  }

  // Re-sanitized here too (not just at upload time) so rows written before
  // this validation existed can't carry an unsafe filename into the header.
  const filename = sanitizeFilename(negotiationCase.pmAttachmentName ?? "attachment", "bin");

  return new NextResponse(new Uint8Array(negotiationCase.pmAttachmentData), {
    headers: {
      "Content-Type": negotiationCase.pmAttachmentMimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
});

export const OPTIONS = corsPreflight("GET");

import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest, { params }: { params: { caseId: string } }) {
  const session = await requireApiSession(["ADMIN", "CONTACT_CENTER", "PROVIDER_TEAM"]);
  if (session instanceof NextResponse) return session;

  const negotiationCase = await prisma.negotiationCase.findUnique({
    where: { id: params.caseId },
    select: { pmAttachmentData: true, pmAttachmentMimeType: true, pmAttachmentName: true },
  });

  if (!negotiationCase?.pmAttachmentData) {
    return NextResponse.json({ error: "No attachment on this case" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(negotiationCase.pmAttachmentData), {
    headers: {
      "Content-Type": negotiationCase.pmAttachmentMimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${negotiationCase.pmAttachmentName ?? "attachment"}"`,
    },
  });
}

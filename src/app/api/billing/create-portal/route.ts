import { auth } from "@clerk/nextjs/server";
import { getStripe } from "@/lib/stripe";
import { dbConnect } from "@/lib/db";
import { OrganizationMemberService } from "@/server/services/organization-member.service";
import { OrganizationService } from "@/server/services/organization.service";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await dbConnect();

  const membership = await OrganizationMemberService.getFirstByUserId(userId);
  if (!membership || membership.role !== "owner") {
    return Response.json({ error: "Only owners can manage billing" }, { status: 403 });
  }

  const org = await OrganizationService.getById(membership.orgId);
  if (!org || !org.stripeCustomerId) {
    return Response.json({ error: "No billing account found. Please upgrade first." }, { status: 400 });
  }

  const protocol = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("host") || "localhost:3000";
  const baseUrl = process.env.NEXT_PUBLIC_URL || `${protocol}://${host}`;

  const session = await getStripe().billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: `${baseUrl}/dashboard/settings/billing`,
  });

  return Response.json({ url: session.url });
}

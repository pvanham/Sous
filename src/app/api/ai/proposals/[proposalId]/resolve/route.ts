import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import Conversation from "@/server/models/Conversation";
import { executeProposal } from "@/lib/ai/orchestrator/execute-proposal";
import type { StoredProposal } from "@/types/conversation";

const resolveProposalSchema = z.object({
  action: z.enum(["approve", "deny"]),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ proposalId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request: malformed JSON body." },
      { status: 400 }
    );
  }

  const parseResult = resolveProposalSchema.safeParse(body);
  if (!parseResult.success) {
    const errors = parseResult.error.issues.map((i) => i.message).join(", ");
    return NextResponse.json(
      { error: `Invalid request: ${errors}` },
      { status: 400 }
    );
  }

  const { action } = parseResult.data;
  const { proposalId } = await params;

  await dbConnect();

  // Find the conversation containing this proposal, scoped to the authenticated user
  const conversation = await Conversation.findOne({
    clerkUserId: userId,
    "messages.proposal.proposalId": proposalId,
  });

  if (!conversation) {
    return NextResponse.json(
      { success: false, proposalId, error: "invalid_proposal", message: "Proposal not found." },
      { status: 404 }
    );
  }

  const messageWithProposal = conversation.messages.find(
    (m) => m.proposal?.proposalId === proposalId
  );
  const proposal = messageWithProposal?.proposal as StoredProposal | undefined;

  if (!proposal) {
    return NextResponse.json(
      { success: false, proposalId, error: "invalid_proposal", message: "Proposal not found." },
      { status: 404 }
    );
  }

  if (proposal.status !== "pending") {
    return NextResponse.json(
      {
        success: false,
        proposalId,
        error: "invalid_proposal",
        message: `This proposal has already been ${proposal.status}.`,
      },
      { status: 400 }
    );
  }

  // ----- DENY PATH -----
  if (action === "deny") {
    await Conversation.updateOne(
      { _id: conversation._id, "messages.proposal.proposalId": proposalId },
      {
        $set: {
          "messages.$.proposal.status": "denied",
          "messages.$.proposal.resolvedAt": new Date(),
          "messages.$.proposal.resolvedBy": userId,
        },
      }
    );

    return NextResponse.json({
      success: true,
      proposalId,
      action: "denied",
      executionSummary: `The user denied the ${proposal.toolName} proposal.`,
    });
  }

  // ----- APPROVE PATH -----
  const orgId = String(conversation.orgId);
  const locationId = String(conversation.locationId);

  const result = await executeProposal({
    proposal,
    orgId,
    locationId,
    clerkUserId: userId,
    conversationId: String(conversation._id),
  });

  if (result.errorCode === "stale_data") {
    await Conversation.updateOne(
      { _id: conversation._id, "messages.proposal.proposalId": proposalId },
      {
        $set: {
          "messages.$.proposal.status": "stale",
          "messages.$.proposal.resolvedAt": new Date(),
          "messages.$.proposal.resolvedBy": userId,
        },
      }
    );

    return NextResponse.json(
      {
        success: false,
        proposalId,
        error: "stale_data",
        message: result.error ?? "The underlying data has changed. Please try again.",
      },
      { status: 409 }
    );
  }

  if (!result.success) {
    return NextResponse.json(
      {
        success: false,
        proposalId,
        error: result.errorCode ?? "execution_failed",
        message: result.error ?? "Failed to execute the approved action. The proposal has not been applied.",
      },
      { status: 500 }
    );
  }

  // Mutation succeeded — now mark proposal as approved
  await Conversation.updateOne(
    { _id: conversation._id, "messages.proposal.proposalId": proposalId },
    {
      $set: {
        "messages.$.proposal.status": "approved",
        "messages.$.proposal.resolvedAt": new Date(),
        "messages.$.proposal.resolvedBy": userId,
      },
    }
  );

  if (result.asyncTaskId) {
    return NextResponse.json({
      success: true,
      proposalId,
      action: "approved",
      async: true,
      asyncTaskId: result.asyncTaskId,
      asyncDeadline: result.asyncDeadline,
      executionSummary: result.executionSummary,
    });
  }

  return NextResponse.json({
    success: true,
    proposalId,
    action: "approved",
    result: result.data,
    executionSummary: result.executionSummary,
  });
}

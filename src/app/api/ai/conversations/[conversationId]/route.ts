import mongoose from "mongoose";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import Conversation from "@/server/models/Conversation";
import { toConversationDTO } from "@/types/conversation";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const { conversationId } = await params;
  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    return NextResponse.json(
      { error: "Conversation not found." },
      { status: 404 }
    );
  }

  await dbConnect();

  const conversation = await Conversation.findOne({
    _id: conversationId,
    clerkUserId: userId,
  }).lean();

  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found." },
      { status: 404 }
    );
  }

  return NextResponse.json(toConversationDTO(conversation));
}

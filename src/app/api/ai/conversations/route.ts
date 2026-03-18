import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db";
import Conversation from "@/server/models/Conversation";
import type { ConversationListItem, ConversationMessage } from "@/types/conversation";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 20;
const DEFAULT_OFFSET = 0;
const PREVIEW_MAX_LENGTH = 120;

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(req.url);
  const limitParam = Number(searchParams.get("limit"));
  const offsetParam = Number(searchParams.get("offset"));

  const limit = Number.isFinite(limitParam)
    ? Math.max(1, Math.min(MAX_LIMIT, Math.trunc(limitParam)))
    : DEFAULT_LIMIT;
  const offset = Number.isFinite(offsetParam)
    ? Math.max(0, Math.trunc(offsetParam))
    : DEFAULT_OFFSET;

  await dbConnect();

  const conversations = await Conversation.find({ clerkUserId: userId })
    .sort({ updatedAt: -1 })
    .skip(offset)
    .limit(limit)
    .lean();

  const listItems: ConversationListItem[] = conversations.map((conversation) => {
    const firstUserMessage = (conversation.messages as ConversationMessage[]).find(
      (message) => message.role === "user" && typeof message.content === "string"
    );
    const previewRaw = firstUserMessage?.content ?? "";
    const preview =
      previewRaw.length > PREVIEW_MAX_LENGTH
        ? `${previewRaw.slice(0, PREVIEW_MAX_LENGTH)}...`
        : previewRaw;

    return {
      conversationId: String(conversation._id),
      preview,
      messageCount: Array.isArray(conversation.messages)
        ? conversation.messages.length
        : 0,
      createdAt: new Date(conversation.createdAt).toISOString(),
      updatedAt: new Date(conversation.updatedAt).toISOString(),
      isActive: Boolean(conversation.isActive),
    };
  });

  return NextResponse.json(listItems);
}

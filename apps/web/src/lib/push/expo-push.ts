import { DeviceTokenService } from "@/server/services/device-token.service";

/**
 * Thin wrapper around the Expo Push Service.
 *
 * Reference: https://docs.expo.dev/push-notifications/sending-notifications/
 *
 * Why this lives in `lib/` instead of `server/services/`:
 *   - It does not touch Mongoose directly. The only persistence call
 *     is back into `DeviceTokenService.revokeMany` to soft-revoke
 *     dead tokens, which is the canonical service for that.
 *   - It is a transport adapter, not a domain service. The dispatcher
 *     (`NotificationService`) is the place that owns the "should we
 *     notify this user about this category" logic.
 */

const EXPO_SEND_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPT_URL = "https://exp.host/--/api/v2/push/getReceipts";

const SEND_CHUNK_SIZE = 100; // Expo's hard cap per request

export interface ExpoPushPayload {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  sound?: "default" | null;
  channelId?: string;
}

interface ExpoSendTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

interface ExpoReceipt {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
}

/**
 * Send a batch of push messages and reconcile dead tokens.
 *
 * Failures are logged with structured detail and **never thrown**.
 * The dispatcher is fire-and-forget; a Resend outage cannot cancel
 * the pushes, and an Expo outage cannot cancel the emails.
 */
export async function sendExpoPush(
  messages: ExpoPushPayload[],
): Promise<void> {
  if (messages.length === 0) return;

  const accessToken = process.env.EXPO_ACCESS_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate",
    "Content-Type": "application/json",
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const deadTokens = new Set<string>();
  const ticketIds: string[] = [];
  const ticketIdToToken = new Map<string, string>();

  for (let i = 0; i < messages.length; i += SEND_CHUNK_SIZE) {
    const chunk = messages.slice(i, i + SEND_CHUNK_SIZE);
    let response: Response;
    try {
      response = await fetch(EXPO_SEND_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(chunk),
      });
    } catch (err) {
      console.error("[expo-push] network error sending chunk:", {
        error: err instanceof Error ? err.message : String(err),
        chunkSize: chunk.length,
      });
      continue;
    }

    if (!response.ok) {
      console.error("[expo-push] non-2xx from /push/send:", {
        status: response.status,
        chunkSize: chunk.length,
      });
      continue;
    }

    let json: { data?: ExpoSendTicket[] } = {};
    try {
      json = (await response.json()) as { data?: ExpoSendTicket[] };
    } catch (err) {
      console.error("[expo-push] failed to parse send response:", err);
      continue;
    }

    const tickets = json.data ?? [];
    for (let j = 0; j < tickets.length; j++) {
      const ticket = tickets[j];
      const message = chunk[j];
      if (!ticket || !message) continue;
      if (ticket.status === "error") {
        if (ticket.details?.error === "DeviceNotRegistered") {
          deadTokens.add(message.to);
        } else {
          console.error("[expo-push] ticket error:", {
            error: ticket.details?.error,
            message: ticket.message,
          });
        }
        continue;
      }
      if (ticket.id) {
        ticketIds.push(ticket.id);
        ticketIdToToken.set(ticket.id, message.to);
      }
    }
  }

  // Receipts surface device-side failures (e.g. APNs rejected the
  // token after the initial accept) — same `DeviceNotRegistered`
  // marker, just delayed. Best-effort; receipts can be slow.
  if (ticketIds.length > 0) {
    try {
      const receiptRes = await fetch(EXPO_RECEIPT_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({ ids: ticketIds }),
      });
      if (receiptRes.ok) {
        const receiptJson = (await receiptRes.json()) as {
          data?: Record<string, ExpoReceipt>;
        };
        const data = receiptJson.data ?? {};
        for (const [ticketId, receipt] of Object.entries(data)) {
          if (receipt.status === "error") {
            const token = ticketIdToToken.get(ticketId);
            if (
              token &&
              receipt.details?.error === "DeviceNotRegistered"
            ) {
              deadTokens.add(token);
            } else {
              console.error("[expo-push] receipt error:", {
                ticketId,
                error: receipt.details?.error,
                message: receipt.message,
              });
            }
          }
        }
      }
    } catch (err) {
      console.error("[expo-push] receipt poll failed:", err);
    }
  }

  if (deadTokens.size > 0) {
    try {
      await DeviceTokenService.revokeMany(Array.from(deadTokens));
    } catch (err) {
      console.error("[expo-push] failed to revoke dead tokens:", err);
    }
  }
}

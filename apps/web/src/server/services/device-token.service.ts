import DeviceToken from "@/server/models/DeviceToken";
import { type DeviceTokenDTO, toDeviceTokenDTO } from "@/types/notification";

export interface RegisterDeviceTokenServiceInput {
  clerkUserId: string;
  expoPushToken: string;
  platform: "ios" | "android";
  deviceName?: string | null;
}

/**
 * DeviceTokenService — tracks the live set of Expo push tokens for
 * each Clerk user. The dispatcher calls `listForUser` to fan a push
 * notification out to every active device a user has registered.
 *
 * Tokens are soft-revoked (via `revokedAt`) rather than hard-deleted
 * so log triage can still tie a "token gone" reading back to the
 * original user.
 */
export const DeviceTokenService = {
  /**
   * Register (or refresh) a device token. Keyed on `expoPushToken`
   * via the unique index, so the same token re-registering as the
   * same user becomes an in-place update — and re-registering as a
   * different user re-binds the token (the previous user effectively
   * loses that device, which is correct on shared phones).
   *
   * Always clears `revokedAt` because a successful registration means
   * the token is alive again.
   */
  async register(
    input: RegisterDeviceTokenServiceInput,
  ): Promise<DeviceTokenDTO> {
    const now = new Date();
    const doc = await DeviceToken.findOneAndUpdate(
      { expoPushToken: input.expoPushToken },
      {
        $set: {
          clerkUserId: input.clerkUserId,
          platform: input.platform,
          deviceName: input.deviceName ?? null,
          lastSeenAt: now,
          revokedAt: null,
        },
        $setOnInsert: {
          expoPushToken: input.expoPushToken,
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
        runValidators: true,
      },
    ).lean();

    if (!doc) {
      throw new Error("DeviceTokenService.register: upsert returned null");
    }
    return toDeviceTokenDTO(doc);
  },

  /**
   * List every non-revoked device token for a user. The dispatcher
   * uses this to know where to fan a push out.
   */
  async listForUser(clerkUserId: string): Promise<DeviceTokenDTO[]> {
    const docs = await DeviceToken.find({
      clerkUserId,
      revokedAt: null,
    }).lean();
    return docs.map(toDeviceTokenDTO);
  },

  /**
   * Soft-revoke a single token. Idempotent — revoking an already-
   * revoked or nonexistent token is a no-op.
   */
  async revoke(expoPushToken: string): Promise<void> {
    await DeviceToken.updateOne(
      { expoPushToken, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  },

  /**
   * Soft-revoke many tokens in one round-trip. Used by the Expo Push
   * receipt poller when a batch reports `DeviceNotRegistered`.
   */
  async revokeMany(expoPushTokens: string[]): Promise<void> {
    if (expoPushTokens.length === 0) return;
    await DeviceToken.updateMany(
      { expoPushToken: { $in: expoPushTokens }, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  },

  /**
   * Hard-delete all device token rows for a Clerk user.
   * Used during owner account deletion to remove user-scoped data.
   */
  async deleteAllByClerkUserId(clerkUserId: string): Promise<number> {
    const result = await DeviceToken.deleteMany({ clerkUserId });
    return result.deletedCount;
  },
};

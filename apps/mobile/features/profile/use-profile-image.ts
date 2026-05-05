import { useCallback, useState } from "react";
import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import {
  isClerkAPIResponseError,
  useUser,
} from "@clerk/clerk-expo";
import { syncProfileImage } from "./api";

/**
 * Profile-picture upload flow shared between the Profile and Settings
 * screens. Owns:
 *   1. Asking the OS for media-library permission.
 *   2. Launching the system image picker.
 *   3. Uploading the chosen file to Clerk via `user.setProfileImage`.
 *   4. Telling our web backend to mirror the resulting URL into Mongo
 *      so other surfaces (rosters, dashboards) render the new avatar.
 *
 * The hook keeps the actual UI dumb: callers render an avatar pressable
 * and call `pickAndUpload()` / `removeImage()`.
 */
export function useProfileImage() {
  const { user } = useUser();
  const [busy, setBusy] = useState(false);

  const showError = useCallback((message: string) => {
    Alert.alert("Profile picture", message);
  }, []);

  const pickAndUpload = useCallback(async () => {
    if (!user || busy) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showError(
        "We need access to your photos to set a profile picture. You can enable this in Settings.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
      base64: true,
    });

    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];

    setBusy(true);
    try {
      // Clerk's `setProfileImage` accepts a base64 data URI on RN
      // (Blob/File aren't available). The picker can return base64
      // directly when `base64: true` is set; we wrap it with the
      // declared mime type so Clerk decodes it correctly.
      let payload: string;
      if (asset.base64) {
        const mime = asset.mimeType ?? guessMimeFromUri(asset.uri);
        payload = `data:${mime};base64,${asset.base64}`;
      } else {
        // Fallback: read the file ourselves. Should be rare since we
        // request base64 above, but keep the path correct so a
        // platform that ignores the flag still works.
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        payload = await blobToDataUri(blob);
      }

      await user.setProfileImage({ file: payload });
      await user.reload();
      await syncProfileImage();
    } catch (err) {
      showError(extractMessage(err));
    } finally {
      setBusy(false);
    }
  }, [busy, showError, user]);

  const removeImage = useCallback(async () => {
    if (!user || busy || !user.hasImage) return;
    setBusy(true);
    try {
      await user.setProfileImage({ file: null });
      await user.reload();
      await syncProfileImage(null);
    } catch (err) {
      showError(extractMessage(err));
    } finally {
      setBusy(false);
    }
  }, [busy, showError, user]);

  /**
   * Native action sheet wrapper. Calls `pickAndUpload` for the
   * primary action and `removeImage` for the destructive action when
   * the user already has a Clerk-hosted picture.
   */
  const presentOptions = useCallback(() => {
    if (!user) return;
    if (user.hasImage) {
      Alert.alert("Profile picture", undefined, [
        {
          text: "Choose new photo",
          onPress: () => {
            void pickAndUpload();
          },
        },
        {
          text: "Remove photo",
          style: "destructive",
          onPress: () => {
            void removeImage();
          },
        },
        { text: "Cancel", style: "cancel" },
      ]);
    } else {
      void pickAndUpload();
    }
  }, [pickAndUpload, removeImage, user]);

  return {
    busy,
    pickAndUpload,
    removeImage,
    presentOptions,
  };
}

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Failed to read image."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Read error"));
    reader.readAsDataURL(blob);
  });
}

function guessMimeFromUri(uri: string): string {
  const ext = uri.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "heic":
    case "heif":
      return "image/heic";
    default:
      return "image/jpeg";
  }
}

function extractMessage(err: unknown): string {
  if (isClerkAPIResponseError(err)) {
    return (
      err.errors?.[0]?.longMessage ??
      err.errors?.[0]?.message ??
      "Could not update your profile picture."
    );
  }
  if (err instanceof Error) return err.message;
  return "Could not update your profile picture.";
}

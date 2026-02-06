/*
 * NativeBridge.ts
 * 
 * Handles bidirectional communication between Element Call WebView
 * and the native Android application for KYC verification.
 *
 * --- How it works ---
 *
 *  WebView -> Native (outbound):
 *    Android injects a JavaScript interface object (e.g. `AndroidKYCBridge`)
 *    into the WebView's `window` scope. We call methods on this object to
 *    trigger native flows.
 *
 *  Native -> WebView (inbound):
 *    The android app calls `webView.evaluateJavascript(...) which dispatches
 *    a CustomEvent on `window` that we listen for here.
 *
 *  --- Android side (Kotlin) ---
 *
 *    // Inject the bridge:
 *    webView.addJavascriptInterface(KYCBridgeInterface(), "AndroidKYCBridge")
 *
 *    class KYCBridgeInterface {
 *        @JavascriptInterface
 *        fun requestKYCVerification(payload: String) {
 *            // payload is JSON: { roomId, userId, level }
 *            // Launch native KYC activity/fragment
 *        }
 *    }
 *
 *    // Send result back:
 *    webView.evaluateJavascript("""
 *        window.dispatchEvent(new CustomEvent('kyc-verification-result', {
 *          detail: { success: true, token: "...", userId: "..." }
 *        }));
 *    """, null)
 *
 */

/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/lib/logger";

import type { KYCLevel, KYCParticipantInfo } from "./types";

// --- Types

export interface KYCVerificationRequest {
  roomId: string;
  userId: string;
  level: KYCLevel;
}

export interface KYCVerificationResult {
  success: boolean;
  /** Verification token/proof from native KYC provider, if successful  */
  token?: string;
  userId?: string;
  /** Error code or message from native side, if failed */
  error?: string;
}

/**
 * The interface that Android injects into `window` via
 * `addJavascriptInterface`. The method signatures here must match
 * the Kotlin `@JavascriptInterface` methods exactly.
 */
interface AndroidKYCBridge {
  /** Trigger the native KYC verification flow. Payload is JSON string. */
  requestKYCVerification(payload: string): void;
  /** Set or remove KYC room requirement. Payload is JSON string. */
  setKYCRoomRequirement(payload: string): void;
  /** Request the native side to send participant KYC data now. */
  requestParticipantData(): void;
}

// Extend Window so Typescript knows about the injected interface
declare global {
  interface Window {
    AndroidKYCBridge?: AndroidKYCBridge;
  }
}

// --- Bridge Detection

/**
 * Returns true if we're running inside the Android WebView with the
 * KYC bridge injected.
 */
export function isNativeBridgeAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.AndroidKYCBridge !== "undefined" &&
    typeof window.AndroidKYCBridge.requestKYCVerification === "function"
  );
}

// --- Outbound: WebView -> Native

/**
 * Sends a KYC verification request to the native Android app and
 * returns a Promise that resolves when the native side dispatches
 * the result event back.
 *
 * Throws if:
 * - The native bridge is not available (not in WebView)
 * - The native side reports an error
 * - The request times out (default 5 mins - KYC can take a while)
*/
export async function requestNativeKYCVerification(
  request: KYCVerificationRequest,
  timeoutMs = 5 * 60 * 1000,
): Promise<KYCVerificationResult> {
  return new Promise<KYCVerificationResult>((resolve, reject) => {
    if (!isNativeBridgeAvailable()) {
      reject(
        new Error(
          "Native KYC bridge is not available. " +
            "Ensure the app is running in the Android WebView with " +
            "Android KYCBridge injected.",
        ),
      );
      return;
    }

    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    // Listen for the result event from native
    const handleResult = (event: Event): void => {
      if (settled) return;
      settled = true;

      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener("kyc-verification-result", handleResult);

      const detail = (event as CustomEvent<KYCVerificationResult>).detail;

      logger.info("[NativeBridge] KYC verification result received:", {
        success: detail.success,
        hasToken: !!detail.token,
      });

      if (detail.success) {
        resolve(detail);
      } else {
        reject(
          new Error(detail.error ?? "KYC verification failed on native side"),
        );
      }
    };

    window.addEventListener("kyc-verification-result", handleResult);

    // Timeout grand
    timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      window.removeEventListener("kyc-verification-result", handleResult);
      reject(new Error("KYC verification timed out"));
    }, timeoutMs);

    // Send the request to native
    const payload = JSON.stringify(request);
    logger.info("[NativeBridge] Requesting native KYC verification:", {
      roomId: request.roomId,
      level: request.level,
    });

    try {
      window.AndroidKYCBridge!.requestKYCVerification(payload);
    } catch (e) {
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener("kyc-verification-result", handleResult);
      reject(new Error(`Failed to call native bridge: ${e}`));
    }
  });
}

// --- Room requirement: WebView -> Native

export interface KYCRoomRequirementRequest {
  roomId: string;
  userId: string;
  enabled: boolean;
  level: string;
}

/**
 * Tells the native Android app to set or remove a KYC requirement
 * for the given room. This bypasses the Widget API entirely since
 * custom actions are not supported by the Matrix Widget transport.
 *
 * The native side handles this via EntangleApiService directly.
*/
export function setNativeKYCRoomRequirement(
  request: KYCRoomRequirementRequest,
): void {
  if (!isNativeBridgeAvailable()) {
    logger.error("[NativeBridge] Cannot set KYC room requirement - bridge not available");
    return;
  }

  const payload = JSON.stringify(request);
  logger.info("[NativeBridge] Setting KYC room requirement:", {
    roomId: request.roomId,
    enabled: request.enabled,
    level: request.level,
  });
  
  try {
    window.AndroidKYCBridge!.setKYCRoomRequirement(payload);
  } catch (e) {
    logger.error(`[NativeBridge] Failed to set room requirement: ${e}`);
  }
}

// --- Pull-based: WebView requests participant data from Native

/**
 * Asks the native Android app to send participant KYC data now.
 * The native side will respond by dispatching a `kyc-participants-data`
 * CustomEvent, which the existing listener picks up.
 */
export function requestNativeParticipantData(): void {
  if (!isNativeBridgeAvailable()) {
    return;
  }

  logger.info("[NativeBridge] Requesting participant data from native side");
  try {
    window.AndroidKYCBridge!.requestParticipantData();
  } catch (e) {
    logger.error(`[NativeBridge] Failed to request participant data: ${e}`);
  }
}

// --- Inbound: Native -> WebView (participant KYC data)

/**
 * Data format for a single participant's KYC verification,
 * as sent by the native Android side via `sendParticipantVerifications(list)`.
 *
 * The native side dispatches:
 *   window.dispatchEvent(new CustomEvent('kyc-participants-data', {
 *     detail: [ { userId, score, firstName, lastName, level }, ... ]
 *   }));
 */
export interface NativeKYCParticipantData {
  userId: string;
  score?: number;
  firstName?: string;
  lastName?: string;
  level: KYCLevel;
}

function parseKYCParticipantsData(
  data: NativeKYCParticipantData[],
): Map<string, KYCParticipantInfo> {
  const map = new Map<string, KYCParticipantInfo>();
  for (const entry of data) {
    if (!entry.userId) continue;
    map.set(entry.userId, {
      score: entry.score,
      firstName: entry.firstName,
      lastName: entry.lastName,
      level: entry.level ?? "none",
    });
  }
  return map;
}

/**
 * Module-level cache: captures KYC participant data as soon as the native
 * side dispatches it, even before React components mount. This prevents
 * data loss due to timing — the native side often sends data seconds
 * before the KYCProvider's useEffect listener is attached.
 */
let cachedKYCParticipants: Map<string, KYCParticipantInfo> | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("kyc-participants-data", (event: Event) => {
    const data = (event as CustomEvent<NativeKYCParticipantData[]>).detail;
    if (Array.isArray(data)) {
      cachedKYCParticipants = parseKYCParticipantsData(data);
      logger.info(
        `[NativeBridge] Cached KYC data for ${cachedKYCParticipants.size} participants`,
      );
    }
  });
}

/**
 * Returns any KYC participant data that was received before
 * the React provider mounted. Returns null if no data was cached.
 */
export function getCachedKYCParticipants(): Map<string, KYCParticipantInfo> | null {
  return cachedKYCParticipants;
}

/**
 * Subscribes to `kyc-participants-data` events dispatched by the native
 * Android side. The callback receives the full list of participant
 * verifications each time the native side sends an update.
 *
 * Also immediately delivers any cached data that arrived before subscription.
 *
 * @returns A cleanup function to remove the listener.
 */
export function onParticipantVerifications(
  callback: (participants: Map<string, KYCParticipantInfo>) => void,
): () => void {
  // Deliver cached data immediately if available
  if (cachedKYCParticipants) {
    logger.info(
      `[NativeBridge] Delivering cached KYC data for ${cachedKYCParticipants.size} participants`,
    );
    callback(cachedKYCParticipants);
  }

  const handler = (event: Event): void => {
    const data = (event as CustomEvent<NativeKYCParticipantData[]>).detail;
    if (!Array.isArray(data)) {
      logger.warn("[NativeBridge] kyc-participants-data: expected array, got", typeof data);
      return;
    }

    const map = parseKYCParticipantsData(data);
    logger.info(`[NativeBridge] Received KYC data for ${map.size} participants`);
    callback(map);
  };

  window.addEventListener("kyc-participants-data", handler);
  return (): void => {
    window.removeEventListener("kyc-participants-data", handler);
  };
}

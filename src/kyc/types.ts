/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/**
 * KYC verification level hierarchy.
 * Higher levels include all verifications from lower levels.
 */
export type KYCLevel = "none" | "basic" | "standard" | "enhanced";

/**
 * Custom state event: org.entangle.kyc.room_requirement
 * State key: "" (empty - room-level)
 * Power level: 50 (moderators)
 */
export interface KYCRoomRequirement {
  required_level: KYCLevel;
  required_verifications: string[];
  grace_period_hours?: number;
  rejection_message: string;
  set_at: number;
  set_by: string;
}

/**
 * Custom state event: org.entangle.kyc.user_verification
 * State key: _${user_id} (e.g., _@alice:matrix.org)
 * Power level: 100 (admin/service account only)
 */
export interface KYCUserVerification {
  level: KYCLevel;
  completed_verifications: string[];
  verified_by: string;
  verified_at: number;
  expires_at: number;
  verification_hash: string;
  score?: number;
  first_name?: string;
  last_name?: string;
}

/**
 * Per-participant KYC info as displayed on video tiles.
 * Populated from native bridge data.
 */
export interface KYCParticipantInfo {
  score?: number;
  firstName?: string;
  lastName?: string;
  level: KYCLevel;
}

/**
 * Result of validating a user's KYC status against room requirements.
 */
export interface KYCValidationResult {
  allowed: boolean;
  reason?: string;
  missingLevel?: KYCLevel;
  missingVerifications?: string[];
}

/**
 * Custom state event type constants.
 */
export const KYC_ROOM_REQUIREMENT_EVENT =
  "org.entangle.kyc.room_requirement" as const;
export const KYC_USER_VERIFICATION_EVENT =
  "org.entangle.kyc.user_verification" as const;

/**
 * Ordered KYC levels for comparison.
 */
export const KYC_LEVEL_ORDER: Record<KYCLevel, number> = {
  none: 0,
  basic: 1,
  standard: 2,
  enhanced: 3,
};

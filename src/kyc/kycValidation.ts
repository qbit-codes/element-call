/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type KYCLevel,
  type KYCRoomRequirement,
  type KYCUserVerification,
  type KYCValidationResult,
  KYC_LEVEL_ORDER,
} from "./types";

/**
 * Compare two KYC levels. Returns true if actualLevel >= requiredLevel.
 */
export function meetsKYCLevel(
  requiredLevel: KYCLevel,
  actualLevel: KYCLevel,
): boolean {
  return KYC_LEVEL_ORDER[actualLevel] >= KYC_LEVEL_ORDER[requiredLevel];
}

/**
 * Check if a KYC verification has expired.
 */
export function isKYCExpired(verification: KYCUserVerification): boolean {
  return Date.now() > verification.expires_at;
}

/**
 * Validate a user's KYC status against room requirements.
 * Returns a result indicating whether the user is allowed to join.
 */
export function validateKYCRequirements(
  requirement: KYCRoomRequirement | null,
  verification: KYCUserVerification | null,
): KYCValidationResult {
  // No KYC requirement on the room - allow
  if (!requirement) {
    return { allowed: true };
  }

  // No verification for user
  if (!verification) {
    return {
      allowed: false,
      reason: requirement.rejection_message,
      missingLevel: requirement.required_level,
      missingVerifications: requirement.required_verifications,
    };
  }

  // Check expiry
  if (isKYCExpired(verification)) {
    return {
      allowed: false,
      reason: "Your KYC verification has expired. Please re-verify.",
      missingLevel: requirement.required_level,
    };
  }

  // Check level
  if (!meetsKYCLevel(requirement.required_level, verification.level)) {
    return {
      allowed: false,
      reason: requirement.rejection_message,
      missingLevel: requirement.required_level,
    };
  }

  // Check required verifications
  const missingVerifications = requirement.required_verifications.filter(
    (v) => !verification.completed_verifications.includes(v),
  );

  if (missingVerifications.length > 0) {
    return {
      allowed: false,
      reason: requirement.rejection_message,
      missingVerifications,
    };
  }

  // All checks passed
  return { allowed: true };
}

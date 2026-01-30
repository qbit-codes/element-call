/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, useCallback, useState } from "react";
import { BigIcon, Button, Heading, Text } from "@vector-im/compound-web";
import { LockSolidIcon } from "@vector-im/compound-design-tokens/assets/web/icons";
import { logger } from "matrix-js-sdk/lib/logger";

import type { KYCRoomRequirement, KYCValidationResult } from "../kyc/types";
import { FullScreenView } from "../FullScreenView";
import { ElementWidgetActions, widget } from "../widget";
import styles from "./KYCBlockedView.module.css";

interface Props {
  validationResult: KYCValidationResult;
  roomRequirement: KYCRoomRequirement;
  roomId: string;
  userId: string;
  isVerifying?: boolean;
  verificationError?: string | null;
}

export const KYCBlockedView: FC<Props> = ({
  validationResult,
  roomRequirement,
  roomId,
  userId,
  isVerifying: externalIsVerifying,
  verificationError: externalError,
}) => {
  const [localVerifying, setLocalVerifying] = useState(false);
  const isVerifying = externalIsVerifying ?? localVerifying;
  const verificationError = externalError ?? null;

  const handleStartVerification = useCallback(() => {
    if (widget) {
      setLocalVerifying(true);
      widget.api.transport
        .send(ElementWidgetActions.KYCVerificationRequired, {
          required_level: roomRequirement.required_level,
          required_verifications: roomRequirement.required_verifications,
          room_id: roomId,
          user_id: userId,
        })
        .catch((e) => {
          logger.error("Failed to send KYC verification required action", e);
          setLocalVerifying(false);
        });
    }
  }, [roomRequirement, roomId, userId]);

  return (
    <FullScreenView>
      <div className={styles.container}>
        <BigIcon className={styles.icon}>
          <LockSolidIcon aria-hidden />
        </BigIcon>
        <Heading as="h1" weight="semibold" size="md">
          Verification Required
        </Heading>
        <Text size="md" className={styles.message}>
          {isVerifying
            ? "Verifying identity..."
            : (validationResult.reason ?? roomRequirement.rejection_message)}
        </Text>
        {verificationError && (
          <Text size="sm" className={styles.error}>
            {verificationError}
          </Text>
        )}
        {!isVerifying &&
          validationResult.missingVerifications &&
          validationResult.missingVerifications.length > 0 && (
            <Text size="sm" className={styles.details}>
              Missing verifications:{" "}
              {validationResult.missingVerifications.join(", ")}
            </Text>
          )}
        <div className={styles.actions}>
          <Button
            kind="primary"
            onClick={handleStartVerification}
            disabled={isVerifying}
          >
            {isVerifying
              ? "Verifying..."
              : verificationError
                ? "Try Again"
                : "Start Verification"}
          </Button>
        </div>
      </div>
    </FullScreenView>
  );
};

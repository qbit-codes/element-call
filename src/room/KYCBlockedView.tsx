/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type FC, useCallback } from "react";
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
}

export const KYCBlockedView: FC<Props> = ({
  validationResult,
  roomRequirement,
}) => {
  const handleStartVerification = useCallback(() => {
    if (widget) {
      widget.api.transport
        .send(ElementWidgetActions.KYCVerificationRequired, {
          required_level: roomRequirement.required_level,
          required_verifications: roomRequirement.required_verifications,
        })
        .catch((e) => {
          logger.error("Failed to send KYC verification required action", e);
        });
    }
  }, [roomRequirement]);

  const handleObserverMode = useCallback(() => {
    // Observer mode - join without media access
    logger.info("User chose observer mode for KYC-required room");
    // TODO: Implement observer mode join (view-only, no media)
  }, []);

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
          {validationResult.reason ?? roomRequirement.rejection_message}
        </Text>
        {validationResult.missingVerifications &&
          validationResult.missingVerifications.length > 0 && (
            <Text size="sm" className={styles.details}>
              Missing verifications:{" "}
              {validationResult.missingVerifications.join(", ")}
            </Text>
          )}
        <div className={styles.actions}>
          <Button kind="primary" onClick={handleStartVerification}>
            Start Verification
          </Button>
          {validationResult.canObserve && (
            <Button kind="secondary" onClick={handleObserverMode}>
              Join as Observer
            </Button>
          )}
        </div>
      </div>
    </FullScreenView>
  );
};

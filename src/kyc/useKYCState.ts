/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useCallback, useEffect, useState } from "react";
import { type Room, RoomEvent } from "matrix-js-sdk";

import { useRoomState } from "../room/useRoomState";
import {
  type KYCRoomRequirement,
  type KYCUserVerification,
  KYC_ROOM_REQUIREMENT_EVENT,
  KYC_USER_VERIFICATION_EVENT,
} from "./types";

/**
 * Hook to get the KYC room requirement from room state.
 * Returns null if no KYC requirement is set for the room.
 */
export function useKYCRoomRequirement(
  room: Room,
): KYCRoomRequirement | null {
  return useRoomState(
    room,
    useCallback((state) => {
      const event = state.getStateEvents(KYC_ROOM_REQUIREMENT_EVENT, "");
      if (!event) return null;
      return event.getContent() as KYCRoomRequirement;
    }, []),
  );
}

/**
 * Hook to get the KYC room requirement when room may be undefined.
 * Safe to use in components where room is optional.
 * Reactively updates when room state changes.
 * Returns null if room is undefined or no requirement is set.
 */
export function useOptionalKYCRoomRequirement(
  room: Room | undefined,
): KYCRoomRequirement | null {
  const [requirement, setRequirement] = useState<KYCRoomRequirement | null>(
    null,
  );

  useEffect(() => {
    if (!room) {
      setRequirement(null);
      return;
    }

    const readRequirement = (): void => {
      const event = room.currentState.getStateEvents(
        KYC_ROOM_REQUIREMENT_EVENT,
        "",
      );
      if (!event) {
        setRequirement(null);
        return;
      }
      const content = event.getContent() as KYCRoomRequirement;
      if (!content.required_level) {
        setRequirement(null);
        return;
      }
      setRequirement(content);
    };

    readRequirement();

    const onStateUpdate = (): void => readRequirement();
    room.on(RoomEvent.CurrentStateUpdated, onStateUpdate);
    return (): void => {
      room.off(RoomEvent.CurrentStateUpdated, onStateUpdate);
    };
  }, [room]);

  return requirement;
}

/**
 * Hook to get a user's KYC verification status from room state.
 * State key format: _${userId} (e.g., _@alice:matrix.org)
 * Returns null if no verification exists for the user.
 */
export function useKYCUserVerification(
  room: Room,
  userId: string,
): KYCUserVerification | null {
  return useRoomState(
    room,
    useCallback(
      (state) => {
        const stateKey = `_${userId}`;
        const event = state.getStateEvents(
          KYC_USER_VERIFICATION_EVENT,
          stateKey,
        );
        if (!event) return null;
        return event.getContent() as KYCUserVerification;
      },
      [userId],
    ),
  );
}

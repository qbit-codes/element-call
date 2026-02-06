/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FC,
  type JSX,
} from "react";

import type { KYCParticipantInfo } from "./types";
import { onParticipantVerifications } from "./NativeBridge";

interface KYCContextValue {
  getParticipantKYC: (userId: string) => KYCParticipantInfo | null;
}

const defaultValue: KYCContextValue = {
  getParticipantKYC: () => null,
};

const KYCContext = createContext<KYCContextValue>(defaultValue);

interface KYCProviderProps {
  children: JSX.Element;
}

export const KYCProvider: FC<KYCProviderProps> = ({ children }) => {
  const [kycMap, setKycMap] = useState<Map<string, KYCParticipantInfo>>(
    () => new Map(),
  );

  useEffect(() => {
    return onParticipantVerifications((map) => {
      setKycMap(map);
    });
  }, []);

  const getParticipantKYC = useCallback(
    (userId: string): KYCParticipantInfo | null => {
      return kycMap.get(userId) ?? null;
    },
    [kycMap],
  );

  const value = useMemo<KYCContextValue>(
    () => ({ getParticipantKYC }),
    [getParticipantKYC],
  );

  return <KYCContext value={value}>{children}</KYCContext>;
};

export function useParticipantKYC(
  userId: string,
): KYCParticipantInfo | null {
  const { getParticipantKYC } = use(KYCContext);
  return getParticipantKYC(userId);
}

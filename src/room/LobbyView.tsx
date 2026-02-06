/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type FC,
  useCallback,
  useMemo,
  useState,
  type JSX,
  useEffect,
} from "react";
import { useTranslation } from "react-i18next";
import { type MatrixClient, type Room } from "matrix-js-sdk";
import { Button } from "@vector-im/compound-web";
import classNames from "classnames";
import { logger } from "matrix-js-sdk/lib/logger";
import { usePreviewTracks } from "@livekit/components-react";
import {
  type CreateLocalTracksOptions,
  type LocalVideoTrack,
  Track,
} from "livekit-client";
import { useObservableEagerState } from "observable-hooks";
import { useNavigate } from "react-router-dom";

import inCallStyles from "./InCallView.module.css";
import styles from "./LobbyView.module.css";
import { Header, LeftNav, RightNav, RoomHeaderInfo } from "../Header";
import { type MatrixInfo, VideoPreview } from "./VideoPreview";
import { type MuteStates } from "../state/MuteStates";
import { InviteButton } from "../button/InviteButton";
import {
  EndCallButton,
  MicButton,
  SettingsButton,
  VideoButton,
} from "../button/Button";
import { SettingsModal, defaultSettingsTab } from "../settings/SettingsModal";
import { useMediaQuery } from "../useMediaQuery";
import { E2eeType } from "../e2ee/e2eeType";
import { Link } from "../button/Link";
import { useMediaDevices } from "../MediaDevicesContext";
import { useInitial } from "../useInitial";
import {
  useTrackProcessor,
  useTrackProcessorSync,
} from "../livekit/TrackProcessorContext";
import { usePageTitle } from "../usePageTitle";
import { getValue } from "../utils/observable";
import { useBehavior } from "../useBehavior";
import { useOptionalKYCRoomRequirement } from "../kyc/useKYCState";
import type { KYCLevel } from "../kyc/types";
import {
  isNativeBridgeAvailable,
  requestNativeKYCVerification,
  setNativeKYCRoomRequirement,
  type KYCVerificationResult,
} from "../kyc/NativeBridge";

interface Props {
  client: MatrixClient;
  matrixInfo: MatrixInfo;
  muteStates: MuteStates;
  onEnter: () => void;
  enterLabel?: JSX.Element | string;
  confineToRoom: boolean;
  hideHeader: boolean;
  participantCount: number | null;
  onShareClick: (() => void) | null;
  waitingForInvite?: boolean;
  room?: Room;
}

export const LobbyView: FC<Props> = ({
  client,
  matrixInfo,
  muteStates,
  onEnter,
  enterLabel,
  confineToRoom,
  hideHeader,
  participantCount,
  onShareClick,
  waitingForInvite,
  room,
}) => {
  useEffect(() => {
    logger.info("[Lifecycle] LobbyView Component mounted");
    return (): void => {
      logger.info("[Lifecycle] LobbyView Component unmounted");
    };
  }, []);

  const { t } = useTranslation();
  usePageTitle(matrixInfo.roomName);

  const audioEnabled = useBehavior(muteStates.audio.enabled$);
  const videoEnabled = useBehavior(muteStates.video.enabled$);
  const toggleAudio = useBehavior(muteStates.audio.toggle$);
  const toggleVideo = useBehavior(muteStates.video.toggle$);

  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState(defaultSettingsTab);

  const openSettings = useCallback(
    () => setSettingsModalOpen(true),
    [setSettingsModalOpen],
  );
  const closeSettings = useCallback(
    () => setSettingsModalOpen(false),
    [setSettingsModalOpen],
  );

  const navigate = useNavigate();
  const onLeaveClick = useCallback(() => {
    navigate("/")?.catch((error) => {
      logger.error("Failed to navigate to /", error);
    });
  }, [navigate]);

  const recentsButtonInFooter = useMediaQuery("(max-height: 500px)");
  const recentsButton = !confineToRoom && (
    <Link className={styles.recents} to="/">
      {t("lobby.leave_button")}
    </Link>
  );

  const devices = useMediaDevices();
  const videoInputId = useObservableEagerState(
    devices.videoInput.selected$,
  )?.id;

  // Capture the audio options as they were when we first mounted, because
  // we're not doing anything with the audio anyway so we don't need to
  // re-open the devices when they change (see below).
  const initialAudioOptions = useInitial(
    () =>
      audioEnabled && {
        deviceId: getValue(devices.audioInput.selected$)?.id,
      },
  );

  const { processor } = useTrackProcessor();

  const initialProcessor = useInitial(() => processor);
  const localTrackOptions = useMemo<CreateLocalTracksOptions>(
    () => ({
      // The only reason we request audio here is to get the audio permission
      // request over with at the same time. But changing the audio settings
      // shouldn't cause this hook to recreate the track, which is why we
      // reference the initial values here.
      // We also pass in a clone because livekit mutates the object passed in,
      // which would cause the devices to be re-opened on the next render.
      audio: Object.assign({}, initialAudioOptions),
      video: videoEnabled && {
        deviceId: videoInputId,
        processor: initialProcessor,
      },
    }),
    [initialAudioOptions, videoEnabled, videoInputId, initialProcessor],
  );

  const onError = useCallback(
    (error: Error) => {
      logger.error("Error while creating preview Tracks:", error);
      muteStates.audio.setEnabled$.value?.(false);
      muteStates.video.setEnabled$.value?.(false);
    },
    [muteStates],
  );

  const tracks = usePreviewTracks(localTrackOptions, onError);

  const videoTrack = useMemo(
    () =>
      (tracks?.find((t) => t.kind === Track.Kind.Video) ??
        null) as LocalVideoTrack | null,
    [tracks],
  );

  useEffect(() => {
    if (videoTrack && videoInputId === undefined) {
      // If we have a video track but no videoInputId,
      // we have to update the available devices. So that we select the first
      // available video input device as the default instead of the `""` id.
      devices.requestDeviceNames();
    }
  }, [devices, videoInputId, videoTrack]);

  useTrackProcessorSync(videoTrack);

  // --- KYC Enforcement ---
  const kycRequirement = useOptionalKYCRoomRequirement(room);
  const [kycEnabled, setKycEnabled] = useState(false);
  const [kycLevel, setKycLevel] = useState<KYCLevel>("standard");

  // [TODO]: request from Native if room creator verified KYC. 
  // if verified then it should enabled the KYC process. 
  // Only the room creator (call initiator) can toggle KYC requirements
  const isRoomCreator = useMemo(() => {
    if (!room || !client) return false;
    const creatorId = room.getCreator();
    return creatorId === client.getUserId();
  }, [room, client]);

  // Sync local state with room state
  useEffect(() => {
    if (kycRequirement) {
      setKycEnabled(true);
      setKycLevel("standard");
    } else {
      setKycEnabled(false);
    }
  }, [kycRequirement]);

  // Creator: toggle KYC on/off for the room via native bridge.
  // The Widget API does not support custom actions - all KYC communication
  // must go through AndroidKYCBridge which the native app handles directly.
  const handleKycToggle = useCallback(() => {
    const newEnabled = !kycEnabled;
    setKycEnabled(newEnabled);

    setNativeKYCRoomRequirement({
      roomId: matrixInfo.roomId,
      userId: matrixInfo.userId,
      enabled: newEnabled,
      level: newEnabled ? kycLevel : "none",
    });
  }, [kycEnabled, kycLevel, matrixInfo.roomId, matrixInfo.userId]);

  // --- Joiner: KYC verification via native Android bridge ---
  const [kycVerified, setKycVerified] = useState(false);
  const [kycVerifying, setKycVerifying] = useState(false);
  const [kycError, setKycError] = useState<string | null>(null);

  // A non-creator must verify if the room has a KYC requirement.
  const mustVerifyKyc = !isRoomCreator && kycRequirement !== null &&
    kycRequirement !== undefined;

  const handleKycVerification = useCallback(() => {
    setKycVerifying(true);
    setKycError(null);

    // Check if we're in the Android WebView with the bridge injected.
    if (!isNativeBridgeAvailable()) {
      logger.error("[KYC] Native bridge not available - cannot verify outside Android app");
      setKycError(t("lobby.kyc_bridge_unavailable", "KYC verification is only available in the mobile app"));
      setKycVerifying(false);
      return;
    }

    requestNativeKYCVerification({
      roomId: matrixInfo.roomId,
      userId: matrixInfo.userId,
      level: kycRequirement?.required_level ?? "standard",
    })
      .then((result: KYCVerificationResult) => {
        logger.info("[KYC] Verification succeeded", {
          hasToken: !!result.token,
        });
        setKycVerified(true);
        setKycVerifying(false);
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "Verification failed";
        logger.error("[KYC] Verification failed", e);
        setKycError(message);
        setKycVerifying(false);
      });
  }, [kycRequirement, matrixInfo.roomId, matrixInfo.userId, t]);

  // TODO: Unify this component with InCallView, so we can get slick joining
  // animations and don't have to feel bad about reusing its CSS
  return (
    <>
      <div className={classNames(styles.room, inCallStyles.inRoom)}>
        {!hideHeader && (
          <Header>
            <LeftNav>
              <RoomHeaderInfo
                id={matrixInfo.roomId}
                name={matrixInfo.roomName}
                avatarUrl={matrixInfo.roomAvatar}
                encrypted={matrixInfo.e2eeSystem.kind !== E2eeType.NONE}
                participantCount={participantCount}
              />
            </LeftNav>
            <RightNav>
              {onShareClick !== null && <InviteButton onClick={onShareClick} />}
            </RightNav>
          </Header>
        )}
        <div className={styles.content}>
          <VideoPreview
            matrixInfo={matrixInfo}
            videoEnabled={videoEnabled}
            videoTrack={videoTrack}
          >
            {/* Non-creator in a KYC-required room: must verify first */}
            {mustVerifyKyc && !kycVerified ? (
              <div className={styles.kycVerificationGate}>
                <p className={styles.kycVerificationMessage}>
                  {t(
                    "lobby.kyc_required_message",
                    "Identity verification is required to join this call.",
                  )}
                </p>
                {kycError && (
                  <p className={styles.kycError}>{kycError}</p>
                )}
                <Button
                  className={styles.join}
                  size="lg"
                  disabled={kycVerifying}
                  onClick={handleKycVerification}
                  data-testid="lobby_verifyKyc"
                >
                  {kycVerifying
                    ? t("lobby.kyc_verifying", "Verifying...")
                    : t("lobby.kyc_verify_button", "Verify Identity")
                  }
                </Button>
              </div>
            ): (
              <Button
                className={classNames(styles.join, {
                  [styles.wait]: waitingForInvite,
                })}
                size={waitingForInvite ? "sm" : "lg"}
                disabled={waitingForInvite}
                onClick={() => {
                  if (!waitingForInvite) onEnter();
                }}
                data-testid="lobby_joinCall"
              >
                {enterLabel ?? t("lobby.join_button")}
              </Button>
            )}
          </VideoPreview>
          {!recentsButtonInFooter && recentsButton}
        </div>
        {room && isRoomCreator && (
          <div className={styles.kycFooter}>
            <div className={styles.kycSection}>
              <div className={styles.kycToggleRow}>
                <span className={styles.kycLabel} id="kyc-toggle-label">
                  {t("lobby.kyc_require_label", "Require KYC")}
                </span>
                <label className={styles.kycToggleWrapper} aria-labelledby="kyc-toggle-label">
                  <input
                    className={styles.kycToggle}
                    onChange={handleKycToggle}
                    checked={kycEnabled}
                    type="checkbox"
                  />
                  <span className={styles.kycToggleThumb} />
                </label>
              </div>
            </div>
          </div>
        )}
        <div className={inCallStyles.footer}>
          {recentsButtonInFooter && recentsButton}
          <div className={inCallStyles.buttons}>
            <MicButton
              muted={!audioEnabled}
              onClick={toggleAudio ?? undefined}
              disabled={toggleAudio === null}
            />
            <VideoButton
              muted={!videoEnabled}
              onClick={toggleVideo ?? undefined}
              disabled={toggleVideo === null}
            />
            <SettingsButton onClick={openSettings} />
            {!confineToRoom && <EndCallButton onClick={onLeaveClick} />}
          </div>
        </div>
      </div>
      {client && (
        <SettingsModal
          client={client}
          open={settingsModalOpen}
          onDismiss={closeSettings}
          tab={settingsTab}
          onTabChange={setSettingsTab}
        />
      )}
    </>
  );
};

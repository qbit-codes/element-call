/*
Copyright 2021-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

// We need to import this somewhere, once, so that the correct 'request'
// function gets set. It needs to be not in the same file as we use
// createClient, or the typescript transpiler gets confused about
// dependency references.
import "matrix-js-sdk/lib/browser-index";
// Import early so the module-level listener captures native bridge events
// before React mounts (the native side may send data seconds before KYCProvider).
import "./kyc/NativeBridge";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { logger } from "matrix-js-sdk/lib/logger";
import {
  setLogExtension as setLKLogExtension,
  setLogLevel as setLKLogLevel,
} from "livekit-client";

import { App } from "./App";
import { init as initRageshake } from "./settings/rageshake";
import { Initializer } from "./initializer";
import { AppViewModel } from "./state/AppViewModel";
import { globalScope } from "./state/ObservableScope";

window.setLKLogLevel = setLKLogLevel;

// Patch JSON.stringify to handle circular references gracefully.
// Android WebView's console bridge calls JSON.stringify on logged objects,
// which can throw TypeError on circular structures (e.g. React fiber nodes).
// This prevents that from crashing the error boundary rendering.
const _origStringify = JSON.stringify;
JSON.stringify = function (value: unknown, replacer?: unknown, space?: unknown) {
  try {
    return _origStringify.call(
      JSON,
      value,
      replacer as Parameters<typeof _origStringify>[1],
      space as Parameters<typeof _origStringify>[2],
    );
  } catch (e) {
    if (e instanceof TypeError && (e as TypeError).message?.includes("circular")) {
      const seen = new WeakSet();
      return _origStringify.call(
        JSON,
        value,
        function (_key: string, val: unknown) {
          if (typeof val === "object" && val !== null) {
            if (seen.has(val)) return "[Circular]";
            seen.add(val);
          }
          return val;
        },
        space as Parameters<typeof _origStringify>[2],
      );
    }
    throw e;
  }
} as typeof JSON.stringify;

initRageshake().catch((e) => {
  logger.error("Failed to initialize rageshake", e);
});
setLKLogLevel("info");
setLKLogExtension((level, msg, context) => {
  // we pass a synthetic logger name of "livekit" to the rageshake to make it easier to read
  global.mx_rage_logger.log(level, "livekit", msg, context);
});

logger.info(`Element Call ${import.meta.env.VITE_APP_VERSION || "dev"}`);

const root = createRoot(document.getElementById("root")!);

let fatalError: Error | null = null;

if (!window.isSecureContext) {
  fatalError = new Error(
    "This app cannot run in an insecure context. To fix this, access the app " +
      "via a local loopback address, or serve it over HTTPS.\n" +
      "https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts",
  );
} else if (!navigator.mediaDevices) {
  fatalError = new Error("Your browser does not support WebRTC.");
}

if (fatalError !== null) {
  root.render(fatalError.message);
  throw fatalError; // Stop the app early
}

Initializer.initBeforeReact()
  .then(() => {
    root.render(
      <StrictMode>
        <App vm={new AppViewModel(globalScope)} />
      </StrictMode>,
    );
  })
  .catch((e) => {
    logger.error("Failed to initialize app", e);
    root.render(e.message);
  });

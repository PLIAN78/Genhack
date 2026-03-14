"use client";

import { useEffect } from "react";

/**
 * Suppresses non-error INFO/WARNING messages that MediaPipe's TF Lite WASM
 * runtime emits through console.error. Next.js dev mode intercepts these
 * and shows them in the error overlay even though they are harmless.
 */
export default function SuppressMediaPipeLogs() {
  useEffect(() => {
    const originalError = console.error;

    console.error = (...args: unknown[]) => {
      const msg = typeof args[0] === "string" ? args[0] : "";
      // MediaPipe/TF Lite info messages to suppress
      if (
        msg.includes("Created TensorFlow Lite XNNPACK delegate") ||
        msg.includes("Inference error") ||
        msg.includes("landmark_projection_calculator")
      ) {
        // Downgrade to console.info so it doesn't trigger the Next.js error overlay
        console.info("[MediaPipe]", ...args);
        return;
      }
      originalError.apply(console, args);
    };

    return () => {
      console.error = originalError;
    };
  }, []);

  return null;
}

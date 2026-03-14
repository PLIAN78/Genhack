"use client";
import { useRef, useCallback, useEffect, useState } from "react";
import { ImageEmbedder, FilesetResolver } from "@mediapipe/tasks-vision";

// Recompute the face embedding at most once per this many frames (~3 seconds
// at 30 fps). Computing every frame would be wasteful; the embedding is used
// for registry matching, not real-time display.
const EMBED_INTERVAL_FRAMES = 90;

// The MobileNet V3 Small model produces 1024-dimensional float embeddings.
// Must match the vector(1024) column in the Supabase migration.
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_embedder/mobilenet_v3_small/float32/1/mobilenet_v3_small.task";

// Crop is resized to this before embedding — matches the model's expected input.
const CROP_SIZE = 224;

// Padding added around the face bounding box as a fraction of face dimensions.
const BBOX_PADDING = 0.2;

export function useFaceEmbedding() {
  const embedderRef = useRef<ImageEmbedder | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isReady, setIsReady] = useState(false);
  const frameCounterRef = useRef(0);
  // Holds the most recent successfully computed embedding.
  const lastEmbeddingRef = useRef<Float32Array | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const filesetResolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        const embedder = await ImageEmbedder.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: "GPU",
          },
          quantize: false,
          runningMode: "IMAGE",
        });

        if (!cancelled) {
          embedderRef.current = embedder;
          const canvas = document.createElement("canvas");
          canvas.width = CROP_SIZE;
          canvas.height = CROP_SIZE;
          offscreenCanvasRef.current = canvas;
          setIsReady(true);
        }
      } catch (err) {
        console.error("[FaceEmbedding] Failed to initialize ImageEmbedder:", err);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Called every frame from the LiveCamera processing loop.
   * Returns the most recently computed embedding (refreshed every
   * EMBED_INTERVAL_FRAMES frames when a face is visible).
   * Never throws — failures return the previous embedding or null.
   */
  const processFrame = useCallback(
    (
      video: HTMLVideoElement,
      landmarks: { x: number; y: number }[] | null
    ): Float32Array | null => {
      frameCounterRef.current += 1;

      if (
        !isReady ||
        !embedderRef.current ||
        !landmarks ||
        !offscreenCanvasRef.current
      ) {
        return lastEmbeddingRef.current;
      }

      // Only recompute on the interval to avoid per-frame overhead.
      if (frameCounterRef.current % EMBED_INTERVAL_FRAMES !== 0) {
        return lastEmbeddingRef.current;
      }

      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) return lastEmbeddingRef.current;

      // Compute face bounding box from landmark positions (normalised 0–1).
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const lm of landmarks) {
        if (lm.x < minX) minX = lm.x;
        if (lm.y < minY) minY = lm.y;
        if (lm.x > maxX) maxX = lm.x;
        if (lm.y > maxY) maxY = lm.y;
      }

      const faceW = (maxX - minX) * w;
      const faceH = (maxY - minY) * h;
      const padX = faceW * BBOX_PADDING;
      const padY = faceH * BBOX_PADDING;

      const cropX = Math.max(0, minX * w - padX);
      const cropY = Math.max(0, minY * h - padY);
      const cropW = Math.min(w - cropX, faceW + 2 * padX);
      const cropH = Math.min(h - cropY, faceH + 2 * padY);

      if (cropW <= 0 || cropH <= 0) return lastEmbeddingRef.current;

      try {
        const ctx = offscreenCanvasRef.current.getContext("2d");
        if (!ctx) return lastEmbeddingRef.current;

        ctx.clearRect(0, 0, CROP_SIZE, CROP_SIZE);
        ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, CROP_SIZE, CROP_SIZE);

        const result = embedderRef.current.embed(offscreenCanvasRef.current);
        // floatEmbedding is typed as number[] by the MediaPipe library.
        // Convert to Float32Array for efficient storage and comparison.
        const raw = result.embeddings[0]?.floatEmbedding ?? null;
        if (raw) {
          lastEmbeddingRef.current = new Float32Array(raw);
        }
      } catch (err) {
        // Embedding errors must not propagate into the camera processing loop.
        console.error("[FaceEmbedding] embed error:", err);
      }

      return lastEmbeddingRef.current;
    },
    [isReady]
  );

  return { isReady, processFrame, lastEmbeddingRef };
}

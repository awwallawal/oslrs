import React, { useRef, useState, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import Human from '@vladmandic/human';
import { SkeletonCard } from '../../../components/skeletons';
import { logger } from '../../../lib/logger';

/** Timeout for face detection model loading (seconds) */
const MODEL_LOAD_TIMEOUT_MS = 15_000;

interface LiveSelfieCaptureProps {
  onCapture: (file: File) => void;
}

const LiveSelfieCapture: React.FC<LiveSelfieCaptureProps> = ({ onCapture }) => {
  const webcamRef = useRef<Webcam>(null);
  const [human, setHuman] = useState<Human | null>(null);
  const [faceCount, setFaceCount] = useState<number>(0);
  const [isModelLoading, setIsModelLoading] = useState<boolean>(true);
  const [modelFailed, setModelFailed] = useState<boolean>(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadWithTimeout = async () => {
      try {
        const loadPromise = (async () => {
          const humanInstance = new Human({
            modelBasePath: 'https://cdn.jsdelivr.net/npm/@vladmandic/human/models/',
            filter: { enabled: true, equalization: false },
            face: { enabled: true, detector: { rotation: false }, mesh: { enabled: false }, iris: { enabled: false }, emotion: { enabled: false } },
            body: { enabled: false },
            hand: { enabled: false },
            gesture: { enabled: false },
            object: { enabled: false },
          });
          await humanInstance.load();
          await humanInstance.warmup();
          return humanInstance;
        })();

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Model load timeout')), MODEL_LOAD_TIMEOUT_MS)
        );

        const humanInstance = await Promise.race([loadPromise, timeoutPromise]);
        if (!cancelled) {
          setHuman(humanInstance);
          setIsModelLoading(false);
        }
      } catch (e) {
        logger.error('Failed to load face detection model:', e);
        if (!cancelled) {
          setModelFailed(true);
          setIsModelLoading(false);
        }
      }
    };

    loadWithTimeout();
    return () => { cancelled = true; };
  }, []);

  const detectFace = useCallback(async () => {
    if (!human || !webcamRef.current || !webcamRef.current.video || capturedImage) return;

    try {
      const result = await human.detect(webcamRef.current.video);
      setFaceCount(result.face.length);
    } catch (e) {
      logger.error('Detection error:', e);
    }
  }, [human, capturedImage]);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>;
    if (human && !capturedImage) {
      intervalId = setInterval(detectFace, 500);
    }
    return () => clearInterval(intervalId);
  }, [human, detectFace, capturedImage]);

  const capture = useCallback(() => {
    if (!webcamRef.current) return;
    const imageSrc = webcamRef.current.getScreenshot();
    if (imageSrc) {
      setCapturedImage(imageSrc);
    }
  }, [webcamRef]);

  const retake = () => {
    setCapturedImage(null);
    setFaceCount(0);
  };

  const confirm = async () => {
    if (!capturedImage) return;

    const res = await fetch(capturedImage);
    const blob = await res.blob();
    const file = new File([blob], "selfie.jpg", { type: "image/jpeg" });
    onCapture(file);
  };

  // Face detection is available only when model loaded successfully
  const faceDetectionReady = !isModelLoading && !modelFailed && human !== null;

  // Allow capture when: model loaded and 1 face detected, OR model failed/timed out (skip face check)
  const canCapture = !isModelLoading && (modelFailed || faceCount === 1);

  return (
    <div className="flex flex-col items-center space-y-4">
      <div className="relative w-full max-w-md aspect-[3/4] bg-black rounded-lg overflow-hidden">
        {capturedImage ? (
          <img src={capturedImage} alt="Captured" className="w-full h-full object-cover" />
        ) : (
          <>
            <Webcam
              audio={false}
              ref={webcamRef}
              screenshotFormat="image/jpeg"
              /*
               * ⚠️ PORTRAIT, to match the 3:4 preview box (fixed 2026-08-09).
               *
               * This used to request 1280x720 — LANDSCAPE — inside an
               * `aspect-[3/4]` PORTRAIT container with `objectFit: 'cover'`.
               * Cover crops to fill, so the operator saw a tight portrait of
               * their face while `getScreenshot()` returned the FULL 16:9 frame:
               * a wide shot with the face small and centred. **What you saw was
               * never what was saved**, and the oval guide below aligned to the
               * preview, so following it made the framing worse, not better.
               *
               * Found on prod by the enumerator invite dry run: the operator
               * reported "the camera is not really capturing the face" and gave
               * up — and the logs show NO `activation.selfie_processed` and NO
               * `activation.selfie_failed`, i.e. no selfie was ever submitted.
               * The ID card would have shipped with no photo at all.
               *
               * 3:4 at 960x1280 matches the container, so preview == capture and
               * the guide means something. `ideal` (not `exact`) so a device that
               * cannot do portrait still yields a stream rather than throwing
               * OverconstrainedError and killing activation entirely.
               */
              videoConstraints={{
                facingMode: 'user',
                aspectRatio: 3 / 4,
                width: { min: 480, ideal: 960 },
                height: { min: 640, ideal: 1280 },
              }}
              width={960}
              height={1280}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              data-testid="webcam-mock"
            />
            {/*
              * Framing guide. Now that the stream is 3:4 like this box, what is
              * inside the oval is genuinely what gets captured — before the fix
              * this circle was decorative, inset from a preview that did not
              * correspond to the saved frame.
              */}
            <div className="absolute inset-0 border-2 border-white/50 rounded-full m-12 pointer-events-none" />
            <p className="absolute bottom-3 left-0 right-0 text-center text-xs text-white/80 pointer-events-none">
              Fill the oval with your face
            </p>

            {isModelLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <SkeletonCard className="w-full h-full border-none shadow-none" />
              </div>
            )}

            {/* Face detection status overlay */}
            {faceDetectionReady && (
              <div className="absolute top-4 left-0 right-0 text-center">
                {faceCount === 0 && <span className="bg-red-500 text-white px-2 py-1 rounded">No face detected</span>}
                {faceCount > 1 && <span className="bg-red-500 text-white px-2 py-1 rounded">Multiple faces detected</span>}
                {faceCount === 1 && <span className="bg-green-500 text-white px-2 py-1 rounded">Face detected</span>}
              </div>
            )}

            {/* Model failed — camera still works */}
            {modelFailed && (
              <div className="absolute top-4 left-0 right-0 text-center">
                <span className="bg-amber-500 text-white px-2 py-1 rounded text-sm">
                  Face detection unavailable — you can still capture
                </span>
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex gap-4">
        {!capturedImage ? (
          <button
            onClick={capture}
            disabled={!canCapture}
            className="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-full disabled:bg-neutral-400 disabled:cursor-not-allowed transition-colors"
          >
            Capture
          </button>
        ) : (
          <>
            <button
              onClick={retake}
              className="px-6 py-2 bg-neutral-200 hover:bg-neutral-300 text-neutral-800 rounded-full transition-colors"
            >
              Retake
            </button>
            <button
              onClick={confirm}
              className="px-6 py-2 bg-success-600 hover:bg-success-600/90 text-white rounded-full transition-colors"
            >
              Use Photo
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default LiveSelfieCapture;

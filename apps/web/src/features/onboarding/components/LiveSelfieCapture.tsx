import React, { useRef, useState, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import Human from '@vladmandic/human';
import { SkeletonCard } from '../../../components/skeletons';
import { logger } from '../../../lib/logger';

/** Timeout for face detection model loading (seconds) */
const MODEL_LOAD_TIMEOUT_MS = 15_000;

interface LiveSelfieCaptureProps {
  /**
   * @param file  The image.
   * @param source WHICH path produced it (Story 13-60 AC6.2). The caller must
   *   pass this through to the API — an uploaded passport photograph stored as
   *   a live capture recreates, self-inflicted, the exact defect 13-60 fixes.
   */
  onCapture: (file: File, source: 'live_capture' | 'upload') => void;
}

/** Uploaded files are re-encoded below this pixel bound before leaving the device. */
const UPLOAD_MAX_DIMENSION = 1600;

/** Matches the API's own 5MB ceiling; we downscale rather than let it 400. */
const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

const LiveSelfieCapture: React.FC<LiveSelfieCaptureProps> = ({ onCapture }) => {
  const webcamRef = useRef<Webcam>(null);
  const [human, setHuman] = useState<Human | null>(null);
  const [faceCount, setFaceCount] = useState<number>(0);
  const [isModelLoading, setIsModelLoading] = useState<boolean>(true);
  const [modelFailed, setModelFailed] = useState<boolean>(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadWithTimeout = async () => {
      try {
        const loadPromise = (async () => {
          const humanInstance = new Human({
            modelBasePath: 'https://cdn.jsdelivr.net/npm/@vladmandic/human/models/',
            /*
             * ⚠️ `warmup: 'none'` — DO NOT re-enable, and do not call `.warmup()` (2026-08-10).
             *
             * Human's warmup pre-compiles the graph by running inference on a built-in sample
             * image which it ships as a base64 `data:` URI and fetches. `fetch()` of a `data:`
             * URL is governed by CSP **connect-src**, which did not list `data:` — so warmup
             * threw, the catch below set `modelFailed`, and every device showed "Face detection
             * unavailable". Proven on prod from the console, not inferred:
             *
             *   Human: version: 3.3.6                       ← the model loaded FINE
             *   Human: webgpu adapter info: {vendor:'intel'} ← backend initialised FINE
             *   Connecting to 'data:application/octet-stream;base64,…' violates the following
             *   Content Security Policy directive: "connect-src 'self' …"   ← only warmup died
             *
             * `data:` HAS since been added to connect-src, so warmup would now work. It stays
             * off anyway: warmup buys a faster FIRST inference, and this component runs
             * detection every 500ms, so the cost is invisible — while the dependency is a
             * third-party fetch we cannot see or guarantee. Not worth re-taking for that.
             */
            warmup: 'none',
            filter: { enabled: true, equalization: false },
            face: { enabled: true, detector: { rotation: false }, mesh: { enabled: false }, iris: { enabled: false }, emotion: { enabled: false } },
            body: { enabled: false },
            hand: { enabled: false },
            gesture: { enabled: false },
            object: { enabled: false },
          });
          await humanInstance.load();
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
    setCaptureError(null);
  };

  /**
   * Re-encode a chosen file to a bounded JPEG before it leaves the device.
   *
   * A modern phone photograph is routinely 4-8MB, and the API rejects anything
   * over 5MB — so uploading the original would fail for a large share of the
   * people this fallback exists to serve, which is the failure mode 13-60 is
   * about. Downscaling here keeps that off the field-day path entirely.
   */
  const downscaleImage = (file: File, maxDimension: number): Promise<File> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.onload = (ev) => {
        const img = new Image();
        img.onerror = () => reject(new Error('Failed to decode image'));
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDimension || height > maxDimension) {
            const ratio = Math.min(maxDimension / width, maxDimension / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('Failed to get canvas context'));
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              if (!blob) return reject(new Error('Failed to encode image'));
              resolve(new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
            },
            'image/jpeg',
            0.9,
          );
        };
        img.src = ev.target?.result as string;
      };
      reader.readAsDataURL(file);
    });

  /**
   * Turn the `getScreenshot()` data URL into a File — WITHOUT `fetch()`.
   *
   * ⚠️ This used to be `await fetch(capturedImage)`, and it is why "Use Photo" did nothing at
   * all on prod: `fetch()` of a `data:` URL is governed by CSP **connect-src**, which did not
   * list `data:`. It threw, the function had no try/catch, the rejection was unhandled, and the
   * button was inert with no message, no spinner and no log. An enumerator could not submit a
   * selfie, so could not get an ID card — found only by an operator with devtools open.
   *
   * Decoding in-process removes the failure mode rather than permitting it: no network layer, no
   * CSP surface, nothing to misconfigure. `data:` has also been added to connect-src, but this
   * function no longer depends on it — belt and braces, deliberately.
   */
  const dataUrlToFile = (dataUrl: string, filename: string): File => {
    const [header, encoded] = dataUrl.split(',');
    if (!encoded) throw new Error('Malformed image data');
    const mime = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg';
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], filename, { type: mime });
  };

  const confirm = () => {
    if (!capturedImage) return;

    // A capture step that can fail without saying so is how this cost two field-day
    // attempts. Any throw from here is now visible to the person standing in front of it.
    try {
      setCaptureError(null);
      onCapture(dataUrlToFile(capturedImage, 'selfie.jpg'), 'live_capture');
    } catch (e) {
      logger.error('Failed to prepare the captured selfie:', e);
      setCaptureError(
        'We could not prepare your photo. Please tap Retake and try again — if it keeps failing, you can continue and add your photo later.',
      );
    }
  };

  /**
   * Story 13-60 AC5.4 + AC6 — THE RECORDED WAY THROUGH.
   *
   * `canCapture` disables the button when the model is healthy and sees no
   * face. That check cannot be satisfied by someone the detector will not
   * detect, and it could not be overridden — so it converted a required step
   * into a SKIPPED one, which then landed in the silent swallow on the server.
   * A check you cannot pass and cannot bypass is worse than no check.
   *
   * The way through is an upload, and it is RECORDED as an upload
   * (`source: 'upload'`) rather than quietly stored as though a camera had
   * produced it. Live capture stays the default and preferred path; nothing
   * here makes it easier to avoid than to use.
   *
   * ⚠️ This forfeits no anti-fraud property, because there is none to forfeit:
   * the stored score is an image-sharpness ratio (not liveness), nothing gates
   * on it, `liveSelfieVerifiedAt` is auto-set, and the only real check is
   * "one face in frame" — which a printed photograph also satisfies.
   */
  const handleUploadChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Let the same file be re-chosen after a failure.
    e.target.value = '';
    if (!file) return;

    setCaptureError(null);
    try {
      const prepared = await downscaleImage(file, UPLOAD_MAX_DIMENSION);
      if (prepared.size > UPLOAD_MAX_BYTES) {
        setCaptureError('That image is too large even after resizing. Please choose a smaller photo.');
        return;
      }
      onCapture(prepared, 'upload');
    } catch (err) {
      logger.error('Failed to prepare the uploaded photo:', err);
      setCaptureError('We could not read that image file. Please choose a different photo.');
    }
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

            {/*
              * Model failed — camera still works.
              *
              * ⚠️ Story 13-60 AC5.5. The most likely cause in the field is not a
              * bug: the model is fetched from a THIRD-PARTY CDN
              * (cdn.jsdelivr.net) at activation time with a 15s timeout, so a
              * field officer on poor connectivity lands here. It used to say
              * only "unavailable", leaving them to guess whether their photo
              * would count. Say what it means and what to do.
              */}
            {modelFailed && (
              <div className="absolute top-4 left-2 right-2 text-center">
                <span className="bg-warning-600 text-white px-2 py-1 rounded text-sm inline-block">
                  Face detection unavailable (poor connection?) — capture still works. Centre your
                  face in the oval.
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/*
        * The whole point of the 2026-08-10 fix: a failure here must be SEEN.
        *
        * ⚠️ Story 13-60: the palette classes were `text-error-700 bg-error-50
        * border-error-200`, and NONE of those three tokens exist — the theme
        * defines only `-100` and `-600` for semantic colours (index.css
        * @theme). So the alert added specifically to make a silent failure
        * visible was rendering as unstyled black-on-white text. Corrected to
        * defined tokens.
        */}
      {captureError && (
        <p role="alert" className="max-w-md text-center text-sm text-neutral-900 bg-error-100 border border-error-600 rounded-md px-3 py-2">
          {captureError}
        </p>
      )}

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

      {/*
        * Story 13-60 AC5.4 — the way out of the no-face dead-end.
        *
        * Shown only BEFORE a capture is confirmed, and deliberately styled as a
        * quiet secondary action: live capture stays the default and preferred
        * path. It becomes prominent exactly when the person is stuck — the
        * model is working, it sees no face, and the Capture button is disabled.
        */}
      {!capturedImage && (
        <div className="w-full max-w-md text-center space-y-2">
          {faceDetectionReady && faceCount === 0 && (
            <p className="text-sm text-neutral-700">
              Not being detected? You can use an existing passport photograph instead.
            </p>
          )}
          <label
            className="inline-block text-sm text-primary-600 hover:text-primary-700 underline cursor-pointer"
            data-testid="upload-photo-label"
          >
            Upload a photo instead
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={handleUploadChosen}
              data-testid="upload-photo-input"
            />
          </label>
          <p className="text-xs text-neutral-500">
            A clear, front-facing passport photograph. We record that this one was uploaded
            rather than taken here.
          </p>
        </div>
      )}
    </div>
  );
};

export default LiveSelfieCapture;

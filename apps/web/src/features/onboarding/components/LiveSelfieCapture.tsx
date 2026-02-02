import React, { useRef, useState, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import Human from '@vladmandic/human';
import { SkeletonCard } from '../../../components/skeletons';
import { useToast } from '../../../hooks/useToast';
import { useDelayedLoading } from '../../../hooks/useDelayedLoading';
import { logger } from '../../../lib/logger';

interface LiveSelfieCaptureProps {
  onCapture: (file: File) => void;
}

const LiveSelfieCapture: React.FC<LiveSelfieCaptureProps> = ({ onCapture }) => {
  const webcamRef = useRef<Webcam>(null);
  const [human, setHuman] = useState<Human | null>(null);
  const [faceCount, setFaceCount] = useState<number>(0);
  const [isModelLoadingRaw, setIsModelLoadingRaw] = useState<boolean>(true);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [hasError, setHasError] = useState<boolean>(false);
  const toast = useToast();

  // Use delayed loading to prevent skeleton flash (AC1: 200ms minimum display)
  const isModelLoading = useDelayedLoading(isModelLoadingRaw);

  useEffect(() => {
    const initHuman = async () => {
      try {
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
        setHuman(humanInstance);
        setIsModelLoadingRaw(false);
      } catch (e) {
        logger.error('Failed to load Human:', e);
        setHasError(true);
        setIsModelLoadingRaw(false);
      }
    };
    initHuman();
  }, []);

  // Show toast error when hasError is set (separate effect to avoid dependency issues)
  useEffect(() => {
    if (hasError) {
      toast.error({ message: 'Failed to load face detection models. Please refresh the page.' });
    }
  }, [hasError, toast]);

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
      intervalId = setInterval(detectFace, 500); // Check every 500ms
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
    
    // Convert base64 to File
    const res = await fetch(capturedImage);
    const blob = await res.blob();
    const file = new File([blob], "selfie.jpg", { type: "image/jpeg" });
    onCapture(file);
  };

  // Error state handled via Toast notification - show empty state with retry option
  if (hasError) {
    return (
      <div className="text-center py-8">
        <p className="text-neutral-600 mb-4">Unable to load camera. Please refresh the page to try again.</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded transition-colors"
        >
          Refresh Page
        </button>
      </div>
    );
  }

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
              videoConstraints={{ facingMode: 'user', aspectRatio: 3/4 }}
              className="w-full h-full object-cover"
              data-testid="webcam-mock" // Added for test stability if mock doesn't propagate
            />
            {/* Overlay Guide */}
            <div className="absolute inset-0 border-2 border-white/50 rounded-full m-12 pointer-events-none" />
            
            {isModelLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <SkeletonCard className="w-full h-full border-none shadow-none" />
              </div>
            )}

            {!isModelLoading && (
              <div className="absolute top-4 left-0 right-0 text-center">
                {faceCount === 0 && <span className="bg-red-500 text-white px-2 py-1 rounded">No face detected</span>}
                {faceCount > 1 && <span className="bg-red-500 text-white px-2 py-1 rounded">Multiple faces detected</span>}
                {faceCount === 1 && <span className="bg-green-500 text-white px-2 py-1 rounded">Face detected</span>}
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex gap-4">
        {!capturedImage ? (
          <button
            onClick={capture}
            disabled={faceCount !== 1 || isModelLoading}
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
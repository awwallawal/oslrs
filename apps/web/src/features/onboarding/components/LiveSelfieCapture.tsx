import React, { useRef, useState, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import Human from '@vladmandic/human';

interface LiveSelfieCaptureProps {
  onCapture: (file: File) => void;
}

const LiveSelfieCapture: React.FC<LiveSelfieCaptureProps> = ({ onCapture }) => {
  const webcamRef = useRef<Webcam>(null);
  const [human, setHuman] = useState<Human | null>(null);
  const [faceCount, setFaceCount] = useState<number>(0);
  const [isModelLoading, setIsModelLoading] = useState<boolean>(true);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        setIsModelLoading(false);
      } catch (e) {
        console.error('Failed to load Human:', e);
        setError('Failed to load face detection models');
        setIsModelLoading(false);
      }
    };
    initHuman();
  }, []);

  const detectFace = useCallback(async () => {
    if (!human || !webcamRef.current || !webcamRef.current.video || capturedImage) return;

    try {
      const result = await human.detect(webcamRef.current.video);
      setFaceCount(result.face.length);
    } catch (e) {
      console.error('Detection error:', e);
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

  if (error) return <div className="text-red-500">{error}</div>;

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
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
                Loading models...
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
            className="px-6 py-2 bg-blue-600 text-white rounded-full disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            Capture
          </button>
        ) : (
          <>
            <button
              onClick={retake}
              className="px-6 py-2 bg-gray-200 text-gray-800 rounded-full"
            >
              Retake
            </button>
            <button
              onClick={confirm}
              className="px-6 py-2 bg-green-600 text-white rounded-full"
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
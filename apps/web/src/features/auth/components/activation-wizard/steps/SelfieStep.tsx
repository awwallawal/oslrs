import { useState, useCallback, lazy, Suspense } from 'react';
import { Camera, AlertCircle, CheckCircle2, SkipForward } from 'lucide-react';
import { cn } from '../../../../../lib/utils';
import { SkeletonCard } from '../../../../../components/skeletons';
import type { StepRenderProps } from '../ActivationWizard';

// Lazy load the LiveSelfieCapture component to reduce initial bundle size
const LiveSelfieCapture = lazy(
  () => import('../../../../onboarding/components/LiveSelfieCapture')
);

/**
 * Maximum image dimensions for base64 encoding
 * Keeps file size reasonable while maintaining quality for ID card
 */
const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1440;

/**
 * Resize image if it exceeds maximum dimensions
 * Returns a base64 string of the resized image
 */
async function resizeImageToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;

        // Calculate new dimensions maintaining aspect ratio
        if (width > MAX_WIDTH || height > MAX_HEIGHT) {
          const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        // Create canvas and draw resized image
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Convert to base64 (JPEG for smaller size)
        const base64 = canvas.toDataURL('image/jpeg', 0.85);
        resolve(base64);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Step 5: Selfie Capture
 *
 * Captures a live selfie for ID card generation.
 * Optional - user can skip and complete later via profile.
 */
export function SelfieStep({
  formData,
  updateFormData,
  errors,
  isSubmitting,
}: StepRenderProps) {
  const [captureMode, setCaptureMode] = useState<'idle' | 'capturing' | 'captured' | 'skipped'>(() => {
    if (formData.selfieBase64) return 'captured';
    return 'idle';
  });
  const [processingImage, setProcessingImage] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  /**
   * Handle successful image capture from LiveSelfieCapture
   */
  const handleCapture = useCallback(async (file: File) => {
    setProcessingImage(true);
    setCameraError(null);

    try {
      const base64 = await resizeImageToBase64(file);
      updateFormData({ selfieBase64: base64 });
      setCaptureMode('captured');
    } catch (err) {
      setCameraError('Failed to process image. Please try again.');
    } finally {
      setProcessingImage(false);
    }
  }, [updateFormData]);

  /**
   * Handle skipping the selfie step
   */
  const handleSkip = useCallback(() => {
    updateFormData({ selfieBase64: undefined });
    setCaptureMode('skipped');
  }, [updateFormData]);

  /**
   * Reset to capture another photo
   */
  const handleRetake = useCallback(() => {
    updateFormData({ selfieBase64: undefined });
    setCaptureMode('capturing');
    setCameraError(null);
  }, [updateFormData]);

  /**
   * Start camera capture
   */
  const handleStartCapture = useCallback(() => {
    setCaptureMode('capturing');
    setCameraError(null);
  }, []);

  return (
    <div className="space-y-5">
      {/* Step Description */}
      <div className="text-center mb-6">
        <h2 className="text-lg font-semibold text-neutral-900">
          Photo Verification
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Take a selfie for your staff ID card. This step is optional.
        </p>
      </div>

      {/* Main Content Area */}
      <div className="min-h-[400px]">
        {/* Idle State - Show start button */}
        {captureMode === 'idle' && (
          <div className="flex flex-col items-center justify-center py-12 space-y-6">
            <div className="w-24 h-24 bg-primary-100 rounded-full flex items-center justify-center">
              <Camera className="w-12 h-12 text-primary-600" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="font-medium text-neutral-900">Ready to take your photo?</h3>
              <p className="text-sm text-neutral-600 max-w-sm">
                Your photo will be used for your official staff ID card.
                Make sure you're in a well-lit area.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={handleStartCapture}
                disabled={isSubmitting}
                className={cn(
                  'px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg',
                  'font-medium transition-colors flex items-center gap-2',
                  'disabled:bg-neutral-400 disabled:cursor-not-allowed'
                )}
              >
                <Camera className="w-5 h-5" />
                Start Camera
              </button>
              <button
                type="button"
                onClick={handleSkip}
                disabled={isSubmitting}
                className={cn(
                  'px-6 py-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg',
                  'font-medium transition-colors flex items-center gap-2',
                  'disabled:bg-neutral-100 disabled:cursor-not-allowed'
                )}
              >
                <SkipForward className="w-5 h-5" />
                Skip for Now
              </button>
            </div>
          </div>
        )}

        {/* Capturing State - Show camera */}
        {captureMode === 'capturing' && (
          <div className="space-y-4">
            {cameraError ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <div className="w-16 h-16 bg-error-100 rounded-full flex items-center justify-center">
                  <AlertCircle className="w-8 h-8 text-error-600" />
                </div>
                <div className="text-center space-y-2">
                  <h3 className="font-medium text-error-700">Camera Error</h3>
                  <p className="text-sm text-neutral-600 max-w-sm">{cameraError}</p>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleStartCapture}
                    className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
                  >
                    Try Again
                  </button>
                  <button
                    type="button"
                    onClick={handleSkip}
                    className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg transition-colors"
                  >
                    Skip for Now
                  </button>
                </div>
              </div>
            ) : (
              <>
                <Suspense
                  fallback={
                    <div className="flex flex-col items-center space-y-4">
                      <SkeletonCard className="w-full max-w-md aspect-[3/4]" />
                      <p className="text-sm text-neutral-500">Loading camera...</p>
                    </div>
                  }
                >
                  <LiveSelfieCapture onCapture={handleCapture} />
                </Suspense>

                {processingImage && (
                  <div className="text-center text-sm text-neutral-500">
                    Processing image...
                  </div>
                )}

                <div className="text-center">
                  <button
                    type="button"
                    onClick={handleSkip}
                    disabled={processingImage || isSubmitting}
                    className="text-sm text-neutral-500 hover:text-neutral-700 underline"
                  >
                    Skip and complete later
                  </button>
                </div>
              </>
            )}

            {/* Camera Permission Instructions */}
            <div className="mt-4 p-3 bg-neutral-50 border border-neutral-200 rounded-lg">
              <p className="text-xs text-neutral-600">
                <strong>Camera not working?</strong> Make sure you've granted camera permission
                in your browser. Look for the camera icon in your browser's address bar.
              </p>
            </div>
          </div>
        )}

        {/* Captured State - Show preview */}
        {captureMode === 'captured' && formData.selfieBase64 && (
          <div className="flex flex-col items-center space-y-4">
            <div className="relative w-full max-w-md aspect-[3/4] bg-neutral-100 rounded-lg overflow-hidden">
              <img
                src={formData.selfieBase64}
                alt="Captured selfie"
                className="w-full h-full object-cover"
              />
              <div className="absolute top-3 right-3 bg-success-500 text-white px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Photo Captured
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleRetake}
                disabled={isSubmitting}
                className={cn(
                  'px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg',
                  'transition-colors disabled:cursor-not-allowed'
                )}
              >
                Retake Photo
              </button>
            </div>

            <p className="text-sm text-success-600 font-medium">
              Your photo is ready. Click "Complete Activation" to finish.
            </p>
          </div>
        )}

        {/* Skipped State */}
        {captureMode === 'skipped' && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center">
              <SkipForward className="w-8 h-8 text-neutral-400" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="font-medium text-neutral-700">Photo Skipped</h3>
              <p className="text-sm text-neutral-500 max-w-sm">
                You can add your photo later from your profile settings.
              </p>
            </div>
            <button
              type="button"
              onClick={handleStartCapture}
              disabled={isSubmitting}
              className={cn(
                'px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg',
                'transition-colors flex items-center gap-2',
                'disabled:bg-neutral-400 disabled:cursor-not-allowed'
              )}
            >
              <Camera className="w-4 h-4" />
              Take Photo Instead
            </button>
          </div>
        )}
      </div>

      {/* Error display */}
      {errors.selfieBase64 && (
        <p className="text-error-600 text-sm text-center">{errors.selfieBase64}</p>
      )}

      {/* Info note */}
      <div className="mt-4 p-3 bg-primary-50 border border-primary-200 rounded-lg">
        <p className="text-sm text-primary-700">
          <strong>Tips for a good photo:</strong> Face the camera directly, ensure good lighting,
          remove sunglasses or hats, and keep a neutral expression.
        </p>
      </div>
    </div>
  );
}

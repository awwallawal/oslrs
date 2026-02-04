import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from '../auth.service.js';

describe('AuthService', () => {
  describe('decodeBase64Image (private method via reflection)', () => {
    // Access private method for unit testing
    const decodeBase64Image = (AuthService as any).decodeBase64Image.bind(AuthService);

    it('should decode raw base64 string to buffer', () => {
      // Small 1x1 red pixel JPEG as base64
      const rawBase64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==';

      const buffer = decodeBase64Image(rawBase64);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should decode data URL format base64 to buffer', () => {
      const dataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==';

      const buffer = decodeBase64Image(dataUrl);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should handle PNG data URL format', () => {
      const pngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const buffer = decodeBase64Image(pngDataUrl);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should handle WebP data URL format', () => {
      const webpDataUrl = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=';

      const buffer = decodeBase64Image(webpDataUrl);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should throw error for empty base64 data', () => {
      // Empty string decodes to empty buffer, which should throw
      expect(() => decodeBase64Image('')).toThrow('Invalid base64 image data');
    });

    it('should return same buffer for raw base64 and data URL of same image', () => {
      const rawBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const dataUrl = `data:image/png;base64,${rawBase64}`;

      const bufferFromRaw = decodeBase64Image(rawBase64);
      const bufferFromDataUrl = decodeBase64Image(dataUrl);

      expect(bufferFromRaw.equals(bufferFromDataUrl)).toBe(true);
    });
  });
});

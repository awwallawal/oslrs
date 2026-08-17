/**
 * Story 13-59 (AC8.1) — assertions on the ARTEFACT, not on the arrival.
 *
 * ## Why this file exists next to `id-card.service.test.ts`
 *
 * That file mocks PDFKit and QRCode wholesale and asserts on the `doc.image()`
 * / `doc.text()` calls. That is a useful layout test and it is kept. But it
 * cannot answer the question AC8.1 actually asks, because a mocked PDFKit
 * produces no PDF: *"'I received the email' and 'the modal appeared' are both
 * tests that pass over a hole. **A card with an empty photo box downloads
 * perfectly well.**"*
 *
 * So this file mocks NOTHING. Real PDFKit, real QRCode, real image bytes, and
 * assertions on the resulting file:
 *
 *   - **the PDF opens** — `%PDF-` header and an `%%EOF` trailer;
 *   - **the photo is present** — embedded image streams, and a card rendered
 *     with a different photo is a different file;
 *   - **the QR resolves** — see the note on that test for exactly what is and
 *     is not proven here, because overstating it would be the same defect in a
 *     new place.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';
import { IDCardService } from '../id-card.service.js';

const service = new IDCardService();

/** A real JPEG with real detail — a flat colour compresses to almost nothing. */
async function makePhoto(seed: number): Promise<Buffer> {
  const width = 200;
  const height = 250;
  const channels = 3;
  const pixels = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      pixels[i] = (x * seed) % 256;
      pixels[i + 1] = (y * seed * 2) % 256;
      pixels[i + 2] = (x + y + seed) % 256;
    }
  }
  return sharp(pixels, { raw: { width, height, channels } }).jpeg({ quality: 90 }).toBuffer();
}

async function makeLogo(): Promise<Buffer> {
  return sharp({
    create: { width: 64, height: 64, channels: 3, background: { r: 156, g: 30, b: 35 } },
  })
    .png()
    .toBuffer();
}

const BASE = {
  fullName: 'Adewale Johnson',
  role: 'enumerator',
  lga: 'Ibadan North',
  phone: '+2348012345678',
  staffId: '018e5f2a-1234-7890-abcd-1234567890ab',
  verificationUrl: 'https://oyoskills.com/verify-staff/018e5f2a-1234-7890-abcd-1234567890ab',
};

let photoA: Buffer;
let photoB: Buffer;
let logo: Buffer;

beforeAll(async () => {
  [photoA, photoB, logo] = await Promise.all([makePhoto(3), makePhoto(11), makeLogo()]);
});

describe('AC8.1 — the ID card PDF opens', () => {
  it('is a real, complete PDF', async () => {
    const pdf = await service.generateIDCard({ ...BASE, photoBuffer: photoA, logoBuffer: logo });

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.subarray(-8).toString()).toContain('%%EOF');
    // A card is two sides with a photo, a logo and a QR. A few hundred bytes
    // would mean an empty document that still technically "opens".
    expect(pdf.length).toBeGreaterThan(5000);
  });

  /**
   * ⚠️ THIS TEST PINS THE FORMAT, NOT THE CARD. Read the name literally.
   *
   * An earlier version of it was called "prints the staff ID in the format the
   * activation email quotes" and its comment claimed to *"pin that the card's
   * own derivation still agrees"*. It did no such thing: it generated a PDF,
   * threw it away, and asserted a pure function against a string literal. The
   * 2026-08-16 review RED-verified that by diverging the card to `OSLRS-` + 6
   * chars — this test stayed green, and so did its twin in
   * `staff-activation-complete-email.test.ts`.
   *
   * PDFKit writes text into compressed streams, so the rendered string is not
   * greppable here and this file — which deliberately mocks nothing — is the
   * wrong place to assert it. **The card-vs-email agreement is pinned in
   * `id-card.service.test.ts`**, which asserts `doc.text` was called with
   * `formatStaffId(...)` and goes red the moment the card derives its own.
   * What is left here is the one job this file can honestly do: pin the FORMAT
   * itself against a literal, so `formatStaffId` cannot quietly change shape.
   */
  it('formatStaffId renders the OSLSR-XXXXXXXX shape both surfaces quote', async () => {
    const { formatStaffId } = await import('@oslsr/types');
    expect(formatStaffId(BASE.staffId)).toBe('OSLSR-018E5F2A');
    expect(formatStaffId(BASE.staffId)).toMatch(/^OSLSR-[0-9A-F]{8}$/);
  });
});

describe('AC8.1 — the photo is present', () => {
  it('embeds image streams — the card is not a text-only shell', async () => {
    const pdf = await service.generateIDCard({ ...BASE, photoBuffer: photoA, logoBuffer: logo });
    const raw = pdf.toString('latin1');

    // photo + logo + QR. `/Subtype /Image` is how PDF declares an image XObject;
    // a card with an empty photo box has fewer.
    const imageCount = (raw.match(/\/Subtype\s*\/Image/g) ?? []).length;
    expect(imageCount).toBeGreaterThanOrEqual(3);

    // The photo is a JPEG, which PDFKit embeds with the DCT filter. Its absence
    // would mean the photograph specifically did not make it in.
    expect(raw).toContain('/DCTDecode');
  });

  /**
   * ⭐ The assertion that a fixed-output renderer could not fake. If the photo
   * were dropped — or drawn as an empty box — two different people's cards would
   * be byte-identical apart from their text.
   */
  it('a different photo produces a different card', async () => {
    const [a, b] = await Promise.all([
      service.generateIDCard({ ...BASE, photoBuffer: photoA, logoBuffer: logo }),
      service.generateIDCard({ ...BASE, photoBuffer: photoB, logoBuffer: logo }),
    ]);

    expect(a.equals(b)).toBe(false);
  });
});

describe('AC8.1 — the QR resolves', () => {
  /**
   * ⚠️ WHAT THIS PROVES, PRECISELY.
   *
   * `verificationUrl` is used in exactly ONE place in `id-card.service.ts`
   * (line 35, `QRCode.toBuffer`) — it is never printed as text. So if two cards
   * that differ ONLY in `verificationUrl` produce different bytes, the URL
   * demonstrably reached the QR encoder and is encoded in the image.
   *
   * ⚠️ WHAT IT DOES NOT PROVE: that a phone camera decodes it back to that URL.
   * That needs an optical decoder, which would mean a new runtime dependency —
   * out of scope for this story and, on a shared OSV-gated dependency tree, not
   * a free addition. **The end-to-end scan is an operator UAT step**, recorded
   * as such in the story rather than claimed here. Saying "the QR resolves" on
   * the strength of the test below alone would be the same overstatement AC8.1
   * exists to prevent.
   */
  it('the verification URL reaches the QR encoder', async () => {
    const [a, b] = await Promise.all([
      service.generateIDCard({ ...BASE, photoBuffer: photoA, logoBuffer: logo }),
      service.generateIDCard({
        ...BASE,
        photoBuffer: photoA,
        logoBuffer: logo,
        verificationUrl: 'https://oyoskills.com/verify-staff/completely-different-id',
      }),
    ]);

    expect(a.equals(b)).toBe(false);
  });
});

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Request, Response, NextFunction } from 'express';
import { db } from '../db/index.js';
import { users } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { AppError } from '@oslsr/utils';
import { updateProfileSchema, PHOTO_SOURCE, PHOTO_STATUS, isPhotoSource, UserRole, type PhotoSource } from '@oslsr/types';
import { PhotoProcessingService } from '../services/photo-processing.service.js';
import { IDCardService } from '../services/id-card.service.js';
import { UserService } from '../services/user.service.js';
import { AuditService } from '../services/audit.service.js';
// Story 13-59 — artefact delivery: the briefing PDF and the download record.
import { renderBriefingPdf } from '../services/field-briefing.service.js';
import { recordArtefactDownload, getStaffArtefactState } from '../services/staff-artefacts.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const logoBuffer = readFileSync(join(__dirname, '../../assets/oyo-coat-of-arms.png'));

const photoService = new PhotoProcessingService();
const idCardService = new IDCardService();

export class UserController {
  static async uploadSelfie(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        throw new AppError('VALIDATION_ERROR', 'No image file provided', 400);
      }

      // Check if user is authenticated (middleware should have set req.user)
      // F-023 (Story 9-42): the JWT payload keys the principal under `.sub`
      // (see TokenService.generateAccessToken). Reading `.userId` always
      // yielded undefined → a live 401 on every real upload. Use `.sub`.
      // Story 13-59 (review L2) — cast removed here too: F-023's sibling
      // survived in `downloadIDCard` for months precisely because `as any`
      // made both spellings compile. The typed read is the guard.
      const userId = req.user?.sub;
      if (!userId) {
        throw new AppError('AUTH_REQUIRED', 'User not authenticated', 401);
      }

      /*
       * Story 13-60 AC2 + AC6.2 — this endpoint is BOTH the "way back without
       * an admin" (a staff member whose photo failed at activation logs in and
       * adds one) and the upload fallback's landing point. So it must record
       * WHICH path produced the image, exactly like the activation path does.
       *
       * `source` arrives as a multipart text field beside the file. Anything
       * unrecognised — including absent, which is every pre-13-60 client —
       * reads as `live_capture`, which is what those clients were in fact doing.
       */
      const source: PhotoSource = isPhotoSource(req.body?.source)
        ? req.body.source
        : PHOTO_SOURCE.LIVE_CAPTURE;

      const { originalUrl, idCardUrl, sharpnessScore } = await photoService.processLiveSelfie(
        req.file.buffer,
        { source },
      );

      // Update user record
      const [updatedUser] = await db.update(users)
        .set({
          liveSelfieOriginalUrl: originalUrl,
          liveSelfieIdCardUrl: idCardUrl,
          photoSharpnessScore: sharpnessScore?.toString(), // Store as text
          liveSelfieVerifiedAt: new Date(), // Auto-verify for now, or null if manual review needed
          // The retry succeeded — clear the failure that sent them here, or the
          // operator screen would keep reporting a person who has since fixed it.
          photoStatus: PHOTO_STATUS.SAVED,
          photoSource: source,
          photoFailureReason: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning();

      if (!updatedUser) {
        throw new AppError('USER_NOT_FOUND', 'User not found', 404);
      }

      res.status(200).json({
        data: {
          liveSelfieOriginalUrl: updatedUser.liveSelfieOriginalUrl,
          liveSelfieIdCardUrl: updatedUser.liveSelfieIdCardUrl,
          // Renamed from `livenessScore` (AC6.4) — it is a sharpness ratio.
          photoSharpnessScore: parseFloat(updatedUser.photoSharpnessScore || '0'),
          photoSource: updatedUser.photoSource,
        }
      });
    } catch (error) {
      next(error);
    }
  }

  static async downloadIDCard(req: Request, res: Response, next: NextFunction) {
    try {
        /*
         * ⛔ Story 13-59 — THIS ENDPOINT WAS DEAD. It read `.userId`, but the
         * JWT payload keys the principal under `.sub`
         * (`packages/types/src/auth.ts`), so `userId` was ALWAYS undefined and
         * every authenticated caller got a 401 "User not authenticated" — the
         * one error message guaranteed to make a field officer think they were
         * logged out, on the one screen where they are provably not.
         *
         * This is the SAME defect F-023 (Story 9-42) fixed in `uploadSelfie`
         * eight lines above, with a comment explaining it. The sibling was left
         * behind: a fix applied to the cohort in front of it rather than to the
         * class (§2o). 13-59 builds the first-login modal on this exact
         * endpoint (AC5.4, "no new download path"), so the modal would have
         * offered a download that could not work — which is why AC8.1 insists
         * the assertion is that the PDF OPENS, not that the button exists.
         */
        /*
         * ⚠️ Story 13-59 (review L2) — the CAST is gone, not just the wrong key.
         *
         * The fix above changed `.userId` to `.sub`. That repaired the
         * instance and left the enabling condition in place: `(req as any)`
         * switches off the one mechanism that could have caught the defect at
         * compile time, on the exact line that had it. `req.user` is typed
         * (the two handlers below use it), so reading it directly means a
         * future `.userId` — or any other invented key — is a build error
         * rather than a 401 that reaches a field officer.
         *
         * §2o: fix the class, not the cohort in front of you. That note was
         * written INTO this file about `uploadSelfie`, and then this file
         * repeated the omission one layer down.
         */
        const userId = req.user?.sub;
        if (!userId) {
            throw new AppError('AUTH_REQUIRED', 'User not authenticated', 401);
        }

        const user = await db.query.users.findFirst({
            where: eq(users.id, userId),
            with: {
                role: true,
                lga: true
            }
        });

        if (!user) {
            throw new AppError('USER_NOT_FOUND', 'User not found', 404);
        }

        /*
         * Story 13-59 AC5.3 — ⛔ DO NOT SERVE A BROKEN CARD. 13-60's swallow
         * means `liveSelfieIdCardUrl` can legitimately be NULL, and a card with
         * an empty photo box downloads perfectly well — which is precisely the
         * "test that passes over a hole" AC8.1 warns about. The refusal is
         * kept, and the modal reads `unavailableReason: 'photo_missing'` off
         * the artefact endpoint so it can offer 13-60's retry instead of a
         * download button that 400s.
         *
         * Error code raised from VALIDATION_ERROR to a specific one so the
         * client can distinguish "you have no photo yet" from "your request was
         * malformed" without string-matching a message.
         */
        if (!user.liveSelfieIdCardUrl) {
            throw new AppError(
                'ID_CARD_PHOTO_MISSING',
                'No ID card can be produced yet because this account has no photo. Add a photo from your profile, then try again.',
                400,
            );
        }

        // Fetch photo buffer
        const photoBuffer = await photoService.getPhotoBuffer(user.liveSelfieIdCardUrl);

        // Generate PDF
        const pdfBuffer = await idCardService.generateIDCard({
            fullName: user.fullName,
            role: user.role.name,
            lga: user.lga?.name || 'Oyo State',
            phone: user.phone || '',
            staffId: user.id,
            photoBuffer,
            logoBuffer,
            verificationUrl: `${process.env.PUBLIC_APP_URL || 'https://oyoskills.com'}/verify-staff/${user.id}`
        });

        /*
         * Story 13-59 AC7.2 — record the download BEFORE sending, and AWAIT it.
         *
         * Before, not after, because once `res.send` runs the handler is racing
         * the response and a rejected promise has nowhere to go. Awaited
         * because AC8.2 asserts on these rows and a floating write is a race in
         * the test and a lost row under load. `recordArtefactDownload` never
         * throws, so this cannot cost anyone their card.
         */
        await recordArtefactDownload({
            userId,
            kind: 'id_card',
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
        });

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="oslrs-id-${user.id}.pdf"`,
            'Content-Length': pdfBuffer.length.toString()
        });

        res.send(pdfBuffer);

    } catch (error) {
        next(error);
    }
  }

  /**
   * GET /api/v1/users/field-briefing
   *
   * Story 13-59 (AC5.1, AC5.5, Task 5) — the field briefing as a PDF the
   * officer can keep on the phone they will carry.
   *
   * ⚠️ Rendered from `docs/runbooks/enumerator-field-briefing.md` on every
   * request. There is no checked-in PDF to go stale, because *a stale briefing
   * in the field is worse than no briefing — it will be believed.*
   *
   * ⚠️ NOT gated to ENUMERATORS — deliberately. The briefing is safe, non-PII
   * operational guidance, and a supervisor or clerk who opens the link should
   * get the document rather than a 403 they will read as a bug. Which roles are
   * PROMPTED for it is a separate question, answered by `BRIEFING_ROLES` on the
   * artefact endpoint.
   *
   * ⚠️ It IS gated to STAFF (review L1). The first cut gated on authentication
   * alone, which on this platform includes every registered citizen — the
   * registry is the larger population by three orders of magnitude and about to
   * be blasted. Two consequences, one of them quiet: an internal runbook served
   * to the public, and a `staff.briefing_downloaded` audit row written against
   * an actor who is not staff, which is the audit vocabulary telling a small lie
   * about who did what. "Any authenticated user" is not a synonym for "staff"
   * here and has not been since the citizen dashboard shipped.
   */
  static async downloadFieldBriefing(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        throw new AppError('AUTH_REQUIRED', 'User not authenticated', 401);
      }

      const caller = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { id: true },
        with: { role: true },
      });

      if (!caller || caller.role?.name === UserRole.PUBLIC_USER) {
        throw new AppError(
          'FORBIDDEN',
          'The field briefing is issued to registry staff.',
          403,
        );
      }

      const pdfBuffer = await renderBriefingPdf();

      // Recorded before the send, and awaited — see the note on the ID card.
      await recordArtefactDownload({
        userId,
        kind: 'briefing',
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="oslrs-enumerator-field-briefing.pdf"',
        'Content-Length': pdfBuffer.length.toString(),
      });
      res.send(pdfBuffer);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/users/artefacts
   *
   * Story 13-59 (AC5, AC6, AC7) — "what do I still owe myself?", answered on
   * the server so the modal, the profile section and the operator's staff list
   * cannot drift apart on the answer.
   */
  static async getArtefacts(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        throw new AppError('AUTH_REQUIRED', 'User not authenticated', 401);
      }

      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { id: true, liveSelfieIdCardUrl: true },
        with: { role: true },
      });

      if (!user) {
        throw new AppError('USER_NOT_FOUND', 'User not found', 404);
      }

      const state = await getStaffArtefactState({
        id: user.id,
        roleName: user.role?.name ?? '',
        hasIdCardPhoto: user.liveSelfieIdCardUrl !== null,
      });

      res.status(200).json({ data: state });
    } catch (error) {
      next(error);
    }
  }

  static async verifyStaff(req: Request, res: Response, next: NextFunction) {
      try {
          const { id } = req.params;
          
          const user = await db.query.users.findFirst({
              where: eq(users.id, id),
              with: {
                  role: true,
                  lga: true
              }
          });

          if (!user) {
              throw new AppError('USER_NOT_FOUND', 'Staff member not found', 404);
          }

          // Story 9-43 AC#4 (F-020) — minimize the public verify payload.
          // Dropped the internal `id` (already in the request URL) and, crucially,
          // NO LONGER returns a raw signed Spaces URL (which would grant durable,
          // unauthenticated, rate-limit-bypassing direct object access and leak
          // bucket structure). The photo is proxied through the API instead.
          res.status(200).json({
              data: {
                  fullName: user.fullName,
                  status: user.status,
                  role: user.role.name,
                  lga: user.lga?.name ?? null,
                  verifiedAt: user.liveSelfieVerifiedAt,
                  photoUrl: user.liveSelfieIdCardUrl ? `/api/v1/users/verify/${user.id}/photo` : null,
              }
          });
      } catch (error) {
          next(error);
      }
  }

  /**
   * GET /api/v1/users/verify/:id/photo
   * Story 9-43 AC#4 (F-020) — proxy the staff verification photo through the API
   * so the public response never exposes a raw signed Spaces URL. Streams the
   * stored JPEG; no PII beyond the photo itself.
   */
  static async verifyStaffPhoto(req: Request, res: Response, next: NextFunction) {
      try {
          const { id } = req.params;

          const user = await db.query.users.findFirst({
              where: eq(users.id, id),
              columns: { liveSelfieIdCardUrl: true },
          });

          if (!user || !user.liveSelfieIdCardUrl) {
              throw new AppError('PHOTO_NOT_FOUND', 'Verification photo not found', 404);
          }

          const photoBuffer = await photoService.getPhotoBuffer(user.liveSelfieIdCardUrl);

          res.set({
              'Content-Type': 'image/jpeg',
              'Content-Length': photoBuffer.length.toString(),
              // Review L1 — a verification selfie is PII; keep it out of shared
              // (CDN/proxy) caches even on this public surface. `private` allows
              // only the end-user's browser to cache it briefly.
              'Cache-Control': 'private, max-age=300',
          });
          res.send(photoBuffer);
      } catch (error) {
          next(error);
      }
  }

  /**
   * GET /api/v1/users/profile
   * Get current user's full profile data with resolved LGA name (Story 9.1, AC#2)
   */
  static async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
      }

      const profile = await UserService.getProfile(req.user.sub);

      // Resolve S3 key to signed URL for selfie display (DB stores keys, not URLs)
      const profileData = profile.liveSelfieOriginalUrl
        ? { ...profile, liveSelfieOriginalUrl: await photoService.getSignedUrl(profile.liveSelfieOriginalUrl) }
        : profile;

      res.status(200).json({ data: profileData });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/users/profile
   * Update current user's editable profile fields (Story 9.1, AC#4)
   */
  static async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
      }

      const validation = updateProfileSchema.safeParse(req.body);
      if (!validation.success) {
        throw new AppError('VALIDATION_ERROR', 'Invalid profile data', 400, {
          errors: validation.error.errors,
        });
      }

      const userId = req.user.sub;
      const data = validation.data;

      const updated = await UserService.updateProfile(userId, data);

      // Fire-and-forget audit log (AC#7)
      AuditService.logAction({
        actorId: userId,
        action: 'user.profile_updated',
        targetResource: 'user',
        targetId: userId,
        details: { changedFields: Object.keys(data) },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.status(200).json({ data: updated });
    } catch (error) {
      next(error);
    }
  }
}

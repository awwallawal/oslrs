import type { Request, Response, NextFunction } from 'express';
import proxyaddr from 'proxy-addr';
import { CLOUDFLARE_IPS } from '../constants/cloudflare-ips.js';

const isCloudflareEdge = proxyaddr.compile(CLOUDFLARE_IPS);

/**
 * Real-client-IP resolver for Cloudflare-proxied traffic (Phase 3, 2026-04-26).
 *
 * Cloudflare sets `CF-Connecting-IP` to the real client IP on every proxied
 * request. This is more reliable than X-Forwarded-For walking — Cloudflare's
 * X-F-F population behavior varies (sometimes the real client appears, sometimes
 * only the CF edge IP), which made `app.set('trust proxy', [..CLOUDFLARE_IPS])`
 * resolve `req.ip` to a CF edge IP rather than the real client.
 *
 * Security guard: only honor `CF-Connecting-IP` when the request actually came
 * through a Cloudflare edge (verified by `X-Real-IP` set by nginx being in the
 * published Cloudflare IP list). If a request bypassed Cloudflare and hit the
 * VPS directly with `Host: oyoskills.com` and a spoofed `CF-Connecting-IP`, the
 * `X-Real-IP` would be the attacker's IP (not a CF edge) and we ignore the
 * header.
 *
 * For traffic that doesn't route through Cloudflare (oyotradeministry.com.ng
 * goes direct-to-VPS), the header isn't present and `req.ip` falls through to
 * Express's default behavior (trust proxy + X-F-F walking, configured in
 * app.ts to whitelist nginx loopback + CLOUDFLARE_IPS).
 */
export function realIpMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const cfIp = req.headers['cf-connecting-ip'];
  const xRealIp = req.headers['x-real-ip'];

  if (
    typeof cfIp === 'string' &&
    cfIp.length > 0 &&
    typeof xRealIp === 'string' &&
    isCloudflareEdge(xRealIp, 0)
  ) {
    Object.defineProperty(req, 'ip', {
      get: () => cfIp,
      configurable: true,
    });
  }
  next();
}

/**
 * Cloudflare's published edge IP ranges.
 *
 * Used by Express's `app.set('trust proxy', ...)` so `req.ip` resolves to the
 * real client IP (not a Cloudflare edge IP) when traffic flows through the
 * Cloudflare proxy (oyoskills.com after Phase 3, 2026-04-26).
 *
 * Source: https://www.cloudflare.com/ips/
 * Verify annually — Cloudflare updates this list rarely (~once a year).
 *
 * Last verified: 2026-04-26
 */

export const CLOUDFLARE_IP_V4 = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
];

export const CLOUDFLARE_IP_V6 = [
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
];

export const CLOUDFLARE_IPS = [...CLOUDFLARE_IP_V4, ...CLOUDFLARE_IP_V6];

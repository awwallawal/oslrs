// Story 9-9 AC#3 F2 (defence-in-depth): bind the API to 127.0.0.1 by default
// so only nginx (on the same host) and PM2 health probes can reach it directly.
// Override with HOST=0.0.0.0 only if cross-container reachability is required.
// Full rationale lives in .env.example HOST entry; this helper exists so the
// resolution can be unit-tested independently of the listen call in index.ts.
export function resolveListenAddress(env: NodeJS.ProcessEnv = process.env): {
  host: string;
  port: number;
} {
  return {
    host: env.HOST || '127.0.0.1',
    port: Number(env.PORT) || 3000,
  };
}

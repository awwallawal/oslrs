/**
 * RegistryTestPage — Minimal test page to verify respondents API works.
 * Remove this file after debugging.
 */
import { useState, useEffect } from 'react';
import { apiClient } from '../../../lib/api-client';

interface RespondentRow {
  id: string;
  firstName: string;
  lastName: string;
  nin: string | null;
  source: string;
  lgaName: string | null;
  verificationStatus: string;
}

interface RegistryResponse {
  data: RespondentRow[];
  meta: { pagination: { totalItems: number } };
}

export default function RegistryTestPage() {
  const [data, setData] = useState<RegistryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const result = await apiClient('/respondents?pageSize=5&sortBy=registeredAt&sortOrder=desc');
        setData(result);
        setError(null);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
        setData(null);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: 'monospace' }}>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Registry API Test</h1>

      {loading && <p>Loading...</p>}

      {error && (
        <div style={{ background: '#fee', padding: 12, borderRadius: 8, marginBottom: 16 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {data && (
        <>
          <div style={{ background: '#efe', padding: 12, borderRadius: 8, marginBottom: 16 }}>
            <strong>Success!</strong> Got {data.data?.length ?? 0} respondents
            (total: {data.meta?.pagination?.totalItems ?? '?'})
          </div>

          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr style={{ background: '#f0f0f0' }}>
                <th style={{ border: '1px solid #ccc', padding: 8, textAlign: 'left' }}>ID</th>
                <th style={{ border: '1px solid #ccc', padding: 8, textAlign: 'left' }}>Name</th>
                <th style={{ border: '1px solid #ccc', padding: 8, textAlign: 'left' }}>NIN</th>
                <th style={{ border: '1px solid #ccc', padding: 8, textAlign: 'left' }}>Source</th>
                <th style={{ border: '1px solid #ccc', padding: 8, textAlign: 'left' }}>LGA</th>
                <th style={{ border: '1px solid #ccc', padding: 8, textAlign: 'left' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.data?.map((r) => (
                <tr key={r.id}>
                  <td style={{ border: '1px solid #ccc', padding: 8, fontSize: 11 }}>{r.id?.slice(0, 12)}...</td>
                  <td style={{ border: '1px solid #ccc', padding: 8 }}>{r.firstName} {r.lastName}</td>
                  <td style={{ border: '1px solid #ccc', padding: 8 }}>{r.nin || '—'}</td>
                  <td style={{ border: '1px solid #ccc', padding: 8 }}>{r.source}</td>
                  <td style={{ border: '1px solid #ccc', padding: 8 }}>{r.lgaName || '—'}</td>
                  <td style={{ border: '1px solid #ccc', padding: 8 }}>{r.verificationStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <details style={{ marginTop: 16 }}>
            <summary>Raw JSON response</summary>
            <pre style={{ fontSize: 11, background: '#f8f8f8', padding: 12, overflow: 'auto', maxHeight: 400 }}>
              {JSON.stringify(data, null, 2)}
            </pre>
          </details>
        </>
      )}
    </div>
  );
}

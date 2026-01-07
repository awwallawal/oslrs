const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

export async function apiClient(endpoint: string, options: RequestInit = {}) {
  const { headers, ...rest } = options;
  
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    ...rest,
  });

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.message || 'Something went wrong');
    (error as any).code = data.code;
    (error as any).status = response.status;
    (error as any).details = data.details;
    throw error;
  }

  return data;
}

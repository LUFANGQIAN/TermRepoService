export interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

export function ok<T>(data: T, message = 'ok'): ApiEnvelope<T> {
  return { code: 0, message, data };
}


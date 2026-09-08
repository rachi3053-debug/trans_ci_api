export type MessageType = 'success' | 'error' | 'warning' | 'info';

export interface ApiResponse<T> {
  success: boolean;
  code: string;
  message: string;
  data: T | null;
}

export interface ApiErrorResponse {
  success: false;
  code: string;
  message: string;
  data: null;
  errors?: Record<string, string[]>;
  timestamp: string;
  path: string;
}

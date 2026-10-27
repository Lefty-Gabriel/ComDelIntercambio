// Traction LMS API Client

const API_BASE_URL = (import.meta.env.VITE_API_URL?.trim() || 'http://localhost:3000').replace(/\/+$/, '');

const TOKEN_KEY = 'traction_access_token';
const USER_KEY = 'traction_user';

export type UserRole = 'admin' | 'mentor' | 'estudiante' | 'soporte';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: User;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  createdBy: string | null;
  docenteId: string | null;
  createdAt: string;
}

export type VideoStatus = 'pending' | 'ready' | 'error';

export interface Video {
  id: string;
  courseId: string;
  title: string;
  description: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number | null;
  status: VideoStatus;
  createdBy: string | null;
  createdAt: string;
  expiresAt: string | null;
}

export interface CreateVideoResponse {
  video: Video;
  upload: {
    path: string;
    token: string;
    signedUrl: string;
  };
}

export interface PlaybackResponse {
  url: string;
  expiresIn: number;
}

export type LiveSessionStatus = 'scheduled' | 'live' | 'ended';

export interface LiveSession {
  id: string;
  courseId: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  status: LiveSessionStatus;
  startedBy: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
}


export class ApiError extends Error {
  statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

let authRevision = 0;
const invalidationListeners = new Set<() => void>();
function assertCurrentSession(revision: number) {
  if (revision !== authRevision) throw new DOMException('Session changed', 'AbortError');
}
// Token and Session Storage
export const authStorage = {
  getRevision: () => authRevision,
  subscribeInvalidation(listener: () => void): () => void {
    invalidationListeners.add(listener);
    return () => { invalidationListeners.delete(listener); };
  },
  getToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  setToken(token: string): void {
    authRevision++;
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // storage unavailable
    }
  },
  getUser(): User | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  },
  setUser(user: User): void {
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {
      // storage unavailable
    }
  },
  clear(): void {
    authRevision++;
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      // storage unavailable
    }
    for (const listener of invalidationListeners) listener();
  },
};

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const revision = authRevision;
  const token = authStorage.getToken();
  const headers = new Headers(options.headers || {});

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  assertCurrentSession(revision);
  if (!response.ok) {
    let errorMessage = `Request failed (${response.status} ${response.statusText})`;
    try {
      const errBody = await response.json();
      if (errBody) {
        if (Array.isArray(errBody.message)) {
          errorMessage = errBody.message.join(', ');
        } else if (errBody.message) {
          errorMessage = String(errBody.message);
        } else if (errBody.error) {
          errorMessage = String(errBody.error);
        }
      }
    } catch {
      // Non-JSON response
    }

    assertCurrentSession(revision);
    if (response.status === 401 && token) {
      // Clear session if unauthorized
      authStorage.clear();
    }

    throw new ApiError(errorMessage, response.status);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  const result = await response.json() as T;
  assertCurrentSession(revision);
  return result;
}

export const api = {
  // Auth
  async login(email: string, password: string): Promise<AuthResponse> {
    const revision = authRevision;
    const data = await request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    assertCurrentSession(revision);
    authStorage.setToken(data.accessToken);
    authStorage.setUser(data.user);
    return data;
  },

  async getMe(): Promise<User> {
    const revision = authRevision;
    const user = await request<User>('/auth/me');
    assertCurrentSession(revision);
    authStorage.setUser(user);
    return user;
  },

  logout(): void {
    authStorage.clear();
  },

  // Courses
  async getCourses(): Promise<Course[]> {
    return request<Course[]>('/courses');
  },

  async createCourse(data: { title: string; description?: string }): Promise<Course> {
    return request<Course>('/courses', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Videos
  async getVideos(): Promise<Video[]> {
    return request<Video[]>('/videos');
  },

  async getVideo(id: string): Promise<Video> {
    return request<Video>(`/videos/${id}`);
  },

  async createVideo(data: {
    courseId: string;
    title: string;
    description?: string;
    mimeType?: string;
    sizeBytes?: number;
    durationSeconds?: number;
  }): Promise<CreateVideoResponse> {
    return request<CreateVideoResponse>('/videos', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async completeVideo(
    id: string,
    data?: { sizeBytes?: number; durationSeconds?: number; mimeType?: string },
  ): Promise<Video> {
    return request<Video>(`/videos/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify(data ?? {}),
    });
  },

  async getVideoPlayback(id: string): Promise<PlaybackResponse> {
    return request<PlaybackResponse>(`/videos/${id}/playback`);
  },

  async deleteVideo(id: string): Promise<{ deleted: boolean }> {
    return request<{ deleted: boolean }>(`/videos/${id}`, {
      method: 'DELETE',
    });
  },

  getTickets: (signal?: AbortSignal) => request<Ticket[]>('/tickets', {signal}),
  getMessages: (id: string, signal?: AbortSignal) => request<TicketMessage[]>(`/tickets/${id}/messages`, {signal}),
  createTicket: (subject: string, message: string) => request<Ticket>('/tickets', {method:'POST',body:JSON.stringify({subject,message})}),
  sendMessage: (id: string, body: string) => request<TicketMessage>(`/tickets/${id}/messages`, {method:'POST',body:JSON.stringify({body})}),
  claimTicket: (id: string) => request<Ticket>(`/tickets/${id}/claim`, {method:'POST'}),
  closeTicket: (id: string) => request<Ticket>(`/tickets/${id}/close`, {method:'POST'}),
  // Live Sessions
  async getLiveSessions(): Promise<LiveSession[]> {
    return request<LiveSession[]>('/live-sessions');
  },

  async getLiveSession(id: string): Promise<LiveSession> {
    return request<LiveSession>(`/live-sessions/${id}`);
  },

  async createLiveSession(data: { courseId: string; title: string; scheduledAt: string; durationMinutes: number }): Promise<LiveSession> {
    return request<LiveSession>('/live-sessions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async endLiveSession(id: string): Promise<LiveSession> {
    return request<LiveSession>(`/live-sessions/${id}/end`, {
      method: 'POST',
    });
  },
};

/**
 * Uploads file binary directly to the signed upload URL with real-time percentage tracking.
 */
export function uploadFileToSignedUrl(
  signedUrl: string,
  file: File,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Upload aborted','AbortError')); return; }
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const cleanup = () => signal?.removeEventListener('abort',abort);
    xhr.open('PUT', signedUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(
          new ApiError(
            `Upload to storage failed (${xhr.status}: ${xhr.statusText || 'Error'})`,
            xhr.status,
          ),
        );
      }
    };

    xhr.onerror = () => {
      cleanup();
      reject(new ApiError('Network error while uploading video to storage'));
    };

    xhr.onabort = () => {
      cleanup();
      reject(new ApiError('Upload was aborted'));
    };

    signal?.addEventListener('abort',abort,{once:true});
    xhr.send(file);
  });
}

export interface Ticket { id: string; subject: string; student_id: string; assigned_to: string | null; status: 'open' | 'in_progress' | 'closed'; created_at: string; updated_at: string; closed_at: string | null; }
export interface TicketMessage { id: string; ticket_id: string; sender_id: string; body: string; created_at: string; }

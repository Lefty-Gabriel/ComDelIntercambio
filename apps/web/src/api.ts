// Traction LMS API Client

const API_BASE_URL = 'http://localhost:3000';

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
  roomName: string;
  status: LiveSessionStatus;
  startedBy: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
}

export interface JoinLiveSessionResponse {
  url: string;
  room: string;
  token: string;
  canPublish: boolean;
}

export class ApiError extends Error {
  statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

// Token and Session Storage
export const authStorage = {
  getToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  setToken(token: string): void {
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
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      // storage unavailable
    }
  },
};

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
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

    if (response.status === 401) {
      // Clear session if unauthorized
      authStorage.clear();
    }

    throw new ApiError(errorMessage, response.status);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  // Auth
  async login(email: string, password: string): Promise<AuthResponse> {
    const data = await request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    authStorage.setToken(data.accessToken);
    authStorage.setUser(data.user);
    return data;
  },

  async getMe(): Promise<User> {
    const user = await request<User>('/auth/me');
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

  // Live Sessions
  async getLiveSessions(): Promise<LiveSession[]> {
    return request<LiveSession[]>('/live-sessions');
  },

  async getLiveSession(id: string): Promise<LiveSession> {
    return request<LiveSession>(`/live-sessions/${id}`);
  },

  async createLiveSession(data: { courseId: string; title: string }): Promise<LiveSession> {
    return request<LiveSession>('/live-sessions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async joinLiveSession(id: string): Promise<JoinLiveSessionResponse> {
    return request<JoinLiveSessionResponse>(`/live-sessions/${id}/join`, {
      method: 'POST',
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
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
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
      reject(new ApiError('Network error while uploading video to storage'));
    };

    xhr.onabort = () => {
      reject(new ApiError('Upload was aborted'));
    };

    xhr.send(file);
  });
}

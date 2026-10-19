import { useEffect, useState, useTransition } from 'react';
import type { ChangeEvent, DragEvent, FormEvent } from 'react';
import './App.css';
import {
  api,
  authStorage,
  uploadFileToSignedUrl,
} from './api.ts';
import type {
  Course,
  JoinLiveSessionResponse,
  LiveSession,
  PlaybackResponse,
  User,
  Video,
} from './api.ts';

type Page = 'dashboard' | 'videos' | 'live-sessions';

// Helper formatters
function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatDuration(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return '0s';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs.toString().padStart(2, '0')}s`;
}

function formatDate(isoString?: string | null): string {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

export default function App() {
  // Auth state
  const [token, setToken] = useState<string | null>(() => authStorage.getToken());
  const [user, setUser] = useState<User | null>(() => authStorage.getUser());
  const [page, setPage] = useState<Page>('dashboard');

  // Login form state
  const [loginEmail, setLoginEmail] = useState('admin@traction.test');
  const [loginPassword, setLoginPassword] = useState('Admin1234!');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // App data state
  const [courses, setCourses] = useState<Course[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  // Inline feedback messages
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Course creation state
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [newCourseTitle, setNewCourseTitle] = useState('');
  const [newCourseDesc, setNewCourseDesc] = useState('');
  const [creatingCourse, setCreatingCourse] = useState(false);

  // Video upload state
  const [uploadCourseId, setUploadCourseId] = useState('');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDesc, setUploadDesc] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileDuration, setFileDuration] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadStep, setUploadStep] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Active playback state
  const [activePlayback, setActivePlayback] = useState<{
    video: Video;
    playback: PlaybackResponse;
  } | null>(null);
  const [loadingPlaybackId, setLoadingPlaybackId] = useState<string | null>(null);

  // Live session state
  const [sessionCourseId, setSessionCourseId] = useState('');
  const [sessionTitle, setSessionTitle] = useState('');
  const [creatingSession, setCreatingSession] = useState(false);
  const [joinedSessionInfo, setJoinedSessionInfo] = useState<{
    session: LiveSession;
    details: JoinLiveSessionResponse;
  } | null>(null);
  const [joiningSessionId, setJoiningSessionId] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const [, startTransition] = useTransition();

  // Load initial data if token exists
  useEffect(() => {
    if (token) {
      loadAllData();
    }
  }, [token]);

  // Load user profile & core data
  async function loadAllData() {
    setLoadingData(true);
    setErrorMsg(null);
    try {
      // Refresh current user
      const currentUser = await api.getMe();
      setUser(currentUser);

      const [courseList, videoList, sessionList] = await Promise.all([
        api.getCourses(),
        api.getVideos(),
        api.getLiveSessions(),
      ]);

      setCourses(courseList);
      setVideos(videoList);
      setSessions(sessionList);

      // Pre-select first course for upload and sessions if not yet set
      if (courseList.length > 0) {
        setUploadCourseId((prev) => prev || courseList[0].id);
        setSessionCourseId((prev) => prev || courseList[0].id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch data';
      setErrorMsg(msg);
      if (msg.includes('401') || msg.includes('Unauthorized')) {
        handleLogout();
      }
    } finally {
      setLoadingData(false);
    }
  }

  // Handle Login
  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await api.login(loginEmail, loginPassword);
      setToken(res.accessToken);
      setUser(res.user);
      setPage('dashboard');
    } catch (err: unknown) {
      setLoginError(err instanceof Error ? err.message : 'Invalid credentials');
    } finally {
      setLoginLoading(false);
    }
  }

  // Handle Logout
  function handleLogout() {
    api.logout();
    setToken(null);
    setUser(null);
    setActivePlayback(null);
    setJoinedSessionInfo(null);
    setCourses([]);
    setVideos([]);
    setSessions([]);
    setPage('dashboard');
  }

  // Handle Course Creation
  async function handleCreateCourse(e: FormEvent) {
    e.preventDefault();
    if (!newCourseTitle.trim()) return;
    setCreatingCourse(true);
    setErrorMsg(null);
    try {
      const created = await api.createCourse({
        title: newCourseTitle.trim(),
        description: newCourseDesc.trim(),
      });
      setCourses((prev) => [created, ...prev]);
      setSuccessMsg(`Course "${created.title}" created successfully!`);
      setNewCourseTitle('');
      setNewCourseDesc('');
      setShowCourseForm(false);
      setUploadCourseId(created.id);
      setSessionCourseId(created.id);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not create course');
    } finally {
      setCreatingCourse(false);
    }
  }

  // Video file selection & duration extraction
  function handleFileSelected(file: File) {
    setSelectedFile(file);
    if (!uploadTitle.trim()) {
      // Auto-fill title from filename without extension
      const cleanName = file.name.replace(/\.[^/.]+$/, '');
      setUploadTitle(cleanName);
    }

    // Attempt to extract duration
    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';
    tempVideo.onloadedmetadata = () => {
      URL.revokeObjectURL(tempVideo.src);
      const secs = Math.round(tempVideo.duration);
      if (Number.isFinite(secs) && secs > 0) {
        setFileDuration(secs);
      }
    };
    tempVideo.onerror = () => {
      URL.revokeObjectURL(tempVideo.src);
      setFileDuration(null);
    };
    tempVideo.src = URL.createObjectURL(file);
  }

  function handleFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  }

  // Video Upload Flow
  async function handleUploadVideo(e: FormEvent) {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMsg('Please select a video file to upload.');
      return;
    }
    if (!uploadCourseId) {
      setErrorMsg('Please select a course for this video.');
      return;
    }
    if (uploadTitle.trim().length < 3) {
      setErrorMsg('Video title must be at least 3 characters long.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      // Step 1: Request signed upload URL from backend
      setUploadStep('Step 1/3: Registering video metadata...');
      const createRes = await api.createVideo({
        courseId: uploadCourseId,
        title: uploadTitle.trim(),
        description: uploadDesc.trim() || undefined,
        mimeType: selectedFile.type || 'video/mp4',
        sizeBytes: selectedFile.size,
        durationSeconds: fileDuration ?? undefined,
      });

      const videoId = createRes.video.id;
      const signedUrl = createRes.upload.signedUrl;

      // Step 2: Upload binary bytes to storage
      setUploadStep('Step 2/3: Uploading file bytes to storage...');
      await uploadFileToSignedUrl(signedUrl, selectedFile, (percent) => {
        setUploadProgress(percent);
      });

      // Step 3: Complete video registration
      setUploadStep('Step 3/3: Finalizing video record...');
      const completedVideo = await api.completeVideo(videoId, {
        sizeBytes: selectedFile.size,
        durationSeconds: fileDuration ?? undefined,
        mimeType: selectedFile.type || 'video/mp4',
      });

      // Update state
      setVideos((prev) => [completedVideo, ...prev.filter((v) => v.id !== videoId)]);
      setSuccessMsg(`Video "${completedVideo.title}" uploaded and processed successfully!`);

      // Reset form
      setSelectedFile(null);
      setFileDuration(null);
      setUploadTitle('');
      setUploadDesc('');
      setUploadProgress(null);
      setUploadStep(null);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Video upload failed');
    } finally {
      setIsUploading(false);
    }
  }

  // Playback Flow
  async function handlePlayVideo(video: Video) {
    setLoadingPlaybackId(video.id);
    setErrorMsg(null);
    try {
      const playback = await api.getVideoPlayback(video.id);
      setActivePlayback({ video, playback });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not fetch playback stream');
    } finally {
      setLoadingPlaybackId(null);
    }
  }

  // Delete Video Flow
  async function handleDeleteVideo(videoId: string) {
    if (!window.confirm('Are you sure you want to delete this video?')) return;
    setErrorMsg(null);
    try {
      await api.deleteVideo(videoId);
      setVideos((prev) => prev.filter((v) => v.id !== videoId));
      if (activePlayback?.video.id === videoId) {
        setActivePlayback(null);
      }
      setSuccessMsg('Video deleted successfully.');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete video');
    }
  }

  // Create Live Session Flow
  async function handleCreateSession(e: FormEvent) {
    e.preventDefault();
    if (!sessionTitle.trim()) return;
    if (!sessionCourseId) {
      setErrorMsg('Please select a course for this live session.');
      return;
    }
    setCreatingSession(true);
    setErrorMsg(null);
    try {
      const newSession = await api.createLiveSession({
        courseId: sessionCourseId,
        title: sessionTitle.trim(),
      });
      setSessions((prev) => [newSession, ...prev]);
      setSuccessMsg(`Live session "${newSession.title}" created successfully!`);
      setSessionTitle('');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not create live session');
    } finally {
      setCreatingSession(false);
    }
  }

  // Join Live Session Flow
  async function handleJoinSession(session: LiveSession) {
    setJoiningSessionId(session.id);
    setErrorMsg(null);
    setCopiedToken(false);
    setCopiedUrl(false);
    try {
      const details = await api.joinLiveSession(session.id);
      setJoinedSessionInfo({ session, details });
      // Update session status to live if it was scheduled
      setSessions((prev) =>
        prev.map((s) => (s.id === session.id ? { ...s, status: 'live' } : s)),
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not join session');
    } finally {
      setJoiningSessionId(null);
    }
  }

  // End Live Session Flow
  async function handleEndSession(sessionId: string) {
    if (!window.confirm('Are you sure you want to end this live session?')) return;
    setErrorMsg(null);
    try {
      const ended = await api.endLiveSession(sessionId);
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? ended : s)));
      if (joinedSessionInfo?.session.id === sessionId) {
        setJoinedSessionInfo(null);
      }
      setSuccessMsg(`Session "${ended.title}" has been ended.`);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to end session');
    }
  }

  // Copy to clipboard helper
  function copyToClipboard(text: string, type: 'token' | 'url') {
    navigator.clipboard.writeText(text);
    if (type === 'token') {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 3000);
    } else {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 3000);
    }
  }

  // Render Login View if not logged in
  if (!token) {
    return (
      <div className="login-wrapper">
        <div className="login-card">
          <div className="login-header">
            <div className="brand-icon">T</div>
            <h1>Traction LMS</h1>
            <p>Developer &amp; Testing Frontend Portal</p>
          </div>

          <div className="quick-creds-box">
            <div className="quick-creds-info">
              <strong>Admin Test Credentials</strong>
              <span>admin@traction.test / Admin1234!</span>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setLoginEmail('admin@traction.test');
                setLoginPassword('Admin1234!');
              }}
            >
              Fill
            </button>
          </div>

          {loginError && (
            <div className="alert alert-error" style={{ marginBottom: '1.25rem' }}>
              <span>{loginError}</span>
              <button
                type="button"
                className="alert-close"
                onClick={() => setLoginError(null)}
              >
                &times;
              </button>
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label htmlFor="login-email">Email Address</label>
              <input
                id="login-email"
                type="email"
                className="form-control"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="name@company.com"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                className="form-control"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '0.75rem' }}
              disabled={loginLoading}
            >
              {loginLoading ? (
                <>
                  <span className="loading-spinner"></span> Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const courseMap = new Map(courses.map((c) => [c.id, c.title]));

  // Authenticated Main View
  return (
    <>
      {/* Top Navbar */}
      <header className="navbar">
        <div className="nav-brand">
          <div className="brand-icon">T</div>
          <div>
            <span className="brand-title">Traction LMS</span>
          </div>
          <span className="brand-badge">Dev Test Portal</span>
        </div>

        <nav className="nav-links">
          <button
            type="button"
            className={`nav-btn ${page === 'dashboard' ? 'active' : ''}`}
            onClick={() => startTransition(() => setPage('dashboard'))}
          >
            📊 Dashboard
          </button>
          <button
            type="button"
            className={`nav-btn ${page === 'videos' ? 'active' : ''}`}
            onClick={() => startTransition(() => setPage('videos'))}
          >
            🎥 Videos ({videos.length})
          </button>
          <button
            type="button"
            className={`nav-btn ${page === 'live-sessions' ? 'active' : ''}`}
            onClick={() => startTransition(() => setPage('live-sessions'))}
          >
            🔴 Live Sessions ({sessions.length})
          </button>
        </nav>

        <div className="nav-user">
          <div className="user-badge">
            <span className="user-name">{user?.fullName || 'User'}</span>
            <span className={`user-role-tag role-${user?.role || 'student'}`}>
              {user?.role || 'Role'}
            </span>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleLogout}
            title="Sign out"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="page-container">
        {/* Global Feedback Banners */}
        {errorMsg && (
          <div className="alert alert-error">
            <span>⚠️ {errorMsg}</span>
            <button
              type="button"
              className="alert-close"
              onClick={() => setErrorMsg(null)}
            >
              &times;
            </button>
          </div>
        )}

        {successMsg && (
          <div className="alert alert-success">
            <span>✅ {successMsg}</span>
            <button
              type="button"
              className="alert-close"
              onClick={() => setSuccessMsg(null)}
            >
              &times;
            </button>
          </div>
        )}

        {/* ----------------- PAGE: DASHBOARD ----------------- */}
        {page === 'dashboard' && (
          <>
            <div className="space-between">
              <div>
                <h2>Welcome back, {user?.fullName || 'Admin'}</h2>
                <p>Backend API active on http://localhost:3000</p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={loadAllData}
                disabled={loadingData}
              >
                {loadingData ? (
                  <>
                    <span className="loading-spinner"></span> Refreshing...
                  </>
                ) : (
                  '🔄 Refresh All Data'
                )}
              </button>
            </div>

            {/* Quick Stats Grid */}
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon blue">📚</div>
                <div>
                  <div className="stat-value">{courses.length}</div>
                  <div className="stat-label">Total Courses</div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon purple">🎬</div>
                <div>
                  <div className="stat-value">
                    {videos.filter((v) => v.status === 'ready').length}
                  </div>
                  <div className="stat-label">Ready Videos ({videos.length} total)</div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon green">📡</div>
                <div>
                  <div className="stat-value">
                    {sessions.filter((s) => s.status !== 'ended').length}
                  </div>
                  <div className="stat-label">Active / Scheduled Sessions</div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon amber">⚡</div>
                <div>
                  <div className="stat-value">LiveKit</div>
                  <div className="stat-label">Cloud Connected</div>
                </div>
              </div>
            </div>

            {/* Courses Overview & Management */}
            <div className="card">
              <div className="card-header">
                <div>
                  <h3>Course Catalog</h3>
                  <p>Courses available for your role ({user?.role})</p>
                </div>
                {(user?.role === 'admin' || user?.role === 'mentor') && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setShowCourseForm(!showCourseForm)}
                  >
                    {showCourseForm ? 'Cancel' : '+ New Course'}
                  </button>
                )}
              </div>

              {/* Course Creation Form */}
              {showCourseForm && (
                <form
                  onSubmit={handleCreateCourse}
                  style={{
                    backgroundColor: 'var(--bg-surface-raised)',
                    padding: '1.25rem',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: '1.5rem',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <h4 style={{ marginBottom: '1rem', color: 'var(--text-main)' }}>
                    Create New Course
                  </h4>
                  <div className="form-group">
                    <label htmlFor="course-title">Course Title *</label>
                    <input
                      id="course-title"
                      type="text"
                      className="form-control"
                      value={newCourseTitle}
                      onChange={(e) => setNewCourseTitle(e.target.value)}
                      placeholder="e.g. Fullstack React & Node Architecture"
                      required
                      minLength={3}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="course-desc">Description (optional)</label>
                    <textarea
                      id="course-desc"
                      className="form-control"
                      rows={2}
                      value={newCourseDesc}
                      onChange={(e) => setNewCourseDesc(e.target.value)}
                      placeholder="Brief summary of the course topics..."
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setShowCourseForm(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary btn-sm"
                      disabled={creatingCourse || newCourseTitle.trim().length < 3}
                    >
                      {creatingCourse ? (
                        <>
                          <span className="loading-spinner"></span> Creating...
                        </>
                      ) : (
                        'Save Course'
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* Courses Grid */}
              {courses.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-state-icon">📂</span>
                  <p>No courses found. Create one above to get started!</p>
                </div>
              ) : (
                <div className="courses-grid">
                  {courses.map((c) => (
                    <div key={c.id} className="course-card">
                      <div>
                        <span className="course-id-chip" title={c.id}>
                          ID: {c.id}
                        </span>
                        <h4 style={{ fontSize: '1.05rem', marginBottom: '0.4rem' }}>
                          {c.title}
                        </h4>
                        <p style={{ fontSize: '0.875rem' }}>
                          {c.description || 'No description provided'}
                        </p>
                      </div>

                      <div className="course-actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            setUploadCourseId(c.id);
                            startTransition(() => setPage('videos'));
                          }}
                        >
                          🎥 Add Video
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            setSessionCourseId(c.id);
                            startTransition(() => setPage('live-sessions'));
                          }}
                        >
                          🔴 Live Session
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ----------------- PAGE: VIDEOS ----------------- */}
        {page === 'videos' && (
          <>
            <div className="space-between">
              <div>
                <h2>Video Management &amp; Streaming</h2>
                <p>Upload videos to Supabase Storage and stream directly using HTML5</p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={loadAllData}
                disabled={loadingData}
              >
                {loadingData ? (
                  <>
                    <span className="loading-spinner"></span> Loading...
                  </>
                ) : (
                  '🔄 Refresh'
                )}
              </button>
            </div>

            {/* Prominent Active Video Player */}
            {activePlayback && (
              <div className="player-card">
                <div className="player-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span className="badge badge-ready">▶ Now Playing</span>
                    <strong style={{ fontSize: '1.1rem' }}>
                      {activePlayback.video.title}
                    </strong>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                      ({courseMap.get(activePlayback.video.courseId) || activePlayback.video.courseId})
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setActivePlayback(null)}
                  >
                    ✕ Close Player
                  </button>
                </div>

                <div className="player-video-wrapper">
                  <video
                    className="player-video"
                    controls
                    autoPlay
                    playsInline
                    src={activePlayback.playback.url}
                  >
                    Your browser does not support the video tag.
                  </video>
                </div>

                <div className="player-footer">
                  <div className="player-meta-tags">
                    <span className="badge badge-ready">
                      Size: {formatBytes(activePlayback.video.sizeBytes)}
                    </span>
                    <span className="badge badge-scheduled">
                      Duration: {formatDuration(activePlayback.video.durationSeconds)}
                    </span>
                    <span className="badge badge-scheduled">
                      Format: {activePlayback.video.mimeType}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Signed URL expires in {activePlayback.playback.expiresIn}s
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <a
                      href={activePlayback.playback.url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-secondary btn-sm"
                    >
                      🔗 Open Direct Stream
                    </a>
                    {(user?.role === 'admin' || user?.role === 'mentor') && (
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDeleteVideo(activePlayback.video.id)}
                      >
                        🗑️ Delete Video
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Video Upload Section */}
            {(user?.role === 'admin' || user?.role === 'mentor') && (
              <div className="card">
                <div className="card-header">
                  <div>
                    <h3>Upload New Video</h3>
                    <p>Three-step upload pipeline: signed URL &rarr; direct upload &rarr; completion</p>
                  </div>
                </div>

                <form onSubmit={handleUploadVideo}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                      gap: '1rem',
                    }}
                  >
                    <div className="form-group">
                      <label htmlFor="upload-course">Select Course *</label>
                      <select
                        id="upload-course"
                        className="form-control"
                        value={uploadCourseId}
                        onChange={(e) => setUploadCourseId(e.target.value)}
                        required
                      >
                        {courses.length === 0 && (
                          <option value="">No courses found - create one first</option>
                        )}
                        {courses.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="upload-title">Video Title *</label>
                      <input
                        id="upload-title"
                        type="text"
                        className="form-control"
                        value={uploadTitle}
                        onChange={(e) => setUploadTitle(e.target.value)}
                        placeholder="e.g. Introduction & Setup"
                        required
                        minLength={3}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="upload-desc">Description (optional)</label>
                    <textarea
                      id="upload-desc"
                      className="form-control"
                      rows={2}
                      value={uploadDesc}
                      onChange={(e) => setUploadDesc(e.target.value)}
                      placeholder="Provide notes or chapter information..."
                    />
                  </div>

                  {/* Drag and Drop Zone */}
                  <div
                    className={`dropzone ${isDragging ? 'active' : ''}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => {
                      document.getElementById('video-file-picker')?.click();
                    }}
                  >
                    <input
                      id="video-file-picker"
                      type="file"
                      accept="video/*"
                      style={{ display: 'none' }}
                      onChange={handleFileInputChange}
                    />
                    <span className="dropzone-icon">📹</span>
                    <div className="dropzone-text">
                      {selectedFile ? 'Change selected video' : 'Drag & drop a video file here, or click to browse'}
                    </div>
                    <div className="dropzone-subtext">
                      Supports MP4, WebM, MOV, and common video formats
                    </div>
                  </div>

                  {/* Selected File Card */}
                  {selectedFile && (
                    <div className="file-preview">
                      <div className="file-info">
                        <span className="file-icon">🎞️</span>
                        <div>
                          <strong style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>
                            {selectedFile.name}
                          </strong>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {formatBytes(selectedFile.size)} • {selectedFile.type || 'video'}
                            {fileDuration ? ` • Duration: ~${formatDuration(fileDuration)}` : ''}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFile(null);
                          setFileDuration(null);
                        }}
                        disabled={isUploading}
                      >
                        Remove
                      </button>
                    </div>
                  )}

                  {/* Upload Progress Bar */}
                  {isUploading && (
                    <div className="progress-container">
                      <div className="progress-bar-bg">
                        <div
                          className="progress-bar-fill"
                          style={{ width: `${uploadProgress ?? 10}%` }}
                        ></div>
                      </div>
                      <div className="progress-meta">
                        <span>{uploadStep || 'Uploading...'}</span>
                        <span>{uploadProgress !== null ? `${uploadProgress}%` : 'Working...'}</span>
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={isUploading || !selectedFile || uploadTitle.trim().length < 3}
                    >
                      {isUploading ? (
                        <>
                          <span className="loading-spinner"></span> Uploading...
                        </>
                      ) : (
                        '🚀 Start Video Upload'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Video List Table */}
            <div className="card">
              <div className="card-header">
                <div>
                  <h3>Videos Repository ({videos.length})</h3>
                  <p>All videos stored in Supabase with signed playback URLs</p>
                </div>
              </div>

              {videos.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-state-icon">🎬</span>
                  <p>No videos available. Upload your first video above!</p>
                </div>
              ) : (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Video Title</th>
                        <th>Course</th>
                        <th>Status</th>
                        <th>Size</th>
                        <th>Duration</th>
                        <th>Uploaded</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {videos.map((v) => {
                        const isPlaying = activePlayback?.video.id === v.id;
                        const isLoadingThis = loadingPlaybackId === v.id;
                        return (
                          <tr key={v.id}>
                            <td>
                              <div style={{ fontWeight: 600 }}>{v.title}</div>
                              {v.description && (
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                                  {v.description}
                                </div>
                              )}
                              <div className="course-id-chip" style={{ marginTop: '4px' }}>
                                ID: {v.id}
                              </div>
                            </td>
                            <td>{courseMap.get(v.courseId) || v.courseId}</td>
                            <td>
                              <span className={`badge badge-${v.status}`}>
                                {v.status === 'ready' && '✓ Ready'}
                                {v.status === 'pending' && '⏳ Pending'}
                                {v.status === 'error' && '✕ Error'}
                              </span>
                            </td>
                            <td>{formatBytes(v.sizeBytes)}</td>
                            <td>{formatDuration(v.durationSeconds)}</td>
                            <td>{formatDate(v.createdAt)}</td>
                            <td>
                              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                {v.status === 'ready' ? (
                                  <button
                                    type="button"
                                    className={`btn btn-sm ${isPlaying ? 'btn-success' : 'btn-primary'}`}
                                    onClick={() => handlePlayVideo(v)}
                                    disabled={isLoadingThis}
                                  >
                                    {isLoadingThis ? (
                                      <span className="loading-spinner"></span>
                                    ) : isPlaying ? (
                                      'Playing'
                                    ) : (
                                      '▶ Play'
                                    )}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    title="Complete video registration"
                                    onClick={async () => {
                                      try {
                                        const res = await api.completeVideo(v.id);
                                        setVideos((prev) =>
                                          prev.map((item) => (item.id === v.id ? res : item)),
                                        );
                                        setSuccessMsg(`Video "${res.title}" marked ready.`);
                                      } catch (err: unknown) {
                                        setErrorMsg(
                                          err instanceof Error ? err.message : 'Complete failed',
                                        );
                                      }
                                    }}
                                  >
                                    Finalize
                                  </button>
                                )}

                                {(user?.role === 'admin' || user?.role === 'mentor') && (
                                  <button
                                    type="button"
                                    className="btn btn-danger btn-sm"
                                    onClick={() => handleDeleteVideo(v.id)}
                                    title="Delete video"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ----------------- PAGE: LIVE SESSIONS ----------------- */}
        {page === 'live-sessions' && (
          <>
            <div className="space-between">
              <div>
                <h2>Live Class Sessions</h2>
                <p>Real-time meetings backed by LiveKit Cloud server token generation</p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={loadAllData}
                disabled={loadingData}
              >
                {loadingData ? (
                  <>
                    <span className="loading-spinner"></span> Loading...
                  </>
                ) : (
                  '🔄 Refresh'
                )}
              </button>
            </div>

            {/* Active Join Response Modal / Panel */}
            {joinedSessionInfo && (
              <div className="token-modal">
                <div className="token-modal-header">
                  <div>
                    <span className="badge badge-live">● Joined Session</span>
                    <h3 style={{ marginTop: '0.4rem' }}>
                      {joinedSessionInfo.session.title}
                    </h3>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setJoinedSessionInfo(null)}
                  >
                    ✕ Dismiss Details
                  </button>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                    gap: '1rem',
                  }}
                >
                  <div className="token-field">
                    <div className="token-field-label">
                      <span>LiveKit Host URL</span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                        onClick={() =>
                          copyToClipboard(joinedSessionInfo.details.url, 'url')
                        }
                      >
                        {copiedUrl ? 'Copied!' : 'Copy URL'}
                      </button>
                    </div>
                    <div className="token-code">{joinedSessionInfo.details.url}</div>
                  </div>

                  <div className="token-field">
                    <div className="token-field-label">
                      <span>Room Name</span>
                      <span className="badge badge-scheduled">
                        Can Publish: {joinedSessionInfo.details.canPublish ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div className="token-code">{joinedSessionInfo.details.room}</div>
                  </div>
                </div>

                <div className="token-field">
                  <div className="token-field-label">
                    <span>Generated LiveKit JWT Token</span>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}
                      onClick={() =>
                        copyToClipboard(joinedSessionInfo.details.token, 'token')
                      }
                    >
                      {copiedToken ? '✓ Copied Token!' : '📋 Copy Token'}
                    </button>
                  </div>
                  <div className="token-code" style={{ maxHeight: '110px' }}>
                    {joinedSessionInfo.details.token}
                  </div>
                </div>

                <div className="token-info-banner">
                  <span style={{ fontSize: '1.25rem' }}>ℹ️</span>
                  <div>
                    <strong>LiveKit Integration Verification:</strong>
                    <div style={{ marginTop: '0.2rem', lineHeight: '1.4' }}>
                      This token was generated by the NestJS LiveKit service. An active video
                      stream requires the <code>@livekit/components-react</code> SDK or a
                      LiveKit client application. You can paste this host URL and token into{' '}
                      <a
                        href="https://meet.livekit.io"
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: '#818cf8', textDecoration: 'underline' }}
                      >
                        LiveKit Meet
                      </a>{' '}
                      to test streaming video and audio directly.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Create Session Card */}
            {(user?.role === 'admin' || user?.role === 'mentor') && (
              <div className="card">
                <div className="card-header">
                  <div>
                    <h3>Schedule / Start Live Session</h3>
                    <p>Creates a session room associated with a course</p>
                  </div>
                </div>

                <form onSubmit={handleCreateSession}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                      gap: '1rem',
                    }}
                  >
                    <div className="form-group">
                      <label htmlFor="session-course">Select Course *</label>
                      <select
                        id="session-course"
                        className="form-control"
                        value={sessionCourseId}
                        onChange={(e) => setSessionCourseId(e.target.value)}
                        required
                      >
                        {courses.length === 0 && (
                          <option value="">No courses available</option>
                        )}
                        {courses.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="session-title">Session Title *</label>
                      <input
                        id="session-title"
                        type="text"
                        className="form-control"
                        value={sessionTitle}
                        onChange={(e) => setSessionTitle(e.target.value)}
                        placeholder="e.g. Q&amp;A Architecture Workshop"
                        required
                        minLength={3}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={creatingSession || sessionTitle.trim().length < 3 || !sessionCourseId}
                    >
                      {creatingSession ? (
                        <>
                          <span className="loading-spinner"></span> Creating...
                        </>
                      ) : (
                        '📡 Create Live Session'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Live Sessions List Table */}
            <div className="card">
              <div className="card-header">
                <div>
                  <h3>All Live Sessions ({sessions.length})</h3>
                  <p>Join active sessions to acquire a participant token</p>
                </div>
              </div>

              {sessions.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-state-icon">📡</span>
                  <p>No live sessions found. Create a session to get started!</p>
                </div>
              ) : (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Title &amp; Room</th>
                        <th>Course</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th>Ended</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.map((s) => {
                        const isJoining = joiningSessionId === s.id;
                        const isJoined = joinedSessionInfo?.session.id === s.id;
                        return (
                          <tr key={s.id}>
                            <td>
                              <div style={{ fontWeight: 600 }}>{s.title}</div>
                              <div className="course-id-chip" style={{ marginTop: '3px' }}>
                                Room: {s.roomName}
                              </div>
                            </td>
                            <td>{courseMap.get(s.courseId) || s.courseId}</td>
                            <td>
                              <span className={`badge badge-${s.status}`}>
                                {s.status === 'live' && '● Live Now'}
                                {s.status === 'scheduled' && '📅 Scheduled'}
                                {s.status === 'ended' && 'Ended'}
                              </span>
                            </td>
                            <td>{formatDate(s.createdAt)}</td>
                            <td>{formatDate(s.endedAt)}</td>
                            <td>
                              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                <button
                                  type="button"
                                  className={`btn btn-sm ${isJoined ? 'btn-success' : 'btn-primary'}`}
                                  onClick={() => handleJoinSession(s)}
                                  disabled={isJoining}
                                >
                                  {isJoining ? (
                                    <span className="loading-spinner"></span>
                                  ) : isJoined ? (
                                    'Joined'
                                  ) : (
                                    '🔑 Join'
                                  )}
                                </button>

                                {s.status !== 'ended' &&
                                  (user?.role === 'admin' || user?.role === 'mentor') && (
                                    <button
                                      type="button"
                                      className="btn btn-danger btn-sm"
                                      onClick={() => handleEndSession(s.id)}
                                      title="End session"
                                    >
                                      End
                                    </button>
                                  )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </>
  );
}

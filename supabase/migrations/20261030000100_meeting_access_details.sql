-- Optional guest access details, protected by the existing academic API/RLS.
alter table video.live_sessions
  add column if not exists meeting_id text,
  add column if not exists meeting_passcode text;

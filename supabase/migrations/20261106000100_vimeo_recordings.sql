-- Preserve existing uploaded videos.
alter table video.videos add column source_type text not null default 'storage' check (source_type in ('storage', 'vimeo'));
alter table video.videos add column external_url text;
alter table video.videos alter column storage_path drop not null;
alter table video.videos add constraint videos_source_check check (
 (source_type = 'storage' and storage_path is not null and external_url is null)
 or (source_type = 'vimeo' and storage_path is null and external_url is not null)
);

-- Refresh the API schema after adding the recording fields.
NOTIFY pgrst, 'reload schema';

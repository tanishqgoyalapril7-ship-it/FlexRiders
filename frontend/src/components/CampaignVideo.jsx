import React, { useEffect, useRef, useState } from 'react';
import { Film, Link2, Trash2, Upload } from 'lucide-react';
import { api } from '../services/api';
import { toast } from './Feedback';

const MAX_MB = 50;
const TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

/** YouTube links play in an embedded player; other links open in a new tab. */
function youtubeEmbed(url) {
  const m = (url || '').match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/);
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : null;
}

function Preview({ video }) {
  if (!video || !video.url) return null;
  const embed = video.kind === 'LINK' ? youtubeEmbed(video.url) : null;
  if (embed) {
    return (
      <iframe
        title="Campaign video"
        src={embed}
        style={{ width: '100%', aspectRatio: '16 / 9', border: 0, borderRadius: 10 }}
        allow="encrypted-media; picture-in-picture"
        allowFullScreen
      />
    );
  }
  if (video.kind === 'UPLOAD' || /\.(mp4|webm|mov)(\?|$)/i.test(video.url)) {
    return <video src={video.url} controls preload="metadata" style={{ width: '100%', maxHeight: 360, borderRadius: 10, background: '#0F172A' }} />;
  }
  return (
    <a href={video.url} target="_blank" rel="noopener noreferrer" className="btn-secondary" style={{ display: 'inline-flex' }}>
      Open video link
    </a>
  );
}

/** Campaign video shown to riders in the app: a YouTube / Drive link, or an uploaded file (private storage). */
export default function CampaignVideoCard({ campaign, onChanged }) {
  const [video, setVideo] = useState(null);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const fileRef = useRef(null);
  const closed = campaign.status === 'COMPLETED' || campaign.status === 'CANCELLED';

  const load = () =>
    api
      .getCampaignVideo(campaign.id)
      .then(setVideo)
      .catch(() => setVideo(null));
  useEffect(() => {
    load();
  }, [campaign.id, campaign.video && campaign.video.kind, campaign.video && campaign.video.link]);

  const run = async (action, done) => {
    setBusy(true);
    try {
      await action();
      toast.success(done);
      setLink('');
      await load();
      onChanged && onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const onFile = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!TYPES.includes(file.type)) return toast.error('Please choose an MP4, WEBM or MOV video.');
    if (file.size > MAX_MB * 1024 * 1024) return toast.error(`The video must be ${MAX_MB} MB or smaller. For a longer video, add a YouTube or Google Drive link.`);
    setProgress(0);
    run(() => api.uploadCampaignVideo(campaign.id, file, setProgress), 'Video uploaded. Riders can watch it in the app.');
  };

  return (
    <div className="card">
      <div className="card-header-bar">
        <span className="card-title-text" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Film size={16} />
          Campaign Video
        </span>
        {video && video.kind ? (
          <span style={{ fontSize: '0.78rem', color: '#64748B' }}>{video.kind === 'UPLOAD' ? 'Uploaded file (private)' : 'Video link'}</span>
        ) : null}
      </div>
      {video && video.kind ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <Preview video={video} />
          {video.kind === 'LINK' ? (
            <a href={video.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem', wordBreak: 'break-all' }}>
              {video.url}
            </a>
          ) : null}
        </div>
      ) : (
        <p style={{ fontSize: '0.84rem', color: '#94A3B8' }}>
          No video yet. Add a short video that shows riders how to run this campaign; approved riders who can see the campaign can watch it in the app.
        </p>
      )}
      {!closed ? (
        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              className="form-input"
              style={{ flex: '1 1 260px' }}
              placeholder="https://youtube.com/… or Google Drive link"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              disabled={busy}
            />
            <button
              className="btn-secondary"
              disabled={busy || !link.trim()}
              onClick={() => run(() => api.setCampaignVideoLink(campaign.id, link.trim()), 'Video link saved.')}
            >
              <Link2 size={15} />
              Save link
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input ref={fileRef} type="file" accept={TYPES.join(',')} style={{ display: 'none' }} onChange={onFile} />
            <button className="btn-secondary" disabled={busy} onClick={() => fileRef.current && fileRef.current.click()}>
              <Upload size={15} />
              {progress !== null ? `Uploading… ${progress}%` : 'Upload video'}
            </button>
            {video && video.kind ? (
              <button
                className="btn-danger-outline"
                disabled={busy}
                onClick={() => window.confirm('Remove the campaign video?') && run(() => api.removeCampaignVideo(campaign.id), 'Video removed.')}
              >
                <Trash2 size={15} />
                Remove
              </button>
            ) : null}
            <span className="form-hint">MP4, WEBM or MOV, up to {MAX_MB} MB. Uploaded videos are private: riders get a temporary link.</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

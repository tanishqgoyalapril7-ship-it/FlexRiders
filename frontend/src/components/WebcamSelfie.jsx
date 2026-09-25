import React, { useEffect, useRef, useState } from 'react';
import { Camera, RotateCcw } from 'lucide-react';

const MAX_EDGE = 720; // Same size the rider app sends

/** Required driver selfie for riders an admin adds: taken live with the device camera (no file upload).
 *  onChange(base64Jpeg | null). */
export default function WebcamSelfie({ value, onChange }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [state, setState] = useState('idle'); // idle | starting | live | error
  const [problem, setProblem] = useState('');

  const stop = () => {
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  useEffect(() => stop, []);

  const start = async () => {
    setProblem('');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setState('error');
      setProblem('This browser can’t use a camera here. Open the dashboard over https in Chrome, Edge or Safari.');
      return;
    }
    setState('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } }, audio: false });
      streamRef.current = stream;
      setState('live');
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch (err) {
      setState('error');
      setProblem(
        err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')
          ? 'Camera access was blocked. Allow the camera for this site in the browser’s address bar, then try again.'
          : err && err.name === 'NotFoundError'
          ? 'No camera was found on this device. Use a laptop or phone with a camera.'
          : 'The camera couldn’t be started. Close other apps using it and try again.'
      );
    }
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const scale = Math.min(1, MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    onChange(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
    stop();
    setState('idle');
  };

  return (
    <div className="selfie-box">
      {value ? (
        <img className="selfie-preview" src={`data:image/jpeg;base64,${value}`} alt="Driver selfie" />
      ) : state === 'live' || state === 'starting' ? (
        <video ref={videoRef} className="selfie-preview selfie-video" playsInline muted />
      ) : (
        <div className="selfie-preview selfie-empty">No selfie yet</div>
      )}
      <div className="selfie-actions">
        {state === 'live' ? (
          <button type="button" className="btn-primary" onClick={capture}>
            <Camera size={15} /> Capture
          </button>
        ) : (
          <button
            type="button"
            className={value ? 'btn-secondary' : 'btn-primary'}
            onClick={() => {
              onChange(null);
              start();
            }}
            disabled={state === 'starting'}
          >
            {value ? <RotateCcw size={15} /> : <Camera size={15} />} {value ? 'Retake' : state === 'starting' ? 'Starting camera…' : 'Open Camera'}
          </button>
        )}
        <span className="form-hint">
          {problem || 'Take the rider’s photo now with the camera (face clearly visible). It’s private: only admins can see it.'}
        </span>
      </div>
    </div>
  );
}

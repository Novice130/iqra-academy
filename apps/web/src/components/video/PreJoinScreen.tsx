'use client';

import React, { useEffect, useRef, useState } from 'react';

interface PreJoinScreenProps {
  userName: string;
  onJoin: (options: { videoEnabled: boolean; audioEnabled: boolean }) => void;
}

export default function PreJoinScreen({ userName, onJoin }: PreJoinScreenProps) {
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoEnabled) {
      navigator.mediaDevices
        .getUserMedia({ video: true, audio: false })
        .then((s) => {
          setStream(s);
          if (videoRef.current) {
            videoRef.current.srcObject = s;
          }
        })
        .catch((err) => {
          console.error('Error accessing camera:', err);
          setVideoEnabled(false);
        });
    } else {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        setStream(null);
      }
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [videoEnabled]);

  const handleJoin = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    onJoin({ videoEnabled, audioEnabled });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white p-4 font-sans">
      <div className="w-full max-w-2xl bg-slate-900/50 backdrop-blur-md rounded-2xl p-8 border border-slate-800 shadow-2xl flex flex-col md:flex-row gap-8">
        <div className="flex-1 flex flex-col justify-center">
          <h1 className="text-3xl font-bold tracking-tight mb-2 bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
            Ready to Join?
          </h1>
          <p className="text-slate-400 text-sm mb-6">
            Hi <span className="text-white font-medium">{userName}</span>, check your video and audio settings before joining the class.
          </p>

          <div className="flex flex-col gap-4">
            <button
              onClick={() => setVideoEnabled(!videoEnabled)}
              className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                videoEnabled
                  ? 'bg-slate-800/80 border-emerald-500/30 text-white'
                  : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}
            >
              <span className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full ${videoEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`} />
                Camera
              </span>
              <span className="font-semibold text-sm">{videoEnabled ? 'ON' : 'OFF'}</span>
            </button>

            <button
              onClick={() => setAudioEnabled(!audioEnabled)}
              className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                audioEnabled
                  ? 'bg-slate-800/80 border-emerald-500/30 text-white'
                  : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}
            >
              <span className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full ${audioEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`} />
                Microphone
              </span>
              <span className="font-semibold text-sm ml-3">{audioEnabled ? 'ON' : 'OFF'}</span>
            </button>
          </div>

          <button
            onClick={handleJoin}
            className="mt-8 w-full py-4 px-6 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold rounded-xl shadow-lg transition-transform active:scale-95 cursor-pointer"
          >
            Join Meeting
          </button>
        </div>

        <div className="flex-grow flex flex-col justify-center items-center">
          <div className="w-full aspect-video rounded-xl bg-slate-950 overflow-hidden relative border border-slate-800 flex items-center justify-center">
            {videoEnabled ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover scale-x-[-1]"
              />
            ) : (
              <div className="flex flex-col items-center gap-3 text-slate-600">
                <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span className="text-xs uppercase tracking-wider font-semibold">Camera is disabled</span>
              </div>
            )}
            <div className="absolute bottom-3 left-3 bg-slate-900/80 backdrop-blur-sm px-3 py-1 rounded-md text-xs border border-slate-800 text-slate-400">
              Preview
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

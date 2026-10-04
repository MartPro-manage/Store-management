import React, { useState, useEffect } from 'react';
import { 
  Camera, 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  Video, 
  VideoOff, 
  ShieldCheck, 
  CheckCircle2, 
  XCircle, 
  Sparkles, 
  Play,
  Settings,
  Lock
} from 'lucide-react';
import { speakMessage } from '../lib/speech';

interface HardwarePermissionsBarProps {
  voiceEnabled: boolean;
  onToggleVoice: (enabled: boolean) => void;
  voiceAllowed?: boolean;
  cameraScannerEnabled?: boolean;
  onToggleCameraScanner?: (enabled: boolean) => void;
}

export const HardwarePermissionsBar: React.FC<HardwarePermissionsBarProps> = ({
  voiceEnabled,
  onToggleVoice,
  voiceAllowed = true,
  cameraScannerEnabled = true,
  onToggleCameraScanner
}) => {
  const [cameraState, setCameraState] = useState<'granted' | 'denied' | 'prompt' | 'active' | 'inactive'>('prompt');
  const [micState, setMicState] = useState<'granted' | 'denied' | 'prompt' | 'active' | 'inactive'>('prompt');
  const [activeCamStream, setActiveCamStream] = useState<MediaStream | null>(null);
  const [activeMicStream, setActiveMicStream] = useState<MediaStream | null>(null);
  const [permissionMsg, setPermissionMsg] = useState<string | null>(null);

  // Query browser permissions if supported
  useEffect(() => {
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'camera' as any }).then((status) => {
        setCameraState(status.state as any);
        status.onchange = () => setCameraState(status.state as any);
      }).catch(() => {});

      navigator.permissions.query({ name: 'microphone' as any }).then((status) => {
        setMicState(status.state as any);
        status.onchange = () => setMicState(status.state as any);
      }).catch(() => {});
    }
  }, []);

  const requestCameraPermission = async () => {
    try {
      setPermissionMsg('Requesting Camera Access...');
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      // Immediately stop test tracks so the camera is free for Html5Qrcode scanner
      stream.getTracks().forEach(track => track.stop());
      setActiveCamStream(null);
      setCameraState('granted');
      setPermissionMsg('Camera permission ALLOWED! Barcode scanner is ready.');
      setTimeout(() => setPermissionMsg(null), 4000);
    } catch (err: any) {
      console.warn('Camera permission denied or error:', err);
      setCameraState('denied');
      setPermissionMsg('Camera permission DISALLOWED / BLOCKED by browser settings.');
      setTimeout(() => setPermissionMsg(null), 5000);
    }
  };

  const stopCameraAccess = () => {
    if (activeCamStream) {
      activeCamStream.getTracks().forEach(track => track.stop());
      setActiveCamStream(null);
    }
    setCameraState('denied');
    setPermissionMsg('Camera access DISALLOWED / DISABLED for POS session.');
    setTimeout(() => setPermissionMsg(null), 4000);
  };

  const requestMicPermission = async () => {
    try {
      setPermissionMsg('Requesting Microphone Access...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Immediately stop test tracks
      stream.getTracks().forEach(track => track.stop());
      setActiveMicStream(null);
      setMicState('granted');
      setPermissionMsg('Microphone permission ALLOWED!');
      setTimeout(() => setPermissionMsg(null), 4000);
    } catch (err: any) {
      console.warn('Microphone permission denied or error:', err);
      setMicState('denied');
      setPermissionMsg('Microphone permission DISALLOWED / BLOCKED by browser settings.');
      setTimeout(() => setPermissionMsg(null), 5000);
    }
  };

  const stopMicAccess = () => {
    if (activeMicStream) {
      activeMicStream.getTracks().forEach(track => track.stop());
      setActiveMicStream(null);
    }
    setMicState('denied');
    setPermissionMsg('Microphone access DISALLOWED / DISABLED.');
    setTimeout(() => setPermissionMsg(null), 4000);
  };

  const handleTestVoice = () => {
    if (!voiceAllowed) {
      setPermissionMsg('⚠️ Voice generation is DISALLOWED by Super Admin policy for this store.');
      setTimeout(() => setPermissionMsg(null), 4000);
      return;
    }
    speakMessage('Total bill is 450 rupees. Thank you for shopping with us!');
    setPermissionMsg('🔊 Speaking: "Total bill is 450 rupees. Thank you for shopping with us!"');
    setTimeout(() => setPermissionMsg(null), 4000);
  };

  return (
    <div className="bg-slate-900 text-white p-4 rounded-2xl border border-slate-800 shadow-md space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-orange-500/20 text-orange-400 rounded-xl">
            <Settings className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-extrabold tracking-wide uppercase text-slate-200">
              Hardware Permissions & Checkout Audio Voice Controls
            </h4>
            <p className="text-[11px] text-slate-400 font-medium">
              Manage Camera barcode scanning, Microphone access, and Voice Greetings
            </p>
          </div>
        </div>

        {/* Audio Voice Greeting Toggle & Test (Only shown if voice is allowed) */}
        <div className="flex flex-wrap items-center gap-2">
          {cameraScannerEnabled && onToggleCameraScanner && (
            <button
              type="button"
              onClick={() => onToggleCameraScanner(!cameraScannerEnabled)}
              className="px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer border bg-blue-500/20 text-blue-300 border-blue-500/40 hover:bg-blue-500/30"
              title="Camera scanner is active"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Camera Scanner: ACTIVE</span>
            </button>
          )}

          {voiceAllowed && (
            <>
              <button
                type="button"
                onClick={handleTestVoice}
                className="px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm bg-orange-600 hover:bg-orange-500 text-white cursor-pointer"
                title="Test voice greeting & bill total audio"
              >
                <Volume2 className="w-3.5 h-3.5 animate-pulse" /> Test Voice
              </button>

              <button
                type="button"
                onClick={() => onToggleVoice(!voiceEnabled)}
                className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all border cursor-pointer ${
                  voiceEnabled 
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30' 
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                }`}
                title="Toggle voice announcements"
              >
                {voiceEnabled ? <Volume2 className="w-3.5 h-3.5 text-emerald-400" /> : <VolumeX className="w-3.5 h-3.5" />}
                <span>Voice: {voiceEnabled ? 'ON' : 'OFF'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Permission Status Feedback Alert */}
      {permissionMsg && (
        <div className="px-3 py-2 bg-slate-800 text-amber-300 rounded-xl text-xs font-bold border border-slate-700 flex items-center gap-2 animate-fade-in">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{permissionMsg}</span>
        </div>
      )}

      {/* Hardware Camera & External Scanner Permission Cards (Only shown if allowed) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        
        {/* Built-in Camera Scanner Status (Only shown if allowed) */}
        {cameraScannerEnabled && (
          <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-lg ${cameraState === 'granted' ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-400'}`}>
                <Camera className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  Camera Scanner
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.2 rounded font-mono font-bold">SHOWN</span>
                </div>
                <div className="text-[10px] text-slate-400">
                  On-screen scan button active
                </div>
              </div>
            </div>

            {onToggleCameraScanner && (
              <button
                type="button"
                onClick={() => onToggleCameraScanner(!cameraScannerEnabled)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
              >
                Disable
              </button>
            )}
          </div>
        )}

        {/* External Hardware Barcode Scanner Status */}
        <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                External Scanner
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.2 rounded font-mono font-bold">HANDS-FREE</span>
              </div>
              <div className="text-[10px] text-slate-400">USB / Bluetooth auto-scan & add</div>
            </div>
          </div>
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" title="External Scanner Listener Active" />
        </div>

        {/* Microphone & Voice Audio Status (Only shown if allowed) */}
        {voiceAllowed && (
          <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-lg ${
                voiceEnabled 
                  ? 'bg-emerald-500/20 text-emerald-400' 
                  : 'bg-slate-800 text-slate-400'
              }`}>
                <Mic className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  Voice Audio
                  {voiceEnabled ? (
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.2 rounded font-mono font-bold">READY</span>
                  ) : (
                    <span className="text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.2 rounded font-mono font-bold">MUTED</span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 font-medium">
                  Bill total & thank you speech
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onToggleVoice(!voiceEnabled)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  voiceEnabled
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
                }`}
              >
                {voiceEnabled ? 'Mute' : 'Unmute'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

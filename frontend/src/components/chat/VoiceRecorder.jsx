import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, PauseCircle, Send, Trash2, XCircle } from 'lucide-react';

const MEDIA_RECORDER_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
];

const DEFAULT_WAVE_BARS = 24;

const formatDuration = (seconds = 0) => {
  const safeSeconds = Math.max(0, Math.round(Number(seconds || 0)));
  const mins = String(Math.floor(safeSeconds / 60)).padStart(2, '0');
  const secs = String(safeSeconds % 60).padStart(2, '0');
  return `${mins}:${secs}`;
};

const getSupportedMimeType = () => {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
    return '';
  }

  return (
    MEDIA_RECORDER_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) || ''
  );
};

const buildWaveform = async (blob, totalBars = DEFAULT_WAVE_BARS) => {
  if (!blob) return [];

  let context = null;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return [];
    context = new Ctx();
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await context.decodeAudioData(arrayBuffer);
    const channelData = audioBuffer.getChannelData(0);

    const bars = [];
    const blockSize = Math.max(1, Math.floor(channelData.length / totalBars));

    for (let i = 0; i < totalBars; i += 1) {
      const start = i * blockSize;
      const end = Math.min(channelData.length, start + blockSize);
      let peak = 0;
      for (let j = start; j < end; j += 1) {
        const value = Math.abs(channelData[j] || 0);
        if (value > peak) peak = value;
      }
      bars.push(Number((peak * 100).toFixed(2)));
    }

    return bars;
  } catch {
    return [];
  } finally {
    if (context && typeof context.close === 'function') {
      try {
        await context.close();
      } catch {
        // ignore audio context close failures
      }
    }
  }
};

const VoiceRecorder = ({ onSendVoice, disabled = false, uploading = false }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [permissionError, setPermissionError] = useState('');
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedUrl, setRecordedUrl] = useState('');
  const [waveform, setWaveform] = useState([]);
  const [isPreparingWaveform, setIsPreparingWaveform] = useState(false);

  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerIntervalRef = useRef(null);
  const recordingStartedAtRef = useRef(0);
  const isSendingRef = useRef(false);
  const discardOnStopRef = useRef(false);

  const recordingLabel = useMemo(
    () => (isRecording ? `Recording... ${formatDuration(timerSeconds)}` : 'Voice note'),
    [isRecording, timerSeconds]
  );

  const clearTimer = () => {
    if (timerIntervalRef.current) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  const stopTracks = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  };

  const cleanupRecordingState = () => {
    clearTimer();
    stopTracks();
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  };

  const clearPreview = () => {
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
    }
    setRecordedUrl('');
    setRecordedBlob(null);
    setWaveform([]);
    setTimerSeconds(0);
  };

  const startRecording = async () => {
    if (disabled || uploading || isRecording) return;

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setPermissionError('Voice recording is not supported in this browser.');
      return;
    }

    try {
      setPermissionError('');
      clearPreview();
      discardOnStopRef.current = false;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recordingStartedAtRef.current = Date.now();
      setTimerSeconds(0);
      setIsRecording(true);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        setIsRecording(false);
        clearTimer();
        stopTracks();

        const shouldDiscard = discardOnStopRef.current;
        discardOnStopRef.current = false;

        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        chunksRef.current = [];

        if (shouldDiscard || !blob.size) {
          setRecordedBlob(null);
          setRecordedUrl('');
          setWaveform([]);
          setTimerSeconds(0);
          return;
        }

        const durationSeconds = Math.max(
          1,
          Math.round((Date.now() - recordingStartedAtRef.current) / 1000)
        );
        setTimerSeconds(durationSeconds);
        setRecordedBlob(blob);
        const objectUrl = URL.createObjectURL(blob);
        setRecordedUrl(objectUrl);

        setIsPreparingWaveform(true);
        const bars = await buildWaveform(blob);
        setWaveform(bars);
        setIsPreparingWaveform(false);
      };

      recorder.start(300);

      timerIntervalRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartedAtRef.current) / 1000);
        setTimerSeconds(Math.max(0, elapsed));
      }, 250);
    } catch (error) {
      cleanupRecordingState();
      setIsRecording(false);
      if (error?.name === 'NotAllowedError') {
        setPermissionError('Microphone permission denied.');
      } else {
        setPermissionError('Unable to start recording.');
      }
    }
  };

  const stopRecording = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') return;
    mediaRecorderRef.current.stop();
  };

  const cancelRecording = () => {
    if (isRecording && mediaRecorderRef.current?.state === 'recording') {
      discardOnStopRef.current = true;
      mediaRecorderRef.current.stop();
    }
    cleanupRecordingState();
    setIsRecording(false);
    clearPreview();
    setPermissionError('');
  };

  const handleSend = async () => {
    if (!recordedBlob || uploading || disabled || isSendingRef.current) return;
    isSendingRef.current = true;

    const extension = recordedBlob.type.includes('ogg')
      ? 'ogg'
      : recordedBlob.type.includes('mpeg') || recordedBlob.type.includes('mp3')
        ? 'mp3'
        : recordedBlob.type.includes('wav')
          ? 'wav'
          : 'webm';

    const file = new File([recordedBlob], `voice-note-${Date.now()}.${extension}`, {
      type: recordedBlob.type || 'audio/webm',
    });

    try {
      await onSendVoice?.({
        file,
        duration: Math.max(1, Number(timerSeconds || 0)),
        waveform,
        previewUrl: recordedUrl,
      });
      clearPreview();
    } catch {
      // preserve preview to allow retry after failure
    } finally {
      isSendingRef.current = false;
    }
  };

  useEffect(() => {
    return () => {
      clearTimer();
      stopTracks();
      if (recordedUrl) {
        URL.revokeObjectURL(recordedUrl);
      }
    };
  }, [recordedUrl]);

  if (!isRecording && !recordedBlob) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={startRecording}
          disabled={disabled || uploading}
          className="h-11 rounded-2xl bg-emerald-600 px-4 text-white disabled:opacity-50"
          title="Record voice note"
        >
          <Mic className="h-5 w-5" />
        </button>
        {permissionError ? (
          <p className="max-w-48 text-right text-[11px] font-semibold text-rose-600">
            {permissionError}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="w-full rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-emerald-800">{recordingLabel}</p>
          {permissionError ? (
            <p className="text-xs font-semibold text-rose-600">{permissionError}</p>
          ) : null}
        </div>
        {isRecording ? (
          <span className="inline-flex h-3 w-3 rounded-full bg-rose-500 animate-pulse" />
        ) : null}
      </div>

      {isRecording ? (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={stopRecording}
            className="inline-flex items-center gap-1 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white"
          >
            <PauseCircle className="h-4 w-4" />
            Stop
          </button>
          <button
            type="button"
            onClick={cancelRecording}
            className="inline-flex items-center gap-1 rounded-xl bg-slate-200 px-3 py-2 text-xs font-bold text-slate-700"
          >
            <XCircle className="h-4 w-4" />
            Cancel
          </button>
        </div>
      ) : recordedBlob ? (
        <div className="mt-3 space-y-2">
          <audio src={recordedUrl} controls className="w-full" />

          {isPreparingWaveform ? (
            <p className="text-xs text-slate-500">Preparing waveform...</p>
          ) : waveform.length ? (
            <div className="flex items-end gap-0.5 rounded-lg bg-white px-2 py-1">
              {waveform.map((value, index) => (
                <span
                  key={`${index}-${value}`}
                  className="w-1 rounded-full bg-emerald-500/80"
                  style={{ height: `${Math.max(3, Math.min(20, Number(value || 0) / 5))}px` }}
                />
              ))}
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSend}
              disabled={disabled || uploading}
              className="inline-flex items-center gap-1 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              Send voice
            </button>
            <button
              type="button"
              onClick={cancelRecording}
              disabled={uploading}
              className="inline-flex items-center gap-1 rounded-xl bg-slate-200 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              Discard
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default VoiceRecorder;

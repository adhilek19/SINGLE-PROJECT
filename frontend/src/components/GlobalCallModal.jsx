import { Link } from 'react-router-dom';
import { Mic, MicOff, Phone, PhoneOff } from 'lucide-react';

const isActionableState = (state) => ['calling', 'ringing', 'connected'].includes(state);

const GlobalCallModal = ({
  callState,
  callStateLabel,
  activeCall,
  incomingCall,
  peer,
  callActionLoading,
  hasLocalStream,
  isMuted,
  onAccept,
  onReject,
  onEnd,
  onToggleMute,
  onOpenChat,
}) => {
  const showIncoming = Boolean(incomingCall && callState === 'ringing' && !activeCall);
  const showActive = Boolean(activeCall && isActionableState(callState));
  const showStatus = Boolean(callStateLabel || showIncoming || showActive);

  if (!showStatus) return null;

  const chatId =
    (incomingCall?.chatId && String(incomingCall.chatId)) ||
    (activeCall?.chatId && String(activeCall.chatId)) ||
    '';
  const callerName = peer?.name || 'SahaYatri user';
  const callerAvatar = peer?.profilePic || '';

  return (
    <>
      {showIncoming ? (
        <div className="fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-sm">
          <div className="flex h-full items-center justify-center p-4">
            <div className="relative w-full max-w-sm overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-950 px-6 py-8 text-white shadow-2xl">
              <div className="absolute inset-0 opacity-30">
                <div className="absolute left-1/2 top-24 h-40 w-40 -translate-x-1/2 rounded-full bg-emerald-400/30 blur-3xl" />
              </div>

              <div className="relative flex flex-col items-center text-center">
                <div className="relative">
                  <div className="absolute inset-[-10px] animate-ping rounded-full bg-emerald-300/20" />
                  <div className="relative h-24 w-24 overflow-hidden rounded-full border-4 border-white/15 bg-white/10">
                    {callerAvatar ? (
                      <img
                        src={callerAvatar}
                        alt={callerName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-3xl font-black">
                        {callerName.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>
                </div>

                <p className="mt-6 text-sm font-semibold uppercase tracking-[0.3em] text-emerald-200/80">
                  Incoming audio call
                </p>
                <h2 className="mt-3 text-3xl font-black">{callerName}</h2>
                <p className="mt-2 text-sm text-emerald-100/80">
                  Answer from anywhere, like WhatsApp.
                </p>

                <div className="mt-8 flex w-full items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={onReject}
                    disabled={callActionLoading}
                    className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg shadow-rose-900/30 transition hover:scale-[1.03] disabled:opacity-60"
                    aria-label="Reject incoming call"
                  >
                    <PhoneOff className="h-6 w-6" />
                  </button>
                  <button
                    type="button"
                    onClick={onAccept}
                    disabled={callActionLoading}
                    className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400 text-emerald-950 shadow-xl shadow-emerald-900/40 transition hover:scale-[1.03] disabled:opacity-60"
                    aria-label="Accept incoming call"
                  >
                    <Phone className="h-7 w-7" />
                  </button>
                </div>

                {chatId ? (
                  <button
                    type="button"
                    onClick={onOpenChat}
                    className="mt-6 text-sm font-semibold text-emerald-100 underline underline-offset-4"
                  >
                    Open related chat
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showActive ? (
        <div className="fixed bottom-24 right-4 z-[70] w-[min(92vw,22rem)] rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-2xl backdrop-blur md:bottom-6 md:right-6">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 overflow-hidden rounded-full bg-emerald-100">
              {callerAvatar ? (
                <img src={callerAvatar} alt={callerName} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-lg font-black text-emerald-700">
                  {callerName.slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black text-slate-900">{callerName}</p>
              <p className="truncate text-xs font-semibold text-slate-500">
                {callStateLabel || 'Audio call'}
              </p>
            </div>
            {chatId ? (
              <Link
                to={`/chats/${chatId}`}
                onClick={onOpenChat}
                className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-700"
              >
                Chat
              </Link>
            ) : null}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onToggleMute}
              disabled={callActionLoading || !hasLocalStream}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700 disabled:opacity-50"
            >
              {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              {isMuted ? 'Unmute' : 'Mute'}
            </button>
            <button
              type="button"
              onClick={onEnd}
              disabled={callActionLoading}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              <PhoneOff className="h-4 w-4" />
              End
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default GlobalCallModal;

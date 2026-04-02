import { useEffect, useState } from 'react';
import useSso from './hooks/useSso';
import { api } from './api';
import Header from './components/Header';
import ConnectionTypeSelector from './components/ConnectionTypeSelector';
import ConnectionDashboard from './components/ConnectionDashboard';
import BotSetupCard from './components/BotSetupCard';
import PhoneSetupCard from './components/PhoneSetupCard';
import { Loader, AlertCircle } from './components/Icons';

export default function App() {
  const { user, loading: ssoLoading, error: ssoError, ssoPayload } = useSso();
  const [appState, setAppState] = useState('loading'); // loading | error | disconnected | connected
  const [botInfo, setBotInfo] = useState(null);
  const [phoneInfo, setPhoneInfo] = useState(null);
  const [setupType, setSetupType] = useState(null); // null | 'bot' | 'phone'
  const [errorMsg, setErrorMsg] = useState('');

  // Fetch config once SSO resolves
  useEffect(() => {
    if (ssoLoading) return;
    if (ssoError) { setAppState('error'); setErrorMsg(ssoError); return; }
    if (!user) return;

    const fetchConfig = async () => {
      try {
        const config = await api.call('GET', `/settings/${user.locationId}`, ssoPayload);
        if (config.botConnected && config.bot) setBotInfo(config.bot);
        if (config.phoneConnected && config.phone) setPhoneInfo(config.phone);
        setAppState(config.botConnected || config.phoneConnected ? 'connected' : 'disconnected');
      } catch {
        setAppState('disconnected');
      }
    };
    fetchConfig();
  }, [user, ssoLoading, ssoError, ssoPayload]);

  // ── Loading ──────────────────────────────────────
  if (appState === 'loading') {
    return (
      <div className="max-w-[720px] mx-auto px-6 py-8 min-h-screen">
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
          <div className="w-12 h-12 flex items-center justify-center"><Loader /></div>
          <p className="text-base font-medium text-gray-900">Connecting to GoHighLevel...</p>
          <p className="text-sm text-gray-500">Verifying your session</p>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────
  if (appState === 'error') {
    return (
      <div className="max-w-[720px] mx-auto px-6 py-8 min-h-screen">
        <div className="flex gap-3 p-6 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle />
          <div>
            <h3 className="text-[15px] font-semibold text-red-900 mb-1">Connection Error</h3>
            <p className="text-sm text-red-700 mb-3">{errorMsg}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Refresh Page
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Connected (at least one) ─────────────────────
  if (appState === 'connected') {
    return (
      <div className="max-w-[720px] mx-auto px-6 py-8 min-h-screen">
        <Header botConnected={!!botInfo} phoneConnected={!!phoneInfo} />
        <ConnectionDashboard
          botInfo={botInfo}
          phoneInfo={phoneInfo}
          user={user}
          ssoPayload={ssoPayload}
          onBotDisconnect={() => {
            setBotInfo(null);
            if (!phoneInfo) setAppState('disconnected');
          }}
          onPhoneDisconnect={() => {
            setPhoneInfo(null);
            if (!botInfo) setAppState('disconnected');
          }}
          onBotConnected={(bot) => { setBotInfo(bot); setAppState('connected'); }}
          onPhoneConnected={(phone) => { setPhoneInfo(phone); setAppState('connected'); }}
        />
      </div>
    );
  }

  // ── Disconnected ─────────────────────────────────
  return (
    <div className="max-w-[720px] mx-auto px-6 py-8 min-h-screen">
      <Header botConnected={false} phoneConnected={false} />

      {!setupType && (
        <ConnectionTypeSelector
          onSelectBot={() => setSetupType('bot')}
          onSelectPhone={() => setSetupType('phone')}
        />
      )}

      {setupType === 'bot' && (
        <BotSetupCard
          user={user}
          ssoPayload={ssoPayload}
          onConnected={(bot) => { setBotInfo(bot); setAppState('connected'); setSetupType(null); }}
          onBack={() => setSetupType(null)}
        />
      )}

      {setupType === 'phone' && (
        <PhoneSetupCard
          user={user}
          ssoPayload={ssoPayload}
          onConnected={(phone) => { setPhoneInfo(phone); setAppState('connected'); setSetupType(null); }}
          onBack={() => setSetupType(null)}
        />
      )}

      {/* How it works - shown when no setup type selected */}
      {!setupType && (
        <div className="mt-8 px-1">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">How it works</h3>
          <div className="flex items-start gap-3">
            {[
              { emoji: '💬', label: 'Customer sends a message on Telegram' },
              { emoji: '⚡', label: 'TeleSync syncs it to your GHL inbox' },
              { emoji: '👤', label: 'Your team replies from GHL' },
              { emoji: '✅', label: 'Customer gets the reply on Telegram' },
            ].map((item, i) => (
              <div key={i} className="flex-1 flex flex-col items-center text-center">
                <div className="text-2xl mb-2">{item.emoji}</div>
                <div className="text-xs text-gray-600 leading-snug">{item.label}</div>
                {i < 3 && (
                  <div className="hidden sm:block absolute translate-x-[100%] top-3 text-gray-300">›</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

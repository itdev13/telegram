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
        <div className="mt-6 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">How it works</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { num: '1', title: 'Customer messages', desc: 'Via bot or your Telegram account' },
              { num: '2', title: 'TeleSync syncs', desc: 'Message appears in GHL Conversations' },
              { num: '3', title: 'Agent replies', desc: 'Your team responds from GHL' },
              { num: '4', title: 'Customer gets reply', desc: 'Sent back to Telegram instantly' },
            ].map((item) => (
              <div key={item.num} className="text-center p-3">
                <div className="w-8 h-8 rounded-full bg-telegram/10 text-telegram text-sm font-bold flex items-center justify-center mx-auto mb-2">
                  {item.num}
                </div>
                <div className="text-xs font-medium text-gray-900">{item.title}</div>
                <div className="text-xs text-gray-500 mt-0.5">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

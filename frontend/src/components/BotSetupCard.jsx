import { useState } from 'react';
import { TelegramIcon, AlertCircle, Loader, ChevronDown } from './Icons';
import { api } from '../api';

export default function BotSetupCard({ user, ssoPayload, onConnected, onBack }) {
  const [botToken, setBotToken] = useState('');
  const [tokenVisible, setTokenVisible] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleConnect = async () => {
    if (!botToken.trim()) { setErrorMsg('Please enter your bot token'); return; }
    if (!/^\d+:[A-Za-z0-9_-]{35,}$/.test(botToken.trim())) {
      setErrorMsg("This doesn't look like a valid bot token. Format: 123456789:ABCdef...");
      return;
    }

    setErrorMsg('');
    setConnecting(true);
    try {
      const result = await api.call('POST', `/settings/${user.locationId}/connect`, ssoPayload, {
        botToken: botToken.trim(),
      });
      onConnected(result.bot);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to connect bot.');
      setConnecting(false);
    }
  };

  const steps = [
    { num: '1', title: 'Open Telegram', desc: 'Search for "@BotFather" and start a chat' },
    { num: '2', title: 'Create a new bot', desc: 'Send /newbot and follow the prompts' },
    { num: '3', title: 'Choose a name', desc: 'Give your bot a display name (e.g., "Acme Support")' },
    { num: '4', title: 'Choose a username', desc: 'Pick a unique username ending in "bot"' },
    { num: '5', title: 'Copy the token', desc: 'BotFather will send you a token — paste it below' },
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-7 shadow-sm">
      <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-900 mb-4 transition-colors">
        &#8592; Back
      </button>
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Connect Your Telegram Bot</h2>
      <p className="text-sm text-gray-500 mb-5">
        You'll need a Bot Token from <strong>@BotFather</strong>. If you don't have one, follow the instructions below.
      </p>

      {/* Collapsible instructions */}
      <button
        onClick={() => setShowInstructions(!showInstructions)}
        className="flex items-center justify-between w-full px-3.5 py-2.5 bg-gray-50 rounded-lg text-sm text-gray-700 font-medium hover:bg-gray-100 transition-colors mb-4"
      >
        <span>{showInstructions ? 'Hide' : 'Show'} setup instructions</span>
        <ChevronDown open={showInstructions} />
      </button>

      {showInstructions && (
        <div className="bg-gray-50 rounded-xl p-5 mb-5 border border-gray-100">
          <div className="space-y-3">
            {steps.map((step) => (
              <div key={step.num} className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-telegram text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                  {step.num}
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">{step.title}</div>
                  <div className="text-xs text-gray-500">{step.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-start gap-2 mt-4 pt-3 border-t border-gray-200 text-xs text-gray-600">
            <span>Already have a bot? Message <strong>@BotFather</strong> and send <code className="bg-gray-200 px-1 rounded">/mybots</code>.</span>
          </div>
        </div>
      )}

      {/* Token input */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Bot Token</label>
        <div className="relative">
          <input
            type={tokenVisible ? 'text' : 'password'}
            placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz..."
            value={botToken}
            onChange={(e) => { setBotToken(e.target.value); setErrorMsg(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); }}
            disabled={connecting}
            className={`w-full px-3.5 py-2.5 pr-16 border rounded-lg text-sm outline-none transition-colors focus:ring-2 focus:ring-telegram/20 focus:border-telegram ${errorMsg ? 'border-red-400' : 'border-gray-300'}`}
          />
          <button
            onClick={() => setTokenVisible(!tokenVisible)}
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-500 hover:text-gray-700 px-2 py-1"
          >
            {tokenVisible ? 'Hide' : 'Show'}
          </button>
        </div>
        {errorMsg && (
          <div className="flex items-center gap-1.5 mt-2 text-sm text-red-600">
            <AlertCircle /> <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Connect button */}
      <button
        onClick={handleConnect}
        disabled={connecting}
        className="inline-flex items-center justify-center gap-2 w-full py-3 px-5 bg-telegram text-white rounded-xl text-[15px] font-semibold hover:bg-telegram-dark transition-colors disabled:opacity-60"
      >
        {connecting ? <><Loader /> Validating & connecting...</> : <><TelegramIcon size={18} /> Connect Bot</>}
      </button>
    </div>
  );
}

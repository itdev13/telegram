import { useState } from 'react';
import BotConnectedCard from './BotConnectedCard';
import PhoneConnectedCard from './PhoneConnectedCard';
import BotSetupCard from './BotSetupCard';
import PhoneSetupCard from './PhoneSetupCard';
import { PlusIcon, TelegramIcon, PhoneIcon } from './Icons';

export default function ConnectionDashboard({
  botInfo,
  phoneInfo,
  user,
  ssoPayload,
  onBotDisconnect,
  onPhoneDisconnect,
  onBotConnected,
  onPhoneConnected,
}) {
  const [addingType, setAddingType] = useState(null); // null | 'bot' | 'phone'

  // If adding a new connection, show the setup form
  if (addingType === 'bot') {
    return (
      <BotSetupCard
        user={user}
        ssoPayload={ssoPayload}
        onConnected={(bot) => { onBotConnected(bot); setAddingType(null); }}
        onBack={() => setAddingType(null)}
      />
    );
  }

  if (addingType === 'phone') {
    return (
      <PhoneSetupCard
        user={user}
        ssoPayload={ssoPayload}
        onConnected={(phone) => { onPhoneConnected(phone); setAddingType(null); }}
        onBack={() => setAddingType(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Connected cards */}
      {botInfo && (
        <BotConnectedCard
          botInfo={botInfo}
          user={user}
          ssoPayload={ssoPayload}
          onDisconnect={onBotDisconnect}
        />
      )}
      {phoneInfo && (
        <PhoneConnectedCard
          phoneInfo={phoneInfo}
          user={user}
          ssoPayload={ssoPayload}
          onDisconnect={onPhoneDisconnect}
        />
      )}

      {/* Add connection button */}
      {(!botInfo || !phoneInfo) && (
        <div className="border border-dashed border-gray-300 rounded-2xl p-5 hover:border-telegram/50 transition-colors">
          <div className="flex items-center gap-3 mb-3">
            <PlusIcon className="text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Add another connection</span>
          </div>
          <div className="flex gap-2">
            {!botInfo && (
              <button
                onClick={() => setAddingType('bot')}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-telegram transition-colors"
              >
                <TelegramIcon size={16} /> Add Bot
              </button>
            )}
            {!phoneInfo && (
              <button
                onClick={() => setAddingType('phone')}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-telegram transition-colors"
              >
                <PhoneIcon size={16} className="text-gray-500" /> Add Phone
              </button>
            )}
          </div>
        </div>
      )}

      {/* How it works */}
      <div className="mt-6 pt-6 border-t border-gray-100">
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
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

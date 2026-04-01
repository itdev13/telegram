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
      <div className="mt-6 pt-6 border-t border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">How it works</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: '1', title: 'Customer messages', desc: 'Via bot or your Telegram account' },
            { icon: '2', title: 'TeleSync syncs', desc: 'Message appears in GHL Conversations' },
            { icon: '3', title: 'Agent replies', desc: 'Your team responds from GHL' },
            { icon: '4', title: 'Customer gets reply', desc: 'Sent back to Telegram instantly' },
          ].map((item) => (
            <div key={item.icon} className="text-center p-3">
              <div className="w-8 h-8 rounded-full bg-telegram/10 text-telegram text-sm font-bold flex items-center justify-center mx-auto mb-2">
                {item.icon}
              </div>
              <div className="text-xs font-medium text-gray-900">{item.title}</div>
              <div className="text-xs text-gray-500 mt-0.5">{item.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

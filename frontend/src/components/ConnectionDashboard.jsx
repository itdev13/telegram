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

      {/* Workflow automations hint */}
      <div className="mt-6 pt-6 border-t border-gray-100">
        <div className="flex items-start gap-3 p-4 bg-gradient-to-r from-sky-50 to-white rounded-xl border border-sky-100">
          <div className="text-2xl">⚡</div>
          <div>
            <div className="text-sm font-semibold text-gray-900 mb-1">Workflow Automations Available</div>
            <p className="text-xs text-gray-500 leading-relaxed">
              Use <strong>6 triggers</strong> and <strong>11 actions</strong> in your GHL workflows — auto-reply to messages, send to groups, react with emojis, and more.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

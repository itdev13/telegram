import { useState } from 'react';
import { TelegramIcon, CheckCircle, AlertCircle, Loader, ExternalLink } from './Icons';
import DisconnectModal from './DisconnectModal';
import { api } from '../api';

export default function BotConnectedCard({ botInfo, user, ssoPayload, onDisconnect }) {
  const [testResult, setTestResult] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleTest = async () => {
    setTestResult('testing');
    try {
      const result = await api.call('GET', `/settings/${user.locationId}/status`, ssoPayload);
      setTestResult(result.status === 'connected' ? 'success' : 'failed');
    } catch {
      setTestResult('failed');
    }
    if (testResult !== 'success') {
      setTimeout(() => setTestResult(null), 4000);
    }
  };

  const handleDisconnect = async () => {
    setShowConfirm(false);
    try {
      await api.call('DELETE', `/settings/${user.locationId}/disconnect`, ssoPayload);
    } catch (err) {
      console.error('Disconnect failed:', err);
    }
    onDisconnect();
  };

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2.5 mb-4">
          <CheckCircle />
          <span className="font-semibold text-gray-900 text-[15px]">Telegram Bot</span>
          <span className="ml-auto text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">Active</span>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-0.5">Username</div>
            <div className="text-sm font-medium text-gray-900">@{botInfo.username}</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-0.5">Bot ID</div>
            <div className="text-sm font-medium text-gray-900">{botInfo.id}</div>
          </div>
        </div>

        <div className="flex items-start gap-2 p-3 bg-sky-50 rounded-lg text-sm text-sky-800 mb-4">
          <TelegramIcon size={16} className="mt-0.5 shrink-0" />
          <span>
            Messages sent to <strong>@{botInfo.username}</strong> on Telegram will appear in your GHL Conversations tab.
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleTest}
            disabled={testResult === 'testing'}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-60"
          >
            {testResult === 'testing' ? <><Loader /> Testing...</> :
             testResult === 'success' ? <><CheckCircle /> Webhook Active</> :
             testResult === 'failed' ? <><AlertCircle /> Check Failed</> :
             'Test Connection'}
          </button>
          <button
            onClick={() => window.open(`https://t.me/${botInfo.username}`, '_blank')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            Open in Telegram <ExternalLink />
          </button>
          <button
            onClick={() => setShowConfirm(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors ml-auto"
          >
            Disconnect
          </button>
        </div>
      </div>

      {showConfirm && (
        <DisconnectModal
          title="Disconnect Telegram Bot?"
          message="This will stop syncing messages between Telegram and GoHighLevel for this bot. Your existing conversation history will be preserved."
          onConfirm={handleDisconnect}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}

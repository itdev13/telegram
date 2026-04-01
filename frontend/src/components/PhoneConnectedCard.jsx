import { useState } from 'react';
import { PhoneIcon, CheckCircle, ExternalLink } from './Icons';
import DisconnectModal from './DisconnectModal';
import { api } from '../api';

export default function PhoneConnectedCard({ phoneInfo, user, ssoPayload, onDisconnect }) {
  const [showConfirm, setShowConfirm] = useState(false);

  const maskedPhone = phoneInfo.phoneNumber
    ? phoneInfo.phoneNumber.slice(0, 4) + ' ***-***-' + phoneInfo.phoneNumber.slice(-4)
    : 'Connected';

  const handleDisconnect = async () => {
    setShowConfirm(false);
    try {
      await api.call('DELETE', `/settings/${user.locationId}/phone/disconnect`, ssoPayload);
    } catch (err) {
      console.error('Phone disconnect failed:', err);
    }
    onDisconnect();
  };

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2.5 mb-4">
          <CheckCircle />
          <span className="font-semibold text-gray-900 text-[15px]">Phone Number</span>
          <span className="ml-auto text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">Active</span>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-0.5">Phone</div>
            <div className="text-sm font-medium text-gray-900">{maskedPhone}</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-0.5">Username</div>
            <div className="text-sm font-medium text-gray-900">
              {phoneInfo.telegramUsername ? `@${phoneInfo.telegramUsername}` : 'N/A'}
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-0.5">Name</div>
            <div className="text-sm font-medium text-gray-900">{phoneInfo.displayName || 'N/A'}</div>
          </div>
        </div>

        <div className="flex items-start gap-2 p-3 bg-sky-50 rounded-lg text-sm text-sky-800 mb-4">
          <PhoneIcon size={16} className="mt-0.5 shrink-0 text-sky-600" />
          <span>Private messages sent to your Telegram account will appear in your GHL Conversations tab.</span>
        </div>

        <div className="flex flex-wrap gap-2">
          {phoneInfo.telegramUsername && (
            <button
              onClick={() => window.open(`https://t.me/${phoneInfo.telegramUsername}`, '_blank')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              Open in Telegram <ExternalLink />
            </button>
          )}
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
          title="Disconnect Phone Number?"
          message="This will stop syncing messages between your Telegram account and GoHighLevel for this location."
          onConfirm={handleDisconnect}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}

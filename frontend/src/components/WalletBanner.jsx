import { useEffect, useState } from 'react';
import { api } from '../api';
import { AlertCircle, CheckCircle } from './Icons';

/**
 * Shows a prominent recharge banner when the location's wallet is out of funds.
 * While suspended, no Telegram messages are synced (inbound or outbound) until the
 * wallet is topped up. Re-checks on mount and can be refreshed by the user.
 */
export default function WalletBanner({ user, ssoPayload }) {
  const [wallet, setWallet] = useState(null); // { hasFunds, walletStatus, walletScope, walletMessage }
  const [checking, setChecking] = useState(false);
  const [recheck, setRecheck] = useState(null); // null | 'still-empty' | 'funded'

  const fetchStatus = async (isManual = false) => {
    if (!user?.locationId) return;
    setChecking(true);
    try {
      const qs = `?companyId=${encodeURIComponent(user.companyId || '')}&locationId=${encodeURIComponent(user.locationId)}`;
      const res = await api.call('GET', `/billing/status${qs}`, ssoPayload);
      const data = res.data || null;
      setWallet(data);

      if (isManual && data) {
        const stillSuspended = data.walletStatus === 'insufficient' || data.hasFunds === false;
        setRecheck(stillSuspended ? 'still-empty' : 'funded');
      }
    } catch {
      // If the status check fails, surface it on manual recheck but don't clear the banner.
      if (isManual) setRecheck('still-empty');
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    fetchStatus(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, ssoPayload]);

  if (!wallet) return null;

  const suspended = wallet.walletStatus === 'insufficient' || wallet.hasFunds === false;

  const scopeLabel =
    wallet.walletScope === 'agency'
      ? 'agency wallet'
      : wallet.walletScope === 'location'
        ? 'sub-account wallet'
        : 'wallet';

  // Wallet is funded again — show a brief success confirmation instead of the red banner.
  if (!suspended) {
    if (recheck === 'funded') {
      return (
        <div className="mb-6 flex gap-3 p-5 bg-green-50 border border-green-200 rounded-xl">
          <div className="shrink-0 mt-0.5 text-green-600">
            <CheckCircle />
          </div>
          <div className="flex-1">
            <h3 className="text-[15px] font-semibold text-green-900 mb-1">
              Wallet funded — messaging resumed
            </h3>
            <p className="text-sm text-green-700">
              Your {scopeLabel} has funds again. Incoming and outgoing Telegram messages are syncing
              normally.
            </p>
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="mb-6 flex gap-3 p-5 bg-red-50 border border-red-200 rounded-xl">
      <div className="shrink-0 mt-0.5 text-red-600">
        <AlertCircle />
      </div>
      <div className="flex-1">
        <h3 className="text-[15px] font-semibold text-red-900 mb-1">
          Messaging paused — {scopeLabel} is out of funds
        </h3>
        <p className="text-sm text-red-700 mb-3">
          Your {scopeLabel} has insufficient funds, so incoming and outgoing Telegram messages are
          not being synced right now. Recharge your {scopeLabel} in the CRM to resume messaging
          automatically.
        </p>
        <button
          onClick={() => fetchStatus(true)}
          disabled={checking}
          className="px-4 py-2 text-sm font-medium text-red-700 bg-white border border-red-300 rounded-lg hover:bg-red-50 disabled:opacity-60"
        >
          {checking ? 'Checking…' : "I've recharged — check again"}
        </button>

        {recheck === 'still-empty' && !checking && (
          <p className="mt-3 text-sm font-medium text-red-800">
            Still no funds in your {scopeLabel}. Please recharge in the CRM, then check again.
          </p>
        )}
      </div>
    </div>
  );
}

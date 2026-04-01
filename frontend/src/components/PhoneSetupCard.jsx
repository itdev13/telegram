import { useState } from 'react';
import { AlertCircle, Loader } from './Icons';
import { api } from '../api';

export default function PhoneSetupCard({ user, ssoPayload, onConnected, onBack }) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [twoFaPassword, setTwoFaPassword] = useState('');
  const [step, setStep] = useState('input'); // input | code | 2fa | connecting
  const [errorMsg, setErrorMsg] = useState('');

  const handleSendCode = async () => {
    if (!phoneNumber.trim() || !/^\+[1-9]\d{6,14}$/.test(phoneNumber.trim())) {
      setErrorMsg('Enter a valid phone number (+1234567890)');
      return;
    }
    setErrorMsg('');
    setStep('connecting');
    try {
      await api.call('POST', `/settings/${user.locationId}/phone/send-code`, ssoPayload, {
        phoneNumber: phoneNumber.trim(),
      });
      setStep('code');
    } catch (err) {
      setErrorMsg(err.message || 'Failed to send code');
      setStep('input');
    }
  };

  const handleVerifyCode = async () => {
    if (!phoneCode.trim()) { setErrorMsg('Enter the verification code'); return; }
    setErrorMsg('');
    setStep('connecting');
    try {
      const result = await api.call('POST', `/settings/${user.locationId}/phone/verify-code`, ssoPayload, {
        phoneCode: phoneCode.trim(),
      });
      if (result.data?.require2FA) {
        setStep('2fa');
      } else if (result.data?.connected) {
        onConnected(result.data.user);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Invalid code');
      setStep('code');
    }
  };

  const handleVerify2FA = async () => {
    if (!twoFaPassword.trim()) { setErrorMsg('Enter your 2FA password'); return; }
    setErrorMsg('');
    setStep('connecting');
    try {
      const result = await api.call('POST', `/settings/${user.locationId}/phone/verify-2fa`, ssoPayload, {
        password: twoFaPassword,
      });
      if (result.data?.connected) {
        onConnected(result.data.user);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Incorrect password');
      setStep('2fa');
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-7 shadow-sm">
      <button
        onClick={() => { onBack(); setStep('input'); setErrorMsg(''); }}
        className="text-sm text-gray-500 hover:text-gray-900 mb-4 transition-colors"
      >
        &#8592; Back
      </button>
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Connect Phone Number</h2>

      {step === 'input' && (
        <>
          <p className="text-sm text-gray-500 mb-5">
            Enter your Telegram phone number. We'll send a verification code to your Telegram app.
          </p>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone Number</label>
            <input
              type="tel"
              placeholder="+1234567890"
              value={phoneNumber}
              onChange={(e) => { setPhoneNumber(e.target.value); setErrorMsg(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSendCode(); }}
              className={`w-full px-3.5 py-2.5 border rounded-lg text-sm outline-none transition-colors focus:ring-2 focus:ring-telegram/20 focus:border-telegram ${errorMsg ? 'border-red-400' : 'border-gray-300'}`}
            />
            {errorMsg && <div className="flex items-center gap-1.5 mt-2 text-sm text-red-600"><AlertCircle /><span>{errorMsg}</span></div>}
          </div>
          <button onClick={handleSendCode} className="w-full py-3 px-5 bg-telegram text-white rounded-xl text-[15px] font-semibold hover:bg-telegram-dark transition-colors">
            Send Code
          </button>
        </>
      )}

      {step === 'code' && (
        <>
          <p className="text-sm text-gray-500 mb-5">
            Enter the code sent to your Telegram app for <strong>{phoneNumber}</strong>.
          </p>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Verification Code</label>
            <input
              type="text"
              placeholder="12345"
              value={phoneCode}
              onChange={(e) => { setPhoneCode(e.target.value); setErrorMsg(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleVerifyCode(); }}
              autoFocus
              className={`w-full px-3.5 py-2.5 border rounded-lg text-sm outline-none transition-colors focus:ring-2 focus:ring-telegram/20 focus:border-telegram ${errorMsg ? 'border-red-400' : 'border-gray-300'}`}
            />
            {errorMsg && <div className="flex items-center gap-1.5 mt-2 text-sm text-red-600"><AlertCircle /><span>{errorMsg}</span></div>}
          </div>
          <button onClick={handleVerifyCode} className="w-full py-3 px-5 bg-telegram text-white rounded-xl text-[15px] font-semibold hover:bg-telegram-dark transition-colors">
            Verify Code
          </button>
        </>
      )}

      {step === '2fa' && (
        <>
          <p className="text-sm text-gray-500 mb-5">
            Your account has two-factor authentication. Enter your cloud password.
          </p>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">2FA Password</label>
            <input
              type="password"
              placeholder="Your cloud password"
              value={twoFaPassword}
              onChange={(e) => { setTwoFaPassword(e.target.value); setErrorMsg(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleVerify2FA(); }}
              autoFocus
              className={`w-full px-3.5 py-2.5 border rounded-lg text-sm outline-none transition-colors focus:ring-2 focus:ring-telegram/20 focus:border-telegram ${errorMsg ? 'border-red-400' : 'border-gray-300'}`}
            />
            {errorMsg && <div className="flex items-center gap-1.5 mt-2 text-sm text-red-600"><AlertCircle /><span>{errorMsg}</span></div>}
          </div>
          <button onClick={handleVerify2FA} className="w-full py-3 px-5 bg-telegram text-white rounded-xl text-[15px] font-semibold hover:bg-telegram-dark transition-colors">
            Submit Password
          </button>
        </>
      )}

      {step === 'connecting' && (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <Loader />
          <p className="text-sm font-medium text-gray-700">Connecting...</p>
        </div>
      )}
    </div>
  );
}

import { TelegramIcon } from './Icons';
import { IS_DEV } from '../api';

export default function Header({ botConnected, phoneConnected }) {
  const anyConnected = botConnected || phoneConnected;

  return (
    <>
      {IS_DEV && (
        <div className="flex items-center gap-2 px-3.5 py-2 bg-orange-50 border border-orange-300 rounded-lg text-xs text-orange-800 mb-5">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
          <span><strong>Dev Mode</strong> — SSO is mocked. API calls are simulated.</span>
        </div>
      )}
      <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-sky-50 flex items-center justify-center shrink-0">
            <TelegramIcon size={32} />
          </div>
          <div>
            <h1 className="text-[22px] font-bold text-gray-900 tracking-tight leading-tight">TeleSync</h1>
            <p className="text-sm text-gray-500 mt-0.5">Telegram integration for GoHighLevel</p>
          </div>
        </div>
        {anyConnected && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 text-green-800 text-[13px] font-medium border border-green-200">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            Connected
          </div>
        )}
      </div>
    </>
  );
}

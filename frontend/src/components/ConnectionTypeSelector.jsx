import { TelegramIcon, PhoneIcon } from './Icons';

export default function ConnectionTypeSelector({ onSelectBot, onSelectPhone, showBotOption = true, showPhoneOption = true }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Get Started</h2>
        <p className="text-sm text-gray-500">
          Choose how you'd like to connect Telegram to this location.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {showBotOption && (
          <button
            onClick={onSelectBot}
            className="group relative flex flex-col items-start gap-4 p-6 bg-white border-2 border-gray-100 rounded-2xl hover:border-telegram hover:shadow-lg hover:shadow-telegram/5 transition-all text-left"
          >
            <div className="flex items-center justify-between w-full">
              <div className="w-11 h-11 rounded-xl bg-sky-50 flex items-center justify-center group-hover:bg-sky-100 transition-colors">
                <TelegramIcon size={22} />
              </div>
              <span className="text-xs font-medium text-gray-400 bg-gray-50 px-2.5 py-1 rounded-full group-hover:text-telegram group-hover:bg-sky-50 transition-colors">
                Recommended
              </span>
            </div>
            <div>
              <div className="font-semibold text-gray-900 text-[15px] mb-1">Telegram Bot</div>
              <div className="text-[13px] text-gray-500 leading-relaxed">
                Best for customer support and automated replies. Customers message your business bot.
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-telegram opacity-0 group-hover:opacity-100 transition-opacity">
              Set up in 2 minutes →
            </div>
          </button>
        )}

        {showPhoneOption && (
          <button
            onClick={onSelectPhone}
            className="group relative flex flex-col items-start gap-4 p-6 bg-white border-2 border-gray-100 rounded-2xl hover:border-telegram hover:shadow-lg hover:shadow-telegram/5 transition-all text-left"
          >
            <div className="flex items-center justify-between w-full">
              <div className="w-11 h-11 rounded-xl bg-gray-50 flex items-center justify-center group-hover:bg-sky-50 transition-colors">
                <PhoneIcon size={22} className="text-gray-500 group-hover:text-telegram transition-colors" />
              </div>
              <span className="text-xs font-medium text-gray-400 bg-gray-50 px-2.5 py-1 rounded-full">
                Personal
              </span>
            </div>
            <div>
              <div className="font-semibold text-gray-900 text-[15px] mb-1">Phone Number</div>
              <div className="text-[13px] text-gray-500 leading-relaxed">
                Connect your personal Telegram account. Customers message you directly.
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-telegram opacity-0 group-hover:opacity-100 transition-opacity">
              Connect now →
            </div>
          </button>
        )}
      </div>
    </div>
  );
}

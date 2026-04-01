import { TelegramIcon, PhoneIcon } from './Icons';

export default function ConnectionTypeSelector({ onSelectBot, onSelectPhone, showBotOption = true, showPhoneOption = true }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-7 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Add Connection</h2>
      <p className="text-sm text-gray-500 mb-5">
        Select how you want to connect Telegram to this location.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {showBotOption && (
          <button
            onClick={onSelectBot}
            className="group flex flex-col items-center gap-3 p-5 bg-gray-50 border border-gray-200 rounded-xl hover:border-telegram hover:bg-sky-50 transition-all text-center"
          >
            <div className="w-12 h-12 rounded-full bg-white border border-gray-200 flex items-center justify-center group-hover:border-telegram/30 transition-colors">
              <TelegramIcon size={24} />
            </div>
            <div>
              <div className="font-semibold text-gray-900 text-sm">Telegram Bot</div>
              <div className="text-xs text-gray-500 mt-1 leading-relaxed">
                Create a bot via @BotFather. Customers message the bot.
              </div>
            </div>
          </button>
        )}
        {showPhoneOption && (
          <button
            onClick={onSelectPhone}
            className="group flex flex-col items-center gap-3 p-5 bg-gray-50 border border-gray-200 rounded-xl hover:border-telegram hover:bg-sky-50 transition-all text-center"
          >
            <div className="w-12 h-12 rounded-full bg-white border border-gray-200 flex items-center justify-center group-hover:border-telegram/30 transition-colors">
              <PhoneIcon size={24} className="text-gray-500" />
            </div>
            <div>
              <div className="font-semibold text-gray-900 text-sm">Phone Number</div>
              <div className="text-xs text-gray-500 mt-1 leading-relaxed">
                Connect your Telegram account. Customers message you directly.
              </div>
            </div>
          </button>
        )}
      </div>
    </div>
  );
}

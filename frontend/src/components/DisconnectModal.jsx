export default function DisconnectModal({ title, message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
        <h3 className="text-base font-semibold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-600 leading-relaxed mb-5">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
          >
            Yes, Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}

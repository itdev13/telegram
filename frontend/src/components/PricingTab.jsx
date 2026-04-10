const PRICING_DATA = [
  {
    category: 'Messaging',
    items: [
      { action: 'Inbound message (Telegram → GHL)', price: 0.01, unit: 'per message' },
      { action: 'Outbound message (GHL → Telegram)', price: 0.01, unit: 'per message' },
    ],
  },
  {
    category: 'Workflow Actions',
    items: [
      { action: 'Send message to user', price: 0.02, unit: 'per execution' },
      { action: 'Send message with buttons', price: 0.02, unit: 'per execution' },
      { action: 'Send via phone account', price: 0.02, unit: 'per execution' },
      { action: 'Send message to group', price: 0.02, unit: 'per execution' },
      { action: 'Send file to group', price: 0.02, unit: 'per execution' },
      { action: 'Generate invite link', price: 0.02, unit: 'per execution' },
      { action: 'Edit group permissions', price: 0.03, unit: 'per execution' },
    ],
  },
  {
    category: 'Free Actions',
    items: [
      { action: 'React to message', price: 0, unit: 'free' },
      { action: 'Pin message', price: 0, unit: 'free' },
      { action: 'Edit message', price: 0, unit: 'free' },
      { action: 'Delete message', price: 0, unit: 'free' },
      { action: 'Forward message', price: 0, unit: 'free' },
    ],
  },
];

export default function PricingTab() {
  return (
    <div className="space-y-5">
      {/* How billing works */}
      <div className="bg-gradient-to-r from-sky-50 to-indigo-50 border border-sky-200 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">How Billing Works</h3>
        <div className="space-y-2 text-xs text-gray-600 leading-relaxed">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 w-5 h-5 rounded-full bg-sky-100 text-sky-700 text-[10px] font-bold flex items-center justify-center shrink-0">1</span>
            <span>Each message synced and workflow action executed is a <strong>metered usage event</strong>.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 w-5 h-5 rounded-full bg-sky-100 text-sky-700 text-[10px] font-bold flex items-center justify-center shrink-0">2</span>
            <span>Charges are deducted from your <strong>GHL Marketplace Wallet</strong> in real-time (pay-as-you-go).</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 w-5 h-5 rounded-full bg-sky-100 text-sky-700 text-[10px] font-bold flex items-center justify-center shrink-0">3</span>
            <span>No monthly subscription — you only pay for what you use. Top up your wallet anytime from the GHL Marketplace.</span>
          </div>
        </div>
      </div>

      {/* Pricing tables */}
      {PRICING_DATA.map((group) => (
        <div key={group.category} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{group.category}</h4>
          </div>
          <div className="divide-y divide-gray-100">
            {group.items.map((item) => (
              <div key={item.action} className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-gray-700">{item.action}</span>
                {item.price === 0 ? (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                    Free
                  </span>
                ) : (
                  <span className="text-sm font-semibold text-gray-900">
                    ${item.price.toFixed(2)} <span className="text-xs font-normal text-gray-400">{item.unit}</span>
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Cost example */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Cost Example</h4>
        <div className="bg-gray-50 rounded-xl p-4">
          <div className="space-y-1.5 text-xs text-gray-600">
            <div className="flex justify-between"><span>1,000 inbound messages</span><span className="font-medium text-gray-900">$10.00</span></div>
            <div className="flex justify-between"><span>1,000 outbound messages</span><span className="font-medium text-gray-900">$10.00</span></div>
            <div className="flex justify-between"><span>200 workflow actions</span><span className="font-medium text-gray-900">$4.00</span></div>
            <div className="border-t border-gray-200 pt-1.5 flex justify-between font-semibold text-sm text-gray-900">
              <span>Estimated monthly total</span>
              <span>$24.00</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

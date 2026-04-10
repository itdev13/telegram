const TRIGGERS = [
  { name: 'New Message Received', summary: 'Runs when any Telegram message arrives in your bot or phone account.' },
  { name: 'New Subscriber', summary: 'Runs when a brand-new contact messages you for the first time.' },
  { name: 'Bot Command', summary: 'Runs when a user sends /start, /help, or any custom command.' },
  { name: 'Media Received', summary: 'Runs when a user sends a photo, document, or file.' },
  { name: 'Contact Reactivated', summary: 'Runs when a contact replies after 7+ days of silence.' },
  { name: 'Message Delivery Failed', summary: 'Runs when an outbound message fails to deliver.' },
];

const ACTIONS = [
  { name: 'Send Message', summary: 'Send a text message to a contact via bot.', price: '$0.02' },
  { name: 'Send Message with Buttons', summary: 'Send a message with inline keyboard buttons.', price: '$0.02' },
  { name: 'Send via Phone', summary: 'Send using your connected phone number instead of the bot.', price: '$0.02' },
  { name: 'Send to Group', summary: 'Send a text or file message to a Telegram group.', price: '$0.02' },
  { name: 'Forward Message', summary: 'Forward a message to another chat.', price: 'Free' },
  { name: 'React to Message', summary: 'Add an emoji reaction to a message.', price: '$0.01' },
  { name: 'Pin Message', summary: 'Pin a message in a chat or group.', price: 'Free' },
  { name: 'Edit Message', summary: 'Edit the text of a previously sent message.', price: 'Free' },
  { name: 'Delete Message', summary: 'Delete a message from a chat.', price: 'Free' },
  { name: 'Generate Invite Link', summary: 'Create a new invite link for a group or channel.', price: '$0.02' },
  { name: 'Edit Group Permissions', summary: 'Update default group permissions (send messages, media, etc).', price: '$0.03' },
];

export default function WorkflowsTab() {
  return (
    <div className="space-y-5">
      {/* Triggers */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          <h3 className="text-sm font-semibold text-gray-900">Triggers</h3>
          <span className="text-xs text-gray-400">({TRIGGERS.length})</span>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm divide-y divide-gray-100">
          {TRIGGERS.map((t) => (
            <div key={t.name} className="flex items-center gap-3 px-5 py-3">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900">{t.name}</div>
                <div className="text-xs text-gray-500">{t.summary}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full bg-sky-400" />
          <h3 className="text-sm font-semibold text-gray-900">Actions</h3>
          <span className="text-xs text-gray-400">({ACTIONS.length})</span>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm divide-y divide-gray-100">
          {ACTIONS.map((a) => (
            <div key={a.name} className="flex items-center gap-3 px-5 py-3">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900">{a.name}</div>
                <div className="text-xs text-gray-500">{a.summary}</div>
              </div>
              <span className={`shrink-0 inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${a.price === 'Free' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
                {a.price === 'Free' ? 'Free' : `${a.price}/exec`}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

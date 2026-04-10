const TRIGGERS = [
  { name: 'New Message Received', summary: 'Fires when a contact messages your bot.', icon: '💬', color: 'bg-blue-50' },
  { name: 'New Subscriber', summary: 'First-time contact messages your bot.', icon: '👤', color: 'bg-purple-50' },
  { name: 'Bot Started (/start)', summary: 'New user starts your Telegram bot.', icon: '🤖', color: 'bg-red-50' },
  { name: 'Media Received', summary: 'Photo, video, or document sent to bot.', icon: '📎', color: 'bg-amber-50' },
  { name: 'Contact Reactivated', summary: 'Contact replies after 7+ days of silence.', icon: '🔄', color: 'bg-green-50' },
  { name: 'Message Failed', summary: 'Outbound message fails to deliver.', icon: '⚠️', color: 'bg-red-50' },
];

const ACTIONS = [
  { name: 'Send Telegram Message', summary: 'Auto-reply from GHL workflows.', icon: '📤', color: 'bg-blue-50', price: '$0.02' },
  { name: 'Send with Buttons', summary: 'Message with inline keyboard buttons.', icon: '🔘', color: 'bg-indigo-50', price: '$0.02' },
  { name: 'Send via Phone', summary: 'Send using your phone number.', icon: '📱', color: 'bg-teal-50', price: '$0.02' },
  { name: 'Send to Group', summary: 'Broadcast to Telegram groups.', icon: '👥', color: 'bg-sky-50', price: '$0.02' },
  { name: 'React with Emoji', summary: 'Add emoji reactions to messages.', icon: '😀', color: 'bg-amber-50', price: '$0.01' },
  { name: 'Forward Message', summary: 'Forward a message to another chat.', icon: '↗️', color: 'bg-gray-50', price: 'Free' },
  { name: 'Pin Message', summary: 'Pin a message in a chat or group.', icon: '📌', color: 'bg-orange-50', price: 'Free' },
  { name: 'Edit Message', summary: 'Edit a previously sent message.', icon: '✏️', color: 'bg-yellow-50', price: 'Free' },
  { name: 'Delete Message', summary: 'Delete a message from a chat.', icon: '🗑️', color: 'bg-red-50', price: 'Free' },
  { name: 'Generate Invite Link', summary: 'Create invite link for group or channel.', icon: '🔗', color: 'bg-violet-50', price: '$0.02' },
  { name: 'Edit Group Permissions', summary: 'Update default group permissions.', icon: '🛡️', color: 'bg-emerald-50', price: '$0.03' },
];

export default function WorkflowsTab() {
  return (
    <div className="space-y-6">
      {/* Triggers */}
      <div>
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Triggers</div>
        <div className="space-y-2">
          {TRIGGERS.map((t) => (
            <div key={t.name} className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
              <div className={`w-10 h-10 rounded-xl ${t.color} flex items-center justify-center text-lg shrink-0`}>
                {t.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-900">{t.name}</div>
                <div className="text-xs text-gray-400">{t.summary}</div>
              </div>
              <span className="shrink-0 px-3 py-1 rounded-full text-xs font-bold text-green-600 bg-green-50 border border-green-200">
                ON
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div>
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Actions</div>
        <div className="space-y-2">
          {ACTIONS.map((a) => (
            <div key={a.name} className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
              <div className={`w-10 h-10 rounded-xl ${a.color} flex items-center justify-center text-lg shrink-0`}>
                {a.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-900">{a.name}</div>
                <div className="text-xs text-gray-400">{a.summary}</div>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                {a.price !== 'Free' && (
                  <span className="text-[10px] text-gray-400">{a.price}</span>
                )}
                <span className="px-3 py-1 rounded-full text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200">
                  ACTION
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

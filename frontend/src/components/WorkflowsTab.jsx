const TRIGGERS = [
  {
    name: 'New Message Received',
    key: 'telegram_message_received',
    description: 'Fires when a Telegram user sends any message to your bot or phone account.',
    outputs: ['Contact ID', 'Message Text', 'Message Type', 'Chat ID', 'Username'],
  },
  {
    name: 'New Subscriber',
    key: 'new_telegram_contact',
    description: 'Fires when a brand-new contact messages you for the first time.',
    outputs: ['Contact ID', 'First Name', 'Username', 'Chat ID'],
  },
  {
    name: 'Bot Command',
    key: 'telegram_bot_command',
    description: 'Fires when a user sends a command like /start, /help, or any custom /command.',
    outputs: ['Contact ID', 'Command', 'Message Text', 'Username'],
  },
  {
    name: 'Media Received',
    key: 'telegram_media_received',
    description: 'Fires when a user sends a photo, document, or file.',
    outputs: ['Contact ID', 'Media Type', 'Media URL', 'Caption'],
  },
  {
    name: 'Contact Reactivated',
    key: 'telegram_contact_reactivated',
    description: 'Fires when a contact messages after 7+ days of silence.',
    outputs: ['Contact ID', 'Message Text', 'Username', 'Timestamp'],
  },
  {
    name: 'Message Delivery Failed',
    key: 'telegram_message_failed',
    description: 'Fires when an outbound message fails to deliver on Telegram.',
    outputs: ['Contact ID', 'Error Message', 'Message Text'],
  },
];

const ACTIONS = [
  {
    name: 'Send Message',
    key: 'send-message',
    description: 'Send a text message to a contact via bot.',
    price: '$0.02',
    inputs: ['Contact ID', 'Message Text'],
  },
  {
    name: 'Send Message with Buttons',
    key: 'send-buttons',
    description: 'Send a message with inline keyboard buttons for interactive responses.',
    price: '$0.02',
    inputs: ['Contact ID', 'Message Text', 'Buttons (JSON)'],
  },
  {
    name: 'Send via Phone',
    key: 'send-phone-message',
    description: 'Send a message using your connected phone number instead of the bot.',
    price: '$0.02',
    inputs: ['Contact ID', 'Message Text'],
  },
  {
    name: 'Send to Group',
    key: 'send-to-group',
    description: 'Send a text or file message to a Telegram group.',
    price: '$0.02',
    inputs: ['Group ID', 'Message Text', 'File URL (optional)'],
  },
  {
    name: 'Forward Message',
    key: 'forward-message',
    description: 'Forward a specific message to another chat.',
    price: 'Free',
    inputs: ['Source Chat ID', 'Message ID', 'Target Chat ID'],
  },
  {
    name: 'React to Message',
    key: 'send-reaction',
    description: 'Add an emoji reaction to a message.',
    price: 'Free',
    inputs: ['Chat ID', 'Message ID', 'Emoji'],
  },
  {
    name: 'Pin Message',
    key: 'pin-message',
    description: 'Pin a message in a chat or group.',
    price: 'Free',
    inputs: ['Chat ID', 'Message ID'],
  },
  {
    name: 'Edit Message',
    key: 'edit-message',
    description: 'Edit the text of a previously sent message.',
    price: 'Free',
    inputs: ['Chat ID', 'Message ID', 'New Text'],
  },
  {
    name: 'Delete Message',
    key: 'delete-message',
    description: 'Delete a message from a chat.',
    price: 'Free',
    inputs: ['Chat ID', 'Message ID'],
  },
  {
    name: 'Generate Invite Link',
    key: 'generate-invite-link',
    description: 'Create a new invite link for a group or channel.',
    price: '$0.02',
    inputs: ['Chat ID', 'Expire Date (optional)', 'Member Limit (optional)'],
  },
  {
    name: 'Edit Group Permissions',
    key: 'edit-group-permissions',
    description: 'Update the default permissions for a group (send messages, media, etc).',
    price: '$0.03',
    inputs: ['Group ID', 'Permissions (JSON)'],
  },
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
        <div className="space-y-2">
          {TRIGGERS.map((t) => (
            <div key={t.key} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:border-green-300 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                    <h4 className="text-sm font-semibold text-gray-900">{t.name}</h4>
                  </div>
                  <p className="text-xs text-gray-500 mb-2 ml-3.5">{t.description}</p>
                  <div className="ml-3.5 flex flex-wrap gap-1.5">
                    {t.outputs.map((o) => (
                      <span key={o} className="inline-flex px-2 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-700 border border-green-100">
                        {o}
                      </span>
                    ))}
                  </div>
                </div>
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
        <div className="space-y-2">
          {ACTIONS.map((a) => (
            <div key={a.key} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:border-sky-300 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
                    <h4 className="text-sm font-semibold text-gray-900">{a.name}</h4>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${a.price === 'Free' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
                      {a.price === 'Free' ? 'Free' : `${a.price}/exec`}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mb-2 ml-3.5">{a.description}</p>
                  <div className="ml-3.5 flex flex-wrap gap-1.5">
                    {a.inputs.map((inp) => (
                      <span key={inp} className="inline-flex px-2 py-0.5 rounded text-[10px] font-medium bg-sky-50 text-sky-700 border border-sky-100">
                        {inp}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

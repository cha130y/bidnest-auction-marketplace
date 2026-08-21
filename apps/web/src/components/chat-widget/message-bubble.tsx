import { ChatMessage } from '@/lib/api/support-chat';

export function MessageBubble({
  message,
}: {
  message: Pick<ChatMessage, 'role' | 'body'>;
}) {
  const isUser = message.role === 'USER';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
          isUser ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'
        }`}
      >
        {message.body}
      </div>
    </div>
  );
}

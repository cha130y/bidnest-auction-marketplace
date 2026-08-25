import { ChatMessage } from '@/lib/api/support-chat';
import { MessageFormatter } from '@/components/chat-widget/message-formatter';
import { cn } from '@/lib/utils';

export function MessageBubble({
  message,
}: {
  message: Pick<ChatMessage, 'role' | 'body'>;
}) {
  const isUser = message.role === 'USER';

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-r3 px-4 py-2.5 text-sm leading-relaxed',
          isUser ? 'bg-amber-500 text-ink' : 'bg-n-100 text-n-700'
        )}
      >
        {isUser ? message.body : <MessageFormatter text={message.body} />}
      </div>
    </div>
  );
}

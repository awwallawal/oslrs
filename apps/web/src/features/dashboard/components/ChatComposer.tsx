import { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';

interface ChatComposerProps {
  onSend: (content: string) => void;
  isSending: boolean;
  placeholder?: string;
  maxLength?: number;
}

export default function ChatComposer({
  onSend,
  isSending,
  placeholder = 'Type a message...',
  maxLength = 2000,
}: ChatComposerProps) {
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSend = content.trim().length > 0 && content.length <= maxLength && !isSending;

  const handleSend = () => {
    if (!canSend) return;
    onSend(content.trim());
    setContent('');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [content]);

  return (
    <div className="border-t bg-white p-3">
      <div className="flex items-end gap-2">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            aria-label="Message input"
            maxLength={maxLength}
            disabled={isSending}
          />
          {content.length > 1800 && (
            <span
              className={`absolute bottom-1 right-2 text-xs ${
                content.length > maxLength ? 'text-red-500' : 'text-gray-400'
              }`}
            >
              {content.length}/{maxLength}
            </span>
          )}
        </div>
        <button
          onClick={handleSend}
          disabled={!canSend}
          className="flex-shrink-0 p-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

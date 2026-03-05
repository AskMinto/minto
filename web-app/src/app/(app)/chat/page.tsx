"use client";

import { useChat } from "@/hooks/use-chat";
import { WelcomeScreen } from "@/components/chat/welcome-screen";
import { MessageList } from "@/components/chat/message-list";
import { ChatInput } from "@/components/chat/chat-input";
import { Spinner } from "@/components/ui/spinner";

export default function ChatPage() {
  const { messages, input, setInput, sendMessage, sending, loading, loadOlder, loadingMore, hasMore } =
    useChat();

  const handleSend = () => sendMessage(input);
  const handleChipSend = (text: string) => sendMessage(text);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner size={28} />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {messages.length === 0 ? (
        <>
          <WelcomeScreen onSend={handleChipSend} />
          <ChatInput
            value={input}
            onChange={setInput}
            onSend={handleSend}
            disabled={sending}
          />
        </>
      ) : (
        <>
          <MessageList
            messages={messages}
            sending={sending}
            onLoadOlder={loadOlder}
            loadingMore={loadingMore}
            hasMore={hasMore}
          />
          <ChatInput
            value={input}
            onChange={setInput}
            onSend={handleSend}
            disabled={sending}
          />
        </>
      )}
    </div>
  );
}

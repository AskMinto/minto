"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Image from "next/image";

interface Props {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

export function MessageBubble({ role, content, isStreaming }: Props) {
  if (role === "user") {
    return (
      <div className="flex justify-end mb-6">
        <div className="bg-white/90 rounded-3xl rounded-br-md px-5 py-4 max-w-[75%] shadow-sm">
          <p className="text-minto-text text-[15px] leading-relaxed whitespace-pre-wrap">
            {content}
          </p>
        </div>
      </div>
    );
  }

  // Assistant
  return (
    <div className="flex gap-3 mb-6">
      <div className="shrink-0 w-8 h-8 rounded-full glass-card flex items-center justify-center mt-1">
        <Image src="/minto.png" alt="Minto" width={20} height={20} />
      </div>
      <div className="flex-1 min-w-0 max-w-[85%]">
        {!content && isStreaming ? (
          <p className="text-minto-text-muted text-sm italic animate-pulse">
            Thinking...
          </p>
        ) : (
          <div className="chat-markdown text-minto-text text-[15px] leading-relaxed">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ children, href }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                ),
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

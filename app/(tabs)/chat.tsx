import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform, Linking } from 'react-native';
import { Send, MessageCircle, TrendingUp, Newspaper } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { apiGet, apiPost } from '../../lib/api';
import { useFocusEffect } from '@react-navigation/native';

function TickerCard({ data, onPress }: { data: any; onPress?: () => void }) {
  const isStock = !!data.symbol;
  const label = isStock ? data.symbol : data.scheme_name || `Scheme ${data.scheme_code}`;
  const value = isStock ? `₹${data.price?.toFixed(2) ?? '—'}` : `NAV ₹${data.nav?.toFixed(4) ?? '—'}`;
  const sub = isStock
    ? data.previous_close ? `Prev: ₹${data.previous_close.toFixed(2)}` : ''
    : data.fund_house || '';

  return (
    <Pressable style={styles.widgetCard} onPress={onPress}>
      <View style={styles.widgetIconBox}>
        <TrendingUp color="#a2b082" size={16} />
      </View>
      <View style={styles.widgetInfo}>
        <Text style={styles.widgetLabel} numberOfLines={1}>{label}</Text>
        <Text style={styles.widgetSub} numberOfLines={1}>{sub}</Text>
      </View>
      <Text style={styles.widgetValue}>{value}</Text>
    </Pressable>
  );
}

function NewsCard({ data }: { data: any }) {
  const items = data.items || [];
  if (!items.length) return null;

  return (
    <View style={styles.newsWidget}>
      <View style={styles.newsWidgetHeader}>
        <Newspaper color="#d1b07c" size={14} />
        <Text style={styles.newsWidgetTitle}>News: {data.query || ''}</Text>
      </View>
      {items.slice(0, 3).map((item: any, i: number) => (
        <Pressable
          key={`news-${i}`}
          style={styles.newsWidgetRow}
          onPress={() => item.link && Linking.openURL(item.link)}
        >
          <Text style={styles.newsWidgetItemTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.newsWidgetMeta}>{item.publisher || ''}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function ChatScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadMessages = async () => {
    try {
      setLoading(true);
      const data = await apiGet<{ messages: any[] }>('/chat/messages');
      setMessages(data.messages || []);
    } catch {
      // Thread will be created on first message
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMessages();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadMessages();
    }, [])
  );

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const content = input.trim();
    setInput('');
    setSending(true);
    setMessages((prev) => [...prev, { role: 'user', content }]);
    try {
      const response = await apiPost<{ reply: string; widgets?: any[] }>('/chat/message', { content });
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: response.reply,
        metadata: response.widgets?.length ? { widgets: response.widgets } : {},
      }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Something went wrong. Please try again.' },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Minto Chat</Text>
      </View>

      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerText}>Informational only. No buy/sell recommendations.</Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.chatContent}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {loading && messages.length === 0 && (
            <Text style={styles.loadingText}>Loading...</Text>
          )}

          {!loading && messages.length === 0 && (
            <View style={styles.emptyState}>
              <MessageCircle color="#a2b082" size={32} />
              <Text style={styles.emptyTitle}>Ask Minto anything</Text>
              <Text style={styles.emptyText}>
                Ask about your portfolio, market concepts, risk, or how your holdings are performing.
              </Text>
            </View>
          )}

          {messages.map((message, index) => {
            const widgets = message.metadata?.widgets || [];
            return (
              <View key={`${message.role}-${index}`}>
                <View style={message.role === 'user' ? styles.messageRowRight : styles.messageRowLeft}>
                  <View style={message.role === 'user' ? styles.userBubble : styles.botBubble}>
                    <Text style={message.role === 'user' ? styles.userText : styles.botText}>
                      {message.content}
                    </Text>
                  </View>
                </View>
                {message.role === 'assistant' && widgets.length > 0 && (
                  <View style={styles.widgetsContainer}>
                    {widgets.map((widget: any, wi: number) => {
                      if (widget.type === 'ticker_card') {
                        return (
                          <TickerCard
                            key={`widget-${wi}`}
                            data={widget.data}
                            onPress={() => {
                              if (widget.data.scheme_code) {
                                router.push(`/instrument/mf/${widget.data.scheme_code}`);
                              } else if (widget.data.symbol) {
                                router.push(`/instrument/${widget.data.symbol}`);
                              }
                            }}
                          />
                        );
                      }
                      if (widget.type === 'news_card') {
                        return <NewsCard key={`widget-${wi}`} data={widget.data} />;
                      }
                      return null;
                    })}
                  </View>
                )}
              </View>
            );
          })}

          {sending && (
            <View style={styles.messageRowLeft}>
              <View style={styles.botBubble}>
                <Text style={styles.typingText}>Thinking...</Text>
              </View>
            </View>
          )}
        </ScrollView>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            placeholder="Ask about your portfolio..."
            placeholderTextColor="#777"
            value={input}
            onChangeText={setInput}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            editable={!sending}
          />
          <Pressable style={[styles.sendButton, sending && styles.sendButtonDisabled]} onPress={handleSend} disabled={sending}>
            <Send color="#000" size={20} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1C211E',
  },
  flex: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  disclaimer: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 20,
    padding: 10,
    borderRadius: 12,
    marginBottom: 6,
  },
  disclaimerText: {
    color: '#a2b082',
    fontSize: 11,
    textAlign: 'center',
  },
  chatContent: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    flexGrow: 1,
  },
  loadingText: {
    color: '#a2b082',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 20,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 60,
    paddingHorizontal: 30,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  messageRowRight: {
    alignItems: 'flex-end',
    marginBottom: 14,
  },
  messageRowLeft: {
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  userBubble: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxWidth: '80%',
  },
  userText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
  },
  botBubble: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    maxWidth: '85%',
  },
  botText: {
    color: '#333',
    fontSize: 14,
    lineHeight: 20,
  },
  typingText: {
    color: '#888',
    fontSize: 13,
    fontStyle: 'italic',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  textInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 14,
    marginRight: 12,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#a2b082',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  widgetsContainer: {
    marginBottom: 14,
    gap: 8,
  },
  widgetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 12,
    gap: 10,
  },
  widgetIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(162,176,130,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  widgetInfo: {
    flex: 1,
  },
  widgetLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  widgetSub: {
    color: '#888',
    fontSize: 11,
    marginTop: 2,
  },
  widgetValue: {
    color: '#a2b082',
    fontSize: 14,
    fontWeight: '700',
  },
  newsWidget: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 12,
  },
  newsWidgetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  newsWidgetTitle: {
    color: '#d1b07c',
    fontSize: 12,
    fontWeight: '600',
  },
  newsWidgetRow: {
    marginBottom: 8,
  },
  newsWidgetItemTitle: {
    color: '#fff',
    fontSize: 12,
  },
  newsWidgetMeta: {
    color: '#888',
    fontSize: 10,
    marginTop: 2,
  },
});

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { Send, TrendingUp, Newspaper } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { apiGet, apiPost } from '../../lib/api';
import { useFocusEffect } from '@react-navigation/native';
import AnimatedGradient from '../../components/AnimatedGradient';
import BottomSheet from '../../components/BottomSheet';
import { DashboardContent } from './dashboard';

/* ─── Widget cards (restyled for light theme) ─── */

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
        <Newspaper color="#8a7450" size={14} />
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

/* ─── Main screen ─── */

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
    <View style={styles.container}>
      <AnimatedGradient />

      <SafeAreaView style={styles.flex}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={90}
        >
          {/* Greeting */}
          <View style={styles.greetingWrap}>
            <Text style={styles.greetingText}>Hey you</Text>
            <Text style={styles.disclaimerText}>Informational only · no buy/sell advice</Text>
          </View>

          {/* Messages */}
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.chatContent}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            keyboardShouldPersistTaps="handled"
          >
            {loading && messages.length === 0 && (
              <Text style={styles.loadingText}>Loading...</Text>
            )}

            {!loading && messages.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>Ask Minto anything</Text>
                <Text style={styles.emptyText}>
                  Your portfolio, market concepts, risk,{'\n'}or how your holdings are doing.
                </Text>
              </View>
            )}

            {messages.map((message, index) => {
              const widgets = message.metadata?.widgets || [];
              return (
                <View key={`${message.role}-${index}`}>
                  {message.role === 'user' ? (
                    <View style={styles.messageRowRight}>
                      <View style={styles.userBubble}>
                        <Text style={styles.userText}>{message.content}</Text>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.messageRowLeft}>
                      <Text style={styles.botText}>{message.content}</Text>
                    </View>
                  )}
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
                <Text style={styles.typingText}>Thinking...</Text>
              </View>
            )}
          </ScrollView>

          {/* Input bar */}
          <View style={styles.inputContainer}>
            <View style={styles.inputPill}>
              <TextInput
                style={styles.textInput}
                placeholder="Ask me anything..."
                placeholderTextColor="#999"
                value={input}
                onChangeText={setInput}
                onSubmitEditing={handleSend}
                returnKeyType="send"
                editable={!sending}
              />
              <Pressable
                style={[styles.sendButton, sending && styles.sendButtonDisabled]}
                onPress={handleSend}
                disabled={sending}
              >
                <Send color="#fff" size={18} />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>

        {/* Bottom sheet with dashboard */}
        <BottomSheet>
          <DashboardContent />
        </BottomSheet>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },

  /* Greeting */
  greetingWrap: {
    paddingHorizontal: 28,
    paddingTop: 16,
    paddingBottom: 4,
  },
  greetingText: {
    color: '#3a3a3a',
    fontSize: 40,
    fontWeight: '300',
    letterSpacing: -0.5,
  },
  disclaimerText: {
    color: '#999',
    fontSize: 11,
    marginTop: 6,
  },

  /* Messages */
  chatContent: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 16,
    flexGrow: 1,
  },
  loadingText: {
    color: '#a2b082',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 24,
  },
  emptyState: {
    marginTop: 48,
    paddingHorizontal: 8,
  },
  emptyTitle: {
    color: '#3a3a3a',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyText: {
    color: '#888',
    fontSize: 14,
    lineHeight: 22,
  },
  messageRowRight: {
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  messageRowLeft: {
    marginBottom: 16,
    maxWidth: '88%',
  },
  userBubble: {
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 12,
    maxWidth: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  userText: {
    color: '#333',
    fontSize: 15,
    lineHeight: 22,
  },
  botText: {
    color: '#333',
    fontSize: 15,
    lineHeight: 24,
  },
  typingText: {
    color: '#999',
    fontSize: 14,
    fontStyle: 'italic',
  },

  /* Input */
  inputContainer: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 8,
  },
  inputPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 28,
    paddingLeft: 20,
    paddingRight: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: '#333',
    paddingVertical: 14,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#a2b082',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },

  /* Widgets – light theme */
  widgetsContainer: {
    marginBottom: 14,
    gap: 8,
  },
  widgetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
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
    color: '#333',
    fontSize: 13,
    fontWeight: '600',
  },
  widgetSub: {
    color: '#999',
    fontSize: 11,
    marginTop: 2,
  },
  widgetValue: {
    color: '#5c7c5c',
    fontSize: 14,
    fontWeight: '700',
  },
  newsWidget: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  newsWidgetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  newsWidgetTitle: {
    color: '#8a7450',
    fontSize: 12,
    fontWeight: '600',
  },
  newsWidgetRow: {
    marginBottom: 8,
  },
  newsWidgetItemTitle: {
    color: '#333',
    fontSize: 12,
  },
  newsWidgetMeta: {
    color: '#999',
    fontSize: 10,
    marginTop: 2,
  },
});

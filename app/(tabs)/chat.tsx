import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform, Linking, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Send, MessageCircle, TrendingUp, Newspaper, Plus, X, ExternalLink } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { apiGet, apiStream, SSEEvent } from '../../lib/api';
import { useFocusEffect } from '@react-navigation/native';

function PriceSummaryWidget({ data, onPress }: { data: any; onPress: () => void }) {
  const items = data.items || [];
  if (!items.length) return null;
  const first = items[0];
  const isEquity = first.type === 'equity';
  const label = isEquity ? first.symbol : first.scheme_name || 'Mutual Fund';
  const value = isEquity ? `₹${first.price?.toFixed(2)}` : `NAV ₹${first.nav?.toFixed(4)}`;
  const extra = items.length - 1;

  return (
    <Pressable style={styles.widgetCard} onPress={onPress}>
      <View style={styles.widgetIconBox}>
        <TrendingUp color="#a2b082" size={16} />
      </View>
      <View style={styles.widgetInfo}>
        <Text style={styles.widgetLabel} numberOfLines={1}>{label}</Text>
        <Text style={styles.widgetSub} numberOfLines={1}>{value}</Text>
      </View>
      {extra > 0 && (
        <View style={styles.badgeCircle}>
          <Plus color="#fff" size={12} />
          <Text style={styles.badgeText}>{extra}</Text>
        </View>
      )}
    </Pressable>
  );
}

function NewsSummaryWidget({ data, onPress }: { data: any; onPress: () => void }) {
  const items = data.items || [];
  if (!items.length) return null;
  const first = items[0];
  const extra = items.length - 1;

  return (
    <Pressable style={styles.widgetCard} onPress={onPress}>
      <View style={[styles.widgetIconBox, { backgroundColor: 'rgba(209,176,124,0.15)' }]}>
        <Newspaper color="#d1b07c" size={16} />
      </View>
      <View style={styles.widgetInfo}>
        <Text style={styles.widgetLabel} numberOfLines={1}>{first.title}</Text>
        <Text style={styles.widgetSub} numberOfLines={1}>{first.publisher || 'News'}</Text>
      </View>
      {extra > 0 && (
        <View style={[styles.badgeCircle, { backgroundColor: 'rgba(209,176,124,0.25)' }]}>
          <Plus color="#d1b07c" size={12} />
          <Text style={[styles.badgeText, { color: '#d1b07c' }]}>{extra}</Text>
        </View>
      )}
    </Pressable>
  );
}

function PriceModal({ visible, items, onClose }: { visible: boolean; items: any[]; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={() => {}}>
          <View style={styles.modalHandle} />
          <Pressable style={styles.modalCloseBtn} onPress={onClose}>
            <X color="#888" size={20} />
          </Pressable>
          <Text style={styles.modalTitle}>Price Lookups</Text>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
            {items.map((item: any, i: number) => {
              const isEquity = item.type === 'equity';
              const label = isEquity ? item.symbol : item.scheme_name || 'Mutual Fund';
              const value = isEquity ? `₹${item.price?.toFixed(2)}` : `NAV ₹${item.nav?.toFixed(4)}`;
              const sub = isEquity ? '' : item.fund_house || '';
              return (
                <View key={`price-${i}`} style={styles.modalRow}>
                  <View style={styles.widgetIconBox}>
                    <TrendingUp color="#a2b082" size={16} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalRowLabel}>{label}</Text>
                    {sub ? <Text style={styles.modalRowSub}>{sub}</Text> : null}
                  </View>
                  <Text style={styles.modalRowValue}>{value}</Text>
                </View>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function NewsModal({ visible, items, onClose }: { visible: boolean; items: any[]; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={() => {}}>
          <View style={styles.modalHandle} />
          <Pressable style={styles.modalCloseBtn} onPress={onClose}>
            <X color="#888" size={20} />
          </Pressable>
          <Text style={styles.modalTitle}>Related News</Text>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
            {items.map((item: any, i: number) => (
              <Pressable
                key={`news-${i}`}
                style={styles.modalNewsRow}
                onPress={() => item.link && Linking.openURL(item.link)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalNewsTitle}>{item.title}</Text>
                  <Text style={styles.modalNewsMeta}>{item.publisher || ''}</Text>
                </View>
                {item.link ? <ExternalLink color="#555" size={14} /> : null}
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function ChatScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [priceModalItems, setPriceModalItems] = useState<any[]>([]);
  const [newsModalItems, setNewsModalItems] = useState<any[]>([]);

  const hasLoadedOnce = useRef(false);

  const loadMessages = async (showLoader = false) => {
    try {
      if (showLoader) setLoading(true);
      const data = await apiGet<{ messages: any[] }>('/chat/messages');
      setMessages(data.messages || []);
    } catch {
      // Thread will be created on first message
      setMessages([]);
    } finally {
      setLoading(false);
      hasLoadedOnce.current = true;
    }
  };

  useEffect(() => {
    loadMessages(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (hasLoadedOnce.current) {
        loadMessages(false);
      }
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

    // Add an empty assistant bubble that we'll fill token-by-token
    setMessages((prev) => [...prev, { role: 'assistant', content: '', metadata: {} }]);

    let streamedContent = '';

    try {
      await apiStream('/chat/message/stream', { content }, (event: SSEEvent) => {
        if (event.type === 'token' && event.content) {
          streamedContent += event.content;
          const updatedContent = streamedContent;
          setMessages((prev) => {
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
              updated[lastIdx] = { ...updated[lastIdx], content: updatedContent };
            }
            return updated;
          });
        }
      });
      // Stream finished — reload from server to get the persisted message with widgets
      try {
        const data = await apiGet<{ messages: any[] }>('/chat/messages');
        const msgs = data.messages || [];
        // Find widgets in the last assistant message
        const lastAssistant = [...msgs].reverse().find((m: any) => m.role === 'assistant');
        console.log('[Minto] reload: total messages=', msgs.length,
          'last assistant metadata=', JSON.stringify(lastAssistant?.metadata));
        setMessages(msgs);
      } catch (reloadErr) {
        console.log('[Minto] reload failed:', reloadErr);
      }
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
          updated[lastIdx] = { role: 'assistant', content: 'Something went wrong. Please try again.' };
        }
        return updated;
      });
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
            const isEmptyAssistant = message.role === 'assistant' && !message.content && sending;
            return (
              <View key={`${message.role}-${index}`}>
                <View style={message.role === 'user' ? styles.messageRowRight : styles.messageRowLeft}>
                  <View style={message.role === 'user' ? styles.userBubble : styles.botBubble}>
                    {isEmptyAssistant ? (
                      <Text style={styles.typingText}>Thinking...</Text>
                    ) : (
                      <Text style={message.role === 'user' ? styles.userText : styles.botText}>
                        {message.content}
                      </Text>
                    )}
                  </View>
                </View>
                {message.role === 'assistant' && widgets.length > 0 && (
                  <View style={styles.widgetsContainer}>
                    {widgets.map((widget: any, wi: number) => {
                      if (widget.type === 'price_summary') {
                        return (
                          <PriceSummaryWidget
                            key={`widget-${wi}`}
                            data={widget.data}
                            onPress={() => setPriceModalItems(widget.data.items || [])}
                          />
                        );
                      }
                      if (widget.type === 'news_summary') {
                        return (
                          <NewsSummaryWidget
                            key={`widget-${wi}`}
                            data={widget.data}
                            onPress={() => setNewsModalItems(widget.data.items || [])}
                          />
                        );
                      }
                      return null;
                    })}
                  </View>
                )}
              </View>
            );
          })}


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

      <PriceModal
        visible={priceModalItems.length > 0}
        items={priceModalItems}
        onClose={() => setPriceModalItems([])}
      />
      <NewsModal
        visible={newsModalItems.length > 0}
        items={newsModalItems}
        onClose={() => setNewsModalItems([])}
      />
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
  badgeCircle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(162,176,130,0.25)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 2,
  },
  badgeText: {
    color: '#a2b082',
    fontSize: 11,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#1C211E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
    paddingBottom: 32,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 14,
    right: 18,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 24,
    marginTop: 4,
    marginBottom: 16,
  },
  modalScroll: {
    flexGrow: 0,
  },
  modalScrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  modalRowLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  modalRowSub: {
    color: '#888',
    fontSize: 11,
    marginTop: 2,
  },
  modalRowValue: {
    color: '#a2b082',
    fontSize: 15,
    fontWeight: '700',
  },
  modalNewsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  modalNewsTitle: {
    color: '#fff',
    fontSize: 13,
    lineHeight: 18,
  },
  modalNewsMeta: {
    color: '#888',
    fontSize: 11,
    marginTop: 4,
  },
});

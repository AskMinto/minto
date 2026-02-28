import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform, Linking, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Send, TrendingUp, TrendingDown, Newspaper, Plus, X, ExternalLink, ChevronDown, Mic, Sparkles } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { apiGet, apiStream, SSEEvent } from '../../lib/api';
import { useFocusEffect } from '@react-navigation/native';
import { Theme } from '../../constants/Theme';
import { supabase } from '../../lib/supabase';
import AnimatedGradient from '../../components/AnimatedGradient';
import Markdown from 'react-native-markdown-display';

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
        <TrendingUp color={Theme.colors.accent} size={16} />
      </View>
      <View style={styles.widgetInfo}>
        <Text style={styles.widgetLabel} numberOfLines={1}>{label}</Text>
        <Text style={styles.widgetSub} numberOfLines={1}>{value}</Text>
      </View>
      {extra > 0 && (
        <View style={styles.badgeCircle}>
          <Plus color={Theme.colors.accent} size={12} />
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
      <View style={[styles.widgetIconBox, { backgroundColor: 'rgba(184,148,62,0.12)' }]}>
        <Newspaper color={Theme.colors.goldAccent} size={16} />
      </View>
      <View style={styles.widgetInfo}>
        <Text style={styles.widgetLabel} numberOfLines={1}>{first.title}</Text>
        <Text style={styles.widgetSub} numberOfLines={1}>{first.publisher || 'News'}</Text>
      </View>
      {extra > 0 && (
        <View style={[styles.badgeCircle, { backgroundColor: 'rgba(184,148,62,0.15)' }]}>
          <Plus color={Theme.colors.goldAccent} size={12} />
          <Text style={[styles.badgeText, { color: Theme.colors.goldAccent }]}>{extra}</Text>
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
            <X color={Theme.colors.textMuted} size={20} />
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
                    <TrendingUp color={Theme.colors.accent} size={16} />
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
            <X color={Theme.colors.textMuted} size={20} />
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
                {item.link ? <ExternalLink color={Theme.colors.textMuted} size={14} /> : null}
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
  const inputRef = useRef<TextInput>(null);
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
      // Auto-focus input on mount
      setTimeout(() => inputRef.current?.focus(), 500);
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
    <AnimatedGradient style={styles.container}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        {/* Header chevron to dismiss modal */}
        <View style={styles.header}>
          <Pressable style={styles.dismissButton} onPress={() => router.back()}>
            <ChevronDown color={Theme.colors.textPrimary} size={32} />
          </Pressable>
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.chatContent}
            onContentSizeChange={() => {
              scrollRef.current?.scrollToEnd({ animated: true });
            }}
          >
            {loading && messages.length === 0 && (
              <Text style={styles.loadingText}>Loading...</Text>
            )}

            {messages.map((message, index) => {
              const widgets = message.metadata?.widgets || [];
              const isEmptyAssistant = message.role === 'assistant' && !message.content && sending;
              const isUser = message.role === 'user';
              
              return (
                <View key={`${message.role}-${index}`} style={styles.messageWrapper}>
                  {isUser ? (
                    <View style={styles.messageRowRight}>
                      <View style={styles.userBubble}>
                        <Text style={styles.userText}>{message.content}</Text>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.messageRowLeft}>
                      <View style={styles.botContainer}>
                        {isEmptyAssistant ? (
                          <Text style={styles.typingText}>Thinking...</Text>
                        ) : (
                          <Markdown style={markdownStyles}>{message.content}</Markdown>
                        )}
                      </View>
                    </View>
                  )}

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

          {/* Bottom frosted input area matching home screen */}
          <View style={styles.bottomSheetWrapper}>
            <View style={styles.inputRow}>
              <View style={styles.chatInputBubble}>
                <TextInput
                  ref={inputRef}
                  style={styles.textInput}
                  placeholder="Ask me anything..."
                  placeholderTextColor={Theme.colors.textMuted}
                  value={input}
                  onChangeText={setInput}
                  onSubmitEditing={handleSend}
                  returnKeyType="send"
                  editable={!sending}
                />
              </View>
              {input.trim().length > 0 ? (
                <Pressable style={styles.sendButton} onPress={handleSend} disabled={sending}>
                  <Send color={Theme.colors.white} size={20} />
                </Pressable>
              ) : (
                <Pressable style={styles.micButton}>
                  <Mic color={Theme.colors.textPrimary} size={22} />
                  <Sparkles color={Theme.colors.textPrimary} size={10} style={styles.sparkleIcon} />
                </Pressable>
              )}
            </View>
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
    </AnimatedGradient>
  );
}

const markdownStyles: Record<string, any> = {
  body: {
    fontFamily: Theme.font.family,
    color: Theme.colors.textPrimary,
    fontSize: 18,
    lineHeight: 28,
  },
  strong: {
    fontFamily: Theme.font.familyBold,
    fontWeight: undefined as any,
  },
  em: {
    fontFamily: Theme.font.family,
    fontStyle: 'italic' as const,
  },
  bullet_list: {
    marginVertical: 4,
  },
  ordered_list: {
    marginVertical: 4,
  },
  list_item: {
    marginVertical: 2,
  },
  paragraph: {
    marginTop: 0,
    marginBottom: 8,
  },
  heading1: {
    fontFamily: Theme.font.familyBold,
    fontSize: 22,
    lineHeight: 30,
    color: Theme.colors.textPrimary,
    marginTop: 8,
    marginBottom: 4,
    fontWeight: undefined as any,
  },
  heading2: {
    fontFamily: Theme.font.familyBold,
    fontSize: 20,
    lineHeight: 28,
    color: Theme.colors.textPrimary,
    marginTop: 8,
    marginBottom: 4,
    fontWeight: undefined as any,
  },
  heading3: {
    fontFamily: Theme.font.familyBold,
    fontSize: 18,
    lineHeight: 26,
    color: Theme.colors.textPrimary,
    marginTop: 6,
    marginBottom: 4,
    fontWeight: undefined as any,
  },
  code_inline: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 4,
    paddingHorizontal: 4,
    fontSize: 15,
  },
  fence: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    marginVertical: 8,
  },
  link: {
    color: Theme.colors.accent,
    textDecorationLine: 'underline' as const,
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: Theme.colors.accent,
    paddingLeft: 12,
    marginVertical: 8,
    opacity: 0.85,
  },
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  dismissButton: {
    padding: 8,
  },
  chatContent: {
    paddingHorizontal: 24,
    paddingBottom: 20,
    flexGrow: 1,
  },
  loadingText: {
    fontFamily: Theme.font.family,
    color: Theme.colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40,
  },
  messageWrapper: {
    marginBottom: 24,
  },
  messageRowRight: {
    alignItems: 'flex-end',
  },
  messageRowLeft: {
    alignItems: 'flex-start',
  },
  userBubble: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 6, // Sharp corner on bottom right like iMessage/Cleo
    paddingHorizontal: 20,
    paddingVertical: 16,
    maxWidth: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  userText: {
    fontFamily: Theme.font.familyMedium,
    color: Theme.colors.textPrimary,
    fontSize: 16,
    lineHeight: 22,
  },
  botContainer: {
    paddingVertical: 8,
    paddingRight: 32,
  },
  botText: {
    fontFamily: Theme.font.family,
    color: Theme.colors.textPrimary,
    fontSize: 18,
    lineHeight: 28,
  },
  typingText: {
    fontFamily: Theme.font.family,
    color: Theme.colors.textMuted,
    fontSize: 16,
    fontStyle: 'italic',
  },

  /* ── Input ── */
  bottomSheetWrapper: {
    backgroundColor: 'rgba(255, 255, 255, 0.45)', // Frosted glass look
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  chatInputBubble: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 30, // Highly rounded
    paddingHorizontal: 24,
    paddingVertical: 4, // Smaller vertical padding because TextInput handles it
  },
  textInput: {
    fontFamily: Theme.font.family,
    color: Theme.colors.textPrimary,
    fontSize: 16,
    minHeight: 48,
  },
  micButton: {
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  sparkleIcon: {
    position: 'absolute',
    top: 6,
    right: 6,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Theme.colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },

  /* ── Widgets ── */
  widgetsContainer: {
    marginTop: 12,
    gap: 8,
  },
  widgetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.cardBg,
    borderRadius: 16,
    padding: 12,
    gap: 10,
    maxWidth: '90%',
  },
  widgetIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(61,90,62,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  widgetInfo: {
    flex: 1,
  },
  widgetLabel: {
    fontFamily: Theme.font.familyMedium,
    color: Theme.colors.textPrimary,
    fontSize: 13,
  },
  widgetSub: {
    fontFamily: Theme.font.family,
    color: Theme.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  badgeCircle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(61,90,62,0.12)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 2,
  },
  badgeText: {
    fontFamily: Theme.font.familyBold,
    color: Theme.colors.accent,
    fontSize: 11,
  },

  /* ── Modals ── */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#f2f5ef',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
    paddingBottom: 32,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.12)',
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
    backgroundColor: 'rgba(0,0,0,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  modalTitle: {
    fontFamily: Theme.font.familyBold,
    color: Theme.colors.textPrimary,
    fontSize: 16,
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
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  modalRowLabel: {
    fontFamily: Theme.font.familyMedium,
    color: Theme.colors.textPrimary,
    fontSize: 14,
  },
  modalRowSub: {
    fontFamily: Theme.font.family,
    color: Theme.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  modalRowValue: {
    fontFamily: Theme.font.familyBold,
    color: Theme.colors.accent,
    fontSize: 15,
  },
  modalNewsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  modalNewsTitle: {
    fontFamily: Theme.font.family,
    color: Theme.colors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
  },
  modalNewsMeta: {
    fontFamily: Theme.font.family,
    color: Theme.colors.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
});

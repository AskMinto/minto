import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TrendingUp, TrendingDown } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { apiGet } from '../../lib/api';
import { useFocusEffect } from '@react-navigation/native';
import { Theme } from '../../constants/Theme';
import { supabase } from '../../lib/supabase';

const DEFAULT_COMMENTARY = "Markets are vibing. Are you?";

function MarketBadge({ label, value, change }: { label: string; value: string; change: number }) {
  const isUp = change >= 0;
  const Icon = isUp ? TrendingUp : TrendingDown;
  const badgeColor = isUp ? Theme.colors.positive : Theme.colors.negative;

  return (
    <View style={styles.marketBadge}>
      <Text style={styles.marketBadgeLabel}>{label}</Text>
      <Text style={styles.marketBadgeValue}>{value}</Text>
      <View style={styles.marketBadgeChange}>
        <Icon color={badgeColor} size={10} />
        <Text style={[styles.marketBadgeChangeTxt, { color: badgeColor }]}>
          {isUp ? '+' : ''}{change.toFixed(1)}%
        </Text>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const [userName, setUserName] = useState('');
  const [commentary, setCommentary] = useState(DEFAULT_COMMENTARY);
  const [marketBadges, setMarketBadges] = useState<{ label: string; value: string; change: number }[]>([]);

  useEffect(() => {
    // Load home context from backend (user name, market badges, commentary)
    apiGet<any>('/chat/home-context')
      .then((ctx) => {
        if (ctx.user_name) setUserName(ctx.user_name);
        if (ctx.commentary) setCommentary(ctx.commentary);
        if (ctx.market_badges) setMarketBadges(ctx.market_badges);
      })
      .catch(() => {
        // Fallback: get name from Supabase session
        supabase.auth.getSession().then(({ data }) => {
          const name = data.session?.user?.user_metadata?.full_name
            || data.session?.user?.email?.split('@')[0]
            || '';
          setUserName(name.split(' ')[0]);
        });
      });
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.content}>
        <View style={styles.homeSection}>
          <Text style={styles.greeting}>
            Hey{userName ? ` ${userName}` : ''}
          </Text>

          <View style={styles.badgesRow}>
            {marketBadges.length > 0 ? (
              marketBadges.map((b, i) => (
                <MarketBadge key={i} label={b.label} value={b.value} change={b.change} />
              ))
            ) : (
              <>
                <MarketBadge label="NIFTY 50" value="—" change={0} />
                <MarketBadge label="SENSEX" value="—" change={0} />
              </>
            )}
          </View>

          <Text style={styles.commentaryText}>{commentary}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    // Add extra padding at bottom so content isn't hidden behind the large custom tab bar
    paddingBottom: 220, 
  },
  homeSection: {
    paddingBottom: 40,
  },
  greeting: {
    fontFamily: Theme.font.familyMedium,
    fontSize: 52, // Large friendly text
    color: Theme.colors.textPrimary,
    marginBottom: 32,
    letterSpacing: -1.5,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  marketBadge: {
    backgroundColor: Theme.colors.cardBg,
    borderRadius: Theme.radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  marketBadgeLabel: {
    fontFamily: Theme.font.familyMedium,
    fontSize: 12,
    color: Theme.colors.textMuted,
  },
  marketBadgeValue: {
    fontFamily: Theme.font.familyBold,
    fontSize: 14,
    color: Theme.colors.textPrimary,
  },
  marketBadgeChange: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  marketBadgeChangeTxt: {
    fontFamily: Theme.font.familyMedium,
    fontSize: 12,
  },
  commentaryText: {
    fontFamily: Theme.font.familyMedium,
    fontSize: 22,
    color: Theme.colors.textPrimary,
    lineHeight: 32,
    letterSpacing: -0.5,
  },
});
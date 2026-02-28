import React, { useEffect, useRef } from 'react';
import { View, Text, Image, StyleSheet, Pressable, Platform, Animated, Easing } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { LayoutDashboard, Search, User, ChevronUp, Mic, Sparkles } from 'lucide-react-native';
import { Theme } from '../../constants/Theme';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TOP_SECTION_HEIGHT = 98;

const mintoIcon = require('../../assets/images/minto.png');

function MintoIcon({ size }: { color: string, size: number }) {
  return (
    <Image source={mintoIcon} style={{ width: size, height: size, resizeMode: 'contain' }} />
  );
}

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const isHome = state.routes[state.index].name === 'index';
  const expandAnim = useRef(new Animated.Value(isHome ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(expandAnim, {
      toValue: isHome ? 1 : 0,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [isHome, expandAnim]);

  const topHeight = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, TOP_SECTION_HEIGHT],
  });

  const topOpacity = expandAnim.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [0, 0, 1],
  });

  return (
    <View style={[styles.tabBarWrapper, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      
      {/* Animated Top Section: Chevron + Input Row */}
      <Animated.View 
        style={{ 
          height: topHeight,
          opacity: topOpacity,
          overflow: 'hidden',
        }}
      >
        <ChevronUp color="rgba(0,0,0,0.15)" size={24} style={styles.dragHandle} />

        <View style={styles.inputRow}>
          <Pressable style={styles.chatInputBubble} onPress={() => router.push('/chat')}>
            <Text style={styles.chatInputPlaceholder}>Ask me anything...</Text>
          </Pressable>
          <Pressable style={styles.micButton}>
            <Mic color={Theme.colors.textPrimary} size={22} />
            <Sparkles color={Theme.colors.textPrimary} size={10} style={styles.sparkleIcon} />
          </Pressable>
        </View>
      </Animated.View>

      {/* Tabs Row */}
      <View style={styles.tabsRow}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label = options.title !== undefined ? options.title : route.name;
          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          let IconComponent: any = LayoutDashboard;
          let displayLabel = label as string;

          if (route.name === 'index') {
            IconComponent = MintoIcon;
            displayLabel = 'Ask Minto';
          } else if (route.name === 'dashboard') {
            IconComponent = LayoutDashboard;
            displayLabel = 'Portfolio';
          } else if (route.name === 'search') {
            IconComponent = Search;
            displayLabel = 'Search';
          } else if (route.name === 'profile') {
            IconComponent = User;
            displayLabel = 'Profile';
          }

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={styles.tabButton}
            >
              <View style={[styles.iconWrap, isFocused && styles.iconWrapActive]}>
                <IconComponent color={isFocused ? Theme.colors.white : Theme.colors.accent} size={20} />
              </View>
              <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>
                {displayLabel}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Ask Minto' }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{ title: 'Portfolio' }}
      />
      <Tabs.Screen
        name="search"
        options={{ title: 'Search' }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile' }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(240, 245, 239, 0.85)',
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    paddingHorizontal: 20,
    paddingTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.03,
    shadowRadius: 16,
    elevation: 4,
  },
  dragHandle: {
    alignSelf: 'center',
    marginBottom: 10,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  chatInputBubble: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  chatInputPlaceholder: {
    fontFamily: Theme.font.family,
    color: Theme.colors.textMuted,
    fontSize: 16,
  },
  micButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  sparkleIcon: {
    position: 'absolute',
    top: 6,
    right: 6,
  },
  tabsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  tabButton: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
    borderWidth: 1.5,
    borderColor: Theme.colors.accent,
    backgroundColor: 'transparent',
  },
  iconWrapActive: {
    backgroundColor: Theme.colors.accent,
    borderColor: Theme.colors.accent,
  },
  tabLabel: {
    fontFamily: Theme.font.familyMedium,
    fontSize: 11,
    color: Theme.colors.textMuted,
  },
  tabLabelActive: {
    color: Theme.colors.accent,
    fontFamily: Theme.font.familyBold,
  },
});

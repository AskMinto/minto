import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, Animated, Easing } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { LayoutDashboard, Search, User, ChevronUp, Mic, Sparkles } from 'lucide-react-native';
import { Theme } from '../../constants/Theme';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Use a custom M icon representing the Ask Minto tab
function CustomMIcon({ color, size }: { color: string, size: number }) {
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ fontFamily: Theme.font.familyBold, fontSize: size * 0.65, color: color, includeFontPadding: false }}>M</Text>
    </View>
  );
}

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const isHome = state.routes[state.index].name === 'index';
  const expandAnim = useRef(new Animated.Value(isHome ? 1 : 0)).current;

  useEffect(() => {
    // We animate a value between 0 and 1
    Animated.timing(expandAnim, {
      toValue: isHome ? 1 : 0,
      duration: 300,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      useNativeDriver: false, // Need false to animate margin/padding if used, but we'll try translateY
    }).start();
  }, [isHome, expandAnim]);

  // Instead of animating height (which causes layout thrashing and glitches),
  // we animate translateY to slide it down, and margin to close the gap.
  // The height of the input section is roughly 98px.
  
  const topTranslateY = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [100, 0], // Slide down by 100px to hide
  });

  const topOpacity = expandAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0, 1],
  });

  // We animate the bottom margin of the top section to shrink the space it takes up
  const topMarginBottom = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-98, 0], // Collapse the layout space
  });

  return (
    <View style={[styles.tabBarWrapper, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      
      {/* Animated Top Section: Chevron + Input Row */}
      <Animated.View 
        style={{ 
          opacity: topOpacity, 
          transform: [{ translateY: topTranslateY }],
          marginBottom: topMarginBottom,
          zIndex: -1, // Keep it behind the tabs if they overlap during animation
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
      <View style={[styles.tabsRow, { zIndex: 10, backgroundColor: 'transparent' }]}>
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
            IconComponent = CustomMIcon;
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
    backgroundColor: 'rgba(240, 245, 239, 0.85)', // A cool pale-green tinted glass effect
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    paddingHorizontal: 20,
    paddingTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.03,
    shadowRadius: 16,
    elevation: 4,
    overflow: 'hidden', // Ensures the input box is hidden when it slides down
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
    borderColor: Theme.colors.accent, // Dark green outline
    backgroundColor: 'transparent',
  },
  iconWrapActive: {
    backgroundColor: Theme.colors.accent, // Solid dark green fill
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

  const topOpacity = expandAnim.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [0, 0, 1],
  });

  const topTranslateY = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [20, 0],
  });

  return (
    <View style={[styles.tabBarWrapper, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      
      {/* Animated Top Section: Chevron + Input Row */}
      <Animated.View 
        style={{ 
          height: topHeight, 
          opacity: topOpacity, 
          transform: [{ translateY: topTranslateY }], 
          overflow: 'hidden' 
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
            IconComponent = CustomMIcon;
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
    backgroundColor: 'rgba(255, 255, 255, 0.65)', // A clean, frosted glass effect
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
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
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
    borderColor: Theme.colors.accent, // Dark green
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

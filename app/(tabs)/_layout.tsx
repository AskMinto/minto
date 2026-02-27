import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { LayoutDashboard, Search, User, ChevronUp, Mic, Sparkles } from 'lucide-react-native';
import { Theme } from '../../constants/Theme';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Use a custom C icon representing the Ask Minto tab
function CustomCIcon({ color, size }: { color: string, size: number }) {
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ fontFamily: Theme.font.familyBold, fontSize: size * 0.7, color: color, includeFontPadding: false }}>C</Text>
    </View>
  );
}

// Arrow icon for Spend
function SpendArrowIcon({ color, size }: { color: string, size: number }) {
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
       {/* Drawing an arrow manually to match Cleo style */}
       <Text style={{ fontFamily: Theme.font.familyMedium, fontSize: size * 0.8, color: color, includeFontPadding: false }}>↗</Text>
    </View>
  );
}

// Arrow icon for Save
function SaveArrowIcon({ color, size }: { color: string, size: number }) {
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
       <Text style={{ fontFamily: Theme.font.familyMedium, fontSize: size * 0.8, color: color, includeFontPadding: false }}>↙</Text>
    </View>
  );
}

// Dollar icon for Request
function DollarIcon({ color, size }: { color: string, size: number }) {
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
       <Text style={{ fontFamily: Theme.font.familyMedium, fontSize: size * 0.8, color: color, includeFontPadding: false }}>$</Text>
    </View>
  );
}

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.tabBarWrapper, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      <ChevronUp color="rgba(0,0,0,0.15)" size={24} style={styles.dragHandle} />

      {/* Input Row */}
      <View style={styles.inputRow}>
        <Pressable style={styles.chatInputBubble} onPress={() => router.push('/chat')}>
          <Text style={styles.chatInputPlaceholder}>Ask me anything...</Text>
        </Pressable>
        <Pressable style={styles.micButton}>
          <Mic color={Theme.colors.textPrimary} size={22} />
          <Sparkles color={Theme.colors.textPrimary} size={10} style={styles.sparkleIcon} />
        </Pressable>
      </View>

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

          let IconComponent: any = SpendArrowIcon; // default
          let displayLabel = label as string;

          if (route.name === 'index') {
            IconComponent = CustomCIcon;
            displayLabel = 'Ask Cleo'; // Matching reference image
          } else if (route.name === 'dashboard') {
            IconComponent = SpendArrowIcon;
            displayLabel = 'Spend';
          } else if (route.name === 'search') {
            IconComponent = SaveArrowIcon;
            displayLabel = 'Save';
          } else if (route.name === 'profile') {
            IconComponent = DollarIcon;
            displayLabel = 'Request';
          }

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={styles.tabButton}
            >
              <View style={[styles.iconWrap, isFocused && styles.iconWrapActive]}>
                <IconComponent color={isFocused ? Theme.colors.white : '#4a3d3c'} size={20} />
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
        name="dashboard"
        options={{ title: 'Spend' }}
      />
      <Tabs.Screen
        name="index"
        options={{ title: 'Ask Cleo' }}
      />
      <Tabs.Screen
        name="search"
        options={{ title: 'Save' }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Request' }}
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
    backgroundColor: 'rgba(252, 245, 239, 0.85)', // A warm off-white/beige glass effect
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
    color: '#8c8585', // Warm gray
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
    borderColor: '#4a3d3c', // Dark brownish grey
    backgroundColor: 'transparent',
  },
  iconWrapActive: {
    backgroundColor: '#4a3d3c',
    borderColor: '#4a3d3c',
  },
  tabLabel: {
    fontFamily: Theme.font.familyMedium,
    fontSize: 11,
    color: '#8c8585',
  },
  tabLabelActive: {
    color: '#4a3d3c',
    fontFamily: Theme.font.familyBold,
  },
});

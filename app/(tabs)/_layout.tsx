import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { MessageCircle, LayoutDashboard, Search, User } from 'lucide-react-native';
import { Theme } from '../../constants/Theme';

function TabIcon({ Icon, color, focused }: { Icon: any; color: string; focused: boolean }) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
      <Icon color={focused ? Theme.colors.white : color} size={20} />
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Theme.colors.tabBarBg,
          borderTopWidth: 0,
          elevation: 0,
          height: 88,
          paddingBottom: 28,
          paddingTop: 8,
        },
        tabBarActiveTintColor: Theme.colors.white,
        tabBarInactiveTintColor: Theme.colors.tabBarInactive,
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontFamily: Theme.font.familyMedium,
          fontSize: 10,
          marginTop: 4,
        },
        sceneStyle: { backgroundColor: 'transparent' },
      }}>
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Ask Minto',
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={MessageCircle} color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={LayoutDashboard} color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={Search} color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => <TabIcon Icon={User} color={color} focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconWrapActive: {
    backgroundColor: Theme.colors.tabBarActive,
  },
});

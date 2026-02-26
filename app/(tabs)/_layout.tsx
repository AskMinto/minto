import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { TrendingUp, Search, User } from 'lucide-react-native';

function CircleIcon({
  children,
  focused,
}: {
  children: React.ReactNode;
  focused: boolean;
}) {
  return (
    <View
      style={[
        styles.iconCircle,
        focused && styles.iconCircleActive,
      ]}
    >
      {children}
    </View>
  );
}

function BrandedMIcon({ focused }: { focused: boolean }) {
  return (
    <View style={[styles.brandCircle, focused && styles.brandCircleActive]}>
      <Text style={styles.brandLetter}>M</Text>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#f5f0e8',
          borderTopWidth: 0,
          elevation: 0,
          height: 85,
          paddingBottom: 24,
          paddingTop: 8,
        },
        tabBarActiveTintColor: '#333',
        tabBarInactiveTintColor: '#999',
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '500',
          marginTop: 2,
        },
      }}>
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Ask Minto',
          tabBarIcon: ({ focused }) => <BrandedMIcon focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Portfolio',
          tabBarIcon: ({ focused, color }) => (
            <CircleIcon focused={focused}>
              <TrendingUp color={color} size={18} />
            </CircleIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ focused, color }) => (
            <CircleIcon focused={focused}>
              <Search color={color} size={18} />
            </CircleIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused, color }) => (
            <CircleIcon focused={focused}>
              <User color={color} size={18} />
            </CircleIcon>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#bbb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconCircleActive: {
    borderWidth: 2.5,
    borderColor: '#333',
  },
  brandCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1C211E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandCircleActive: {
    backgroundColor: '#333',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  brandLetter: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
});

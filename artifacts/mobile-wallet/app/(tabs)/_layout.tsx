import React from 'react';
import { Platform, StyleSheet, useColorScheme, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';

// NativeTabs / isLiquidGlassAvailable may not be available on all SDK versions
let isLiquidGlassAvailable: (() => boolean) | undefined;
let NativeTabs: any | undefined;
let Icon: any | undefined;
let Label: any | undefined;
try {
  const m = require('expo-router/unstable-native-tabs');
  NativeTabs = m.NativeTabs;
  Icon = m.Icon;
  Label = m.Label;
  const g = require('expo-glass-effect');
  isLiquidGlassAvailable = g.isLiquidGlassAvailable;
} catch {
  isLiquidGlassAvailable = () => false;
}

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: 'wallet.pass', selected: 'wallet.pass.fill' }} />
        <Label>Wallet</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="send">
        <Icon sf={{ default: 'arrow.up.circle', selected: 'arrow.up.circle.fill' }} />
        <Label>Send</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="private">
        <Icon sf={{ default: 'shield.lefthalf.filled', selected: 'shield.fill' }} />
        <Label>Private</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="community">
        <Icon sf={{ default: 'bubble.left.and.bubble.right', selected: 'bubble.left.and.bubble.right.fill' }} />
        <Label>Community</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} />
        <Label>Settings</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: isIOS ? 'transparent' : colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 0,
          height: isWeb ? 64 : undefined,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]} />
          ) : null,
        tabBarLabelStyle: { fontSize: 10 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Wallet',
          tabBarIcon: ({ color, size }) =>
            isIOS ? (
              <SymbolView name="wallet.pass" tintColor={color} size={size} />
            ) : (
              <Feather name="credit-card" size={size - 2} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="send"
        options={{
          title: 'Send',
          tabBarIcon: ({ color, size }) =>
            isIOS ? (
              <SymbolView name="arrow.up.circle" tintColor={color} size={size} />
            ) : (
              <Feather name="arrow-up-right" size={size - 2} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="private"
        options={{
          title: 'Private',
          tabBarIcon: ({ color, size }) =>
            isIOS ? (
              <SymbolView name="shield.lefthalf.filled" tintColor={color} size={size} />
            ) : (
              <Feather name="shield" size={size - 2} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: 'Community',
          tabBarIcon: ({ color, size }) =>
            isIOS ? (
              <SymbolView name="bubble.left.and.bubble.right" tintColor={color} size={size} />
            ) : (
              <Feather name="message-circle" size={size - 2} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) =>
            isIOS ? (
              <SymbolView name="gearshape" tintColor={color} size={size} />
            ) : (
              <Feather name="settings" size={size - 2} color={color} />
            ),
        }}
      />

      {/* Activity is still a valid screen, just not in the tab bar — reached via router.push */}
      <Tabs.Screen
        name="activity"
        options={{
          href: null, // hidden from tab bar
          title: 'Activity',
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable?.()) return <NativeTabLayout />;
  return <ClassicTabLayout />;
}

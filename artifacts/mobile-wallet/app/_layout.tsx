import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack, router, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { WalletProvider, useWallet } from '@/context/WalletContext';
import { PinProvider, usePin } from '@/context/PinContext';
import { PinLock } from '@/components/PinLock';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

/** Handles redirect logic once wallet context is ready. */
function RootLayoutNav() {
  const { isLoading, isSetup } = useWallet();
  const { isLocked } = usePin();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) return;
    const inTabs = segments[0] === '(tabs)';
    const inSetup = segments[0] === 'setup';

    if (!isSetup && !inSetup) {
      router.replace('/setup');
    } else if (isSetup && inSetup) {
      router.replace('/(tabs)');
    }
  }, [isLoading, isSetup, segments]);

  return (
    <>
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="setup" />
      </Stack>
      {/* PIN lock overlays everything — rendered above the navigator */}
      {isLocked && <PinLock />}
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <WalletProvider>
            <PinProvider>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <KeyboardProvider>
                  <RootLayoutNav />
                </KeyboardProvider>
              </GestureHandlerRootView>
            </PinProvider>
          </WalletProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

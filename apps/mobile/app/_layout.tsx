import React, {useEffect} from "react";
import {ActivityIndicator, StyleSheet, View} from "react-native";
import {Stack, useRouter, useSegments} from "expo-router";
import {StatusBar} from "expo-status-bar";
import {SafeAreaProvider} from "react-native-safe-area-context";
import {
  Quicksand_400Regular,
  Quicksand_500Medium,
  Quicksand_600SemiBold,
  Quicksand_700Bold,
  useFonts
} from "@expo-google-fonts/quicksand";
import {AuthProvider, useAuth} from "@/auth-context";
import {colors} from "@/theme";

/** Reindirizza tra area pubblica (login) e area autenticata in base alla sessione. */
function useAuthRedirect(): void {
  const {loading, token} = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const onLogin = segments.length === 0 || segments[0] === "index";
    if (!token && !onLogin) {
      router.replace("/");
    } else if (token && onLogin) {
      router.replace("/role");
    }
  }, [loading, token, segments, router]);
}

function RootNavigator(): React.JSX.Element {
  useAuthRedirect();
  const {loading} = useAuth();

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={colors.blueBright} size="large" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {backgroundColor: colors.bg},
        animation: "fade"
      }}
    />
  );
}

export default function RootLayout(): React.JSX.Element | null {
  const [fontsLoaded] = useFonts({
    Quicksand_400Regular,
    Quicksand_500Medium,
    Quicksand_600SemiBold,
    Quicksand_700Bold
  });

  // Non blocchiamo l'app se il font tarda: dopo un attimo si usa comunque il system font.
  // Qui attendiamo brevemente per evitare un flash, ma senza bloccare in caso di errore.
  if (!fontsLoaded) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={colors.blueBright} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loader: {flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center"}
});

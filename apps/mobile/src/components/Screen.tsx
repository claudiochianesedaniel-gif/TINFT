import React from "react";
import {ScrollView, StyleSheet, View, type ViewStyle} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {colors, spacing} from "../theme";

interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  contentStyle?: ViewStyle;
  /** Centra verticalmente il contenuto (utile per le schermate "stato"). */
  center?: boolean;
}

/** Contenitore di schermata: sfondo scuro, safe-area, padding coerente. */
export function Screen({children, scroll = true, contentStyle, center = false}: ScreenProps): React.JSX.Element {
  const inner = (
    <View style={[styles.content, center && styles.center, contentStyle]}>{children}</View>
  );
  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, center && styles.center]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: colors.bg},
  content: {flex: 1, padding: spacing.lg},
  scrollContent: {padding: spacing.lg, flexGrow: 1},
  center: {justifyContent: "center"}
});

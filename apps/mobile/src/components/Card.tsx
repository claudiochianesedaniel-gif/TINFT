import React from "react";
import {StyleSheet, View, type ViewStyle} from "react-native";
import {colors, radius, spacing} from "../theme";

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  /** Colore della barra accento a sinistra (opzionale). */
  accent?: string;
}

/** Superficie a card del design TINFT, con eventuale barra accento. */
export function Card({children, style, accent}: CardProps): React.JSX.Element {
  return (
    <View style={[styles.card, accent ? {borderLeftWidth: 3, borderLeftColor: accent} : null, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg
  }
});

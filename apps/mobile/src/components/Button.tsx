import React from "react";
import {ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle} from "react-native";
import {colors, fonts, radius, spacing} from "../theme";

type Variant = "primary" | "secondary" | "ghost";

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

/** Pulsante coerente col design (blu pieno / superficie / ghost). */
export function Button({label, onPress, variant = "primary", disabled, loading, style}: ButtonProps): React.JSX.Element {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      style={({pressed}) => [
        styles.base,
        variant === "primary" && styles.primary,
        variant === "secondary" && styles.secondary,
        variant === "ghost" && styles.ghost,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style
      ]}
    >
      <View style={styles.inner}>
        {loading ? <ActivityIndicator color={colors.text} style={styles.spinner} /> : null}
        <Text style={[styles.label, variant === "ghost" && styles.ghostLabel]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    paddingVertical: 15,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center"
  },
  primary: {backgroundColor: colors.blue},
  secondary: {backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border},
  ghost: {backgroundColor: "transparent"},
  disabled: {opacity: 0.5},
  pressed: {opacity: 0.85},
  inner: {flexDirection: "row", alignItems: "center"},
  spinner: {marginRight: spacing.sm},
  label: {color: colors.text, fontSize: 15, fontWeight: "600", fontFamily: fonts.semibold},
  ghostLabel: {color: colors.blueBright}
});

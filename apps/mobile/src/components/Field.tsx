import React from "react";
import {StyleSheet, Text, TextInput, View, type KeyboardTypeOptions} from "react-native";
import {colors, fonts, radius, spacing} from "../theme";

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  keyboardType?: KeyboardTypeOptions;
  maxLength?: number;
  autoFocus?: boolean;
}

/** Campo input etichettato, stile "card scura" del prototipo. */
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  autoCapitalize = "none",
  keyboardType,
  maxLength,
  autoFocus
}: FieldProps): React.JSX.Element {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textDim}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        keyboardType={keyboardType}
        maxLength={maxLength}
        autoFocus={autoFocus}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    marginBottom: spacing.sm
  },
  label: {
    color: colors.textDim,
    fontSize: 10,
    letterSpacing: 0.5,
    marginBottom: 5,
    fontFamily: fonts.medium
  },
  input: {
    color: colors.text,
    fontSize: 14,
    fontFamily: fonts.regular,
    padding: 0
  }
});

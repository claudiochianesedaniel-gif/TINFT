import React, {useState} from "react";
import {KeyboardAvoidingView, Platform, StyleSheet, Text, View} from "react-native";
import {useRouter} from "expo-router";
import {Screen} from "@/components/Screen";
import {Header} from "@/components/Header";
import {Field} from "@/components/Field";
import {Button} from "@/components/Button";
import {Banner} from "@/components/Banner";
import {VALIDATOR_PIN} from "@/config";
import {colors, fonts, spacing} from "@/theme";

export default function ValidatorePinScreen(): React.JSX.Element {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  function unlock(): void {
    if (pin === VALIDATOR_PIN) {
      setError(null);
      router.replace("/validatore/scan");
    } else {
      setError("PIN del varco errato.");
      setPin("");
    }
  }

  return (
    <Screen>
      <Header title="Varco" kicker="PROFILO VALIDATORE" onBack={() => router.back()} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Text style={styles.lead}>Inserisci il PIN del varco per iniziare a validare gli ingressi.</Text>

        {error ? <Banner tone="error">{error}</Banner> : null}

        <Field
          label="PIN VARCO"
          value={pin}
          onChangeText={(v) => setPin(v.replace(/[^0-9]/g, ""))}
          placeholder="••••"
          secureTextEntry
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
        />

        <Button label="Entra al varco" onPress={unlock} disabled={pin.length < 4} style={styles.btn} />

        <View style={styles.hintBox}>
          <Text style={styles.hint}>PIN demo: {VALIDATOR_PIN}</Text>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: {color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: spacing.lg, fontFamily: fonts.regular},
  btn: {marginTop: spacing.sm},
  hintBox: {marginTop: spacing.lg, alignItems: "center"},
  hint: {color: colors.textFaint, fontSize: 11, fontFamily: fonts.regular}
});

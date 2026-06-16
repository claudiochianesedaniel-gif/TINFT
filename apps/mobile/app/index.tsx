import React, {useState} from "react";
import {KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View} from "react-native";
import {useRouter} from "expo-router";
import {Screen} from "@/components/Screen";
import {Field} from "@/components/Field";
import {Button} from "@/components/Button";
import {Banner} from "@/components/Banner";
import {useAuth} from "@/auth-context";
import {ApiError} from "@/api";
import {API_BASE, DEMO_ACCOUNTS, DEMO_PASSWORD} from "@/config";
import {colors, fonts, radius, spacing} from "@/theme";

export default function LoginScreen(): React.JSX.Element {
  const router = useRouter();
  const {login} = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy;

  async function onSubmit(): Promise<void> {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      router.replace("/role");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.isNetwork
            ? `Backend non raggiungibile (${API_BASE}). Controlla API_BASE / la rete.`
            : err.status === 401
              ? "Credenziali non valide."
              : err.message
        );
      } else {
        setError("Errore inatteso durante l'accesso.");
      }
    } finally {
      setBusy(false);
    }
  }

  function pickDemo(demoEmail: string): void {
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD);
    setError(null);
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.brandRow}>
          <View style={styles.logoDot}>
            <Text style={styles.logoMark}>◆</Text>
          </View>
          <Text style={styles.brand}>TINFT</Text>
        </View>
        <Text style={styles.kicker}>ACCESSO BIGLIETTI</Text>
        <Text style={styles.title}>Benvenuto</Text>
        <Text style={styles.subtitle}>Accedi per mostrare il QR del tuo biglietto o validare gli ingressi al varco.</Text>

        {error ? <Banner tone="error">{error}</Banner> : null}

        <Field label="EMAIL" value={email} onChangeText={setEmail} placeholder="tu@email.it" keyboardType="email-address" />
        <Field label="PASSWORD" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry />

        <Button label="Accedi" onPress={onSubmit} disabled={!canSubmit} loading={busy} style={styles.submit} />

        <Text style={styles.demoLabel}>ACCOUNT DEMO · password {DEMO_PASSWORD}</Text>
        <View style={styles.demoRow}>
          {DEMO_ACCOUNTS.map((acc) => (
            <Pressable key={acc.email} onPress={() => pickDemo(acc.email)} style={styles.demoChip}>
              <Text style={styles.demoChipText}>{acc.label}</Text>
              <Text style={styles.demoChipEmail}>{acc.email}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.apiHint}>API: {API_BASE}</Text>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brandRow: {flexDirection: "row", alignItems: "center", marginBottom: spacing.lg},
  logoDot: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.blue,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm
  },
  logoMark: {color: colors.text, fontSize: 16, fontWeight: "700"},
  brand: {color: colors.text, fontSize: 18, fontWeight: "700", letterSpacing: 1, fontFamily: fonts.bold},
  kicker: {color: colors.blueSoft, fontSize: 10, letterSpacing: 1.4, fontFamily: fonts.medium, marginBottom: 6},
  title: {color: colors.text, fontSize: 28, fontWeight: "700", fontFamily: fonts.bold, marginBottom: 6},
  subtitle: {color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: spacing.lg, fontFamily: fonts.regular},
  submit: {marginTop: spacing.sm, marginBottom: spacing.xl},
  demoLabel: {color: colors.textDim, fontSize: 9, letterSpacing: 1, fontFamily: fonts.medium, marginBottom: spacing.sm},
  demoRow: {gap: spacing.sm},
  demoChip: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11
  },
  demoChipText: {color: colors.text, fontSize: 13, fontWeight: "600", fontFamily: fonts.semibold},
  demoChipEmail: {color: colors.textFaint, fontSize: 11, marginTop: 2, fontFamily: fonts.regular},
  apiHint: {color: colors.textDim, fontSize: 10, textAlign: "center", marginTop: spacing.lg, fontFamily: fonts.regular}
});

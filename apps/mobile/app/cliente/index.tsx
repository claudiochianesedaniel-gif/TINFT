import React, {useCallback, useState} from "react";
import {ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View} from "react-native";
import {useFocusEffect, useRouter} from "expo-router";
import {Screen} from "@/components/Screen";
import {Header} from "@/components/Header";
import {Banner} from "@/components/Banner";
import {useSession} from "@/auth-context";
import {api, ApiError} from "@/api";
import {euros, ticketStatusLabel} from "@/format";
import type {Ticket} from "@/types";
import {colors, fonts, radius, spacing} from "@/theme";

export default function ClienteTicketsScreen(): React.JSX.Element {
  const router = useRouter();
  const {token, account} = useSession();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await api.myTickets(account.id, token);
      setTickets(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossibile caricare i biglietti.");
      setTickets((prev) => prev ?? []);
    }
  }, [account.id, token]);

  // Ricarica ogni volta che la schermata torna in primo piano (dopo la validazione lo stato cambia).
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <Screen scroll={false}>
      <Header title="I miei biglietti" kicker="PROFILO CLIENTE" onBack={() => router.back()} />
      {error ? <Banner tone="error">{error}</Banner> : null}

      {tickets === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.blueBright} />
        </View>
      ) : tickets.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>Nessun biglietto su questo account.</Text>
        </View>
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(t) => t.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blueBright} />}
          ItemSeparatorComponent={() => <View style={{height: spacing.sm}} />}
          renderItem={({item}) => <TicketRow ticket={item} onPress={() => router.push(`/cliente/${item.id}`)} />}
        />
      )}
    </Screen>
  );
}

function TicketRow({ticket, onPress}: {ticket: Ticket; onPress: () => void}): React.JSX.Element {
  const active = ticket.status === "ACTIVE";
  return (
    <Pressable onPress={onPress} style={({pressed}) => [styles.row, pressed && styles.rowPressed]}>
      <View style={styles.rowMain}>
        <Text style={styles.holder}>{ticket.holderName}</Text>
        <Text style={styles.meta}>
          {ticket.kind === "FIDELITY" ? "Fidelity" : "Biglietto"} · token #{ticket.tokenId} · {euros(ticket.originalPriceCents)}
        </Text>
        <View style={styles.statusRow}>
          <View style={[styles.dot, {backgroundColor: active ? colors.green : colors.textFaint}]} />
          <Text style={styles.status}>{ticketStatusLabel(ticket.status)}</Text>
        </View>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: {flex: 1, alignItems: "center", justifyContent: "center"},
  empty: {color: colors.textMuted, fontSize: 14, fontFamily: fonts.regular},
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md
  },
  rowPressed: {opacity: 0.85},
  rowMain: {flex: 1},
  holder: {color: colors.text, fontSize: 15, fontWeight: "600", fontFamily: fonts.semibold},
  meta: {color: colors.textFaint, fontSize: 12, marginTop: 3, fontFamily: fonts.regular},
  statusRow: {flexDirection: "row", alignItems: "center", marginTop: 7},
  dot: {width: 8, height: 8, borderRadius: 4, marginRight: 6},
  status: {color: colors.textMuted, fontSize: 12, fontFamily: fonts.medium},
  chevron: {color: colors.textFaint, fontSize: 24, marginLeft: spacing.sm}
});

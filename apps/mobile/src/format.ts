/** Formatta centesimi di euro in stringa "€ 31,50". */
export function euros(cents: number): string {
  return `€ ${(cents / 100).toLocaleString("it-IT", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
}

/** Etichetta italiana dello stato del biglietto. */
export function ticketStatusLabel(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "Attivo";
    case "LISTED":
      return "In vendita / trasferimento";
    case "USED":
      return "Utilizzato";
    case "EXPORTED":
      return "Esportato";
    default:
      return status;
  }
}

// TINFT — fonte dati condivisa (telefono · console · sito web)
// Unica sorgente per holder ed eventi: modifica QUI per aggiornare ovunque.

export function eur(n){
  return '\u20AC ' + Number(n).toLocaleString('it-IT', { minimumFractionDigits:0, maximumFractionDigits:0 });
}

export const HOLDERS = [
  { id:'h0', nome:'Marco',  cognome:'Bianchi', email:'marco.b@email.it',  tickets:2, spent:151.5, joinedLabel:'gen 2024', tag:'Cliente demo', city:'Milano', present:true  },
  { id:'h1', nome:'Giulia', cognome:'Verdi',   email:'giulia.v@email.it', tickets:3, spent:271.5, joinedLabel:'mar 2024', tag:'Top fan',      city:'Milano', present:true  },
  { id:'h2', nome:'Luca',   cognome:'Rossi',   email:'luca.r@email.it',   tickets:1, spent:24,    joinedLabel:'mag 2024', tag:'',            city:'Torino', present:false },
  { id:'h3', nome:'Sara',   cognome:'Conti',   email:'sara.c@email.it',   tickets:5, spent:430,   joinedLabel:'nov 2023', tag:'Top fan',      city:'Milano', present:true  },
  { id:'h4', nome:'Davide', cognome:'Neri',    email:'davide.n@email.it', tickets:2, spent:63,    joinedLabel:'feb 2024', tag:'',            city:'Monza',  present:true  },
  { id:'h5', nome:'Elisa',  cognome:'Fabbri',  email:'elisa.f@email.it',  tickets:1, spent:31.5,  joinedLabel:'giu 2024', tag:'Nuovo',        city:'Como',   present:false }
];

export const ORG_EVENTS = [
  { id:'oe1', title:'Notte Elettronica \u00B7 Vol.4', date:'21 GIU',          type:'Ticket NFT', price:31.5, payout:30,  sold:312, capacity:500, status:'in vendita' },
  { id:'oe2', title:'Stagione Live \u00B7 Fidelity',  date:'carnet \u00B7 5 serate', type:'Fidelity',   price:120,  payout:108, sold:84,  capacity:120, status:'in vendita' },
  { id:'oe3', title:'Vol.3',                          date:'07 GIU',          type:'Ticket NFT', price:31.5, payout:30,  sold:500, capacity:500, status:'concluso'   },
  { id:'oe4', title:'Blue Room \u00B7 Jazz',          date:'03 LUG',          type:'Ticket NFT', price:24,   payout:22,  sold:36,  capacity:200, status:'in vendita' }
];

// Royalty mercato secondario aggregata (demo)
export const ROYALTY = 1240;

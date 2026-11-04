import type { Language } from "./languages";

interface FrenchNoun {
  /** The bare noun, after "Aucun" / "Aucune". */
  noun: string;
  plural: string;
  /** With its definite article, elided where French elides it. */
  definite: string;
  indefinite: string;
  feminine?: boolean;
}

export interface Entity {
  id: string;
  en: [string, string];
  fr: FrenchNoun;
  nl: [string, string];
  de: [string, string];
}

type Template = (entity: Entity) => Record<Language, string>;

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);
const feminine = (entity: Entity, suffix: string) =>
  entity.fr.feminine ? suffix : "";

/** The messages every entity of the back-office has, in the four languages. */
export const TEMPLATES = {
  title: (entity) => ({
    en: capitalize(entity.en[1]),
    fr: capitalize(entity.fr.plural),
    nl: capitalize(entity.nl[1]),
    de: entity.de[1],
  }),
  empty: (entity) => ({
    en: `No ${entity.en[1]} yet`,
    fr: `Aucun${feminine(entity, "e")} ${entity.fr.noun} pour l'instant`,
    nl: `Nog geen ${entity.nl[1]}`,
    de: `Noch keine ${entity.de[1]}`,
  }),
  count: (entity) => ({
    en: `{count} ${entity.en[1]}`,
    fr: `{count} ${entity.fr.plural}`,
    nl: `{count} ${entity.nl[1]}`,
    de: `{count} ${entity.de[1]}`,
  }),
  create: (entity) => ({
    en: `New ${entity.en[0]}`,
    fr: `Ajouter ${entity.fr.indefinite}`,
    nl: `${capitalize(entity.nl[0])} toevoegen`,
    de: `${entity.de[0]} anlegen`,
  }),
  edit: (entity) => ({
    en: `Edit ${entity.en[0]}`,
    fr: `Modifier ${entity.fr.definite}`,
    nl: `${capitalize(entity.nl[0])} bewerken`,
    de: `${entity.de[0]} bearbeiten`,
  }),
  delete: (entity) => ({
    en: `Delete ${entity.en[0]}`,
    fr: `Supprimer ${entity.fr.definite}`,
    nl: `${capitalize(entity.nl[0])} verwijderen`,
    de: `${entity.de[0]} löschen`,
  }),
  deleteConfirm: () => ({
    en: "Delete {name}? This cannot be undone.",
    fr: "Supprimer {name} ? Cette action est définitive.",
    nl: "{name} verwijderen? Dit kan niet ongedaan worden gemaakt.",
    de: "{name} löschen? Dies kann nicht rückgängig gemacht werden.",
  }),
  saved: (entity) => ({
    en: `${capitalize(entity.en[0])} saved`,
    fr: `${capitalize(entity.fr.definite)} a été enregistré${feminine(entity, "e")}`,
    nl: `${capitalize(entity.nl[0])} opgeslagen`,
    de: `${entity.de[0]} gespeichert`,
  }),
  search: (entity) => ({
    en: `Search ${entity.en[1]}…`,
    fr: `Rechercher des ${entity.fr.plural}…`,
    nl: `${capitalize(entity.nl[1])} zoeken…`,
    de: `${entity.de[1]} suchen…`,
  }),
  notFound: (entity) => ({
    en: `This ${entity.en[0]} no longer exists.`,
    fr: `${capitalize(entity.fr.definite)} n'existe plus.`,
    nl: `${capitalize(entity.nl[0])} bestaat niet meer.`,
    de: `${entity.de[0]} wurde nicht gefunden.`,
  }),
} satisfies Record<string, Template>;

const fr = (
  noun: string,
  plural: string,
  definite: string,
  indefinite: string,
  isFeminine = false,
): FrenchNoun => ({ noun, plural, definite, indefinite, feminine: isFeminine });

export const ENTITIES = {
  catalog: [
    {
      id: "product",
      en: ["product", "products"],
      fr: fr("produit", "produits", "le produit", "un produit"),
      nl: ["product", "producten"],
      de: ["Produkt", "Produkte"],
    },
    {
      id: "category",
      en: ["category", "categories"],
      fr: fr("catégorie", "catégories", "la catégorie", "une catégorie", true),
      nl: ["categorie", "categorieën"],
      de: ["Kategorie", "Kategorien"],
    },
    {
      id: "brand",
      en: ["brand", "brands"],
      fr: fr("marque", "marques", "la marque", "une marque", true),
      nl: ["merk", "merken"],
      de: ["Marke", "Marken"],
    },
    {
      id: "collection",
      en: ["collection", "collections"],
      fr: fr(
        "collection",
        "collections",
        "la collection",
        "une collection",
        true,
      ),
      nl: ["collectie", "collecties"],
      de: ["Kollektion", "Kollektionen"],
    },
    {
      id: "sizeChart",
      en: ["size chart", "size charts"],
      fr: fr(
        "grille de tailles",
        "grilles de tailles",
        "la grille de tailles",
        "une grille de tailles",
        true,
      ),
      nl: ["maattabel", "maattabellen"],
      de: ["Größentabelle", "Größentabellen"],
    },
    {
      id: "colour",
      en: ["colour", "colours"],
      fr: fr("couleur", "couleurs", "la couleur", "une couleur", true),
      nl: ["kleur", "kleuren"],
      de: ["Farbe", "Farben"],
    },
    {
      id: "supplier",
      en: ["supplier", "suppliers"],
      fr: fr("fournisseur", "fournisseurs", "le fournisseur", "un fournisseur"),
      nl: ["leverancier", "leveranciers"],
      de: ["Lieferant", "Lieferanten"],
    },
    {
      id: "priceList",
      en: ["price list", "price lists"],
      fr: fr(
        "liste de prix",
        "listes de prix",
        "la liste de prix",
        "une liste de prix",
        true,
      ),
      nl: ["prijslijst", "prijslijsten"],
      de: ["Preisliste", "Preislisten"],
    },
  ],
  checkout: [
    {
      id: "order",
      en: ["order", "orders"],
      fr: fr("commande", "commandes", "la commande", "une commande", true),
      nl: ["bestelling", "bestellingen"],
      de: ["Bestellung", "Bestellungen"],
    },
    {
      id: "cart",
      en: ["cart", "carts"],
      fr: fr("panier", "paniers", "le panier", "un panier"),
      nl: ["winkelwagen", "winkelwagens"],
      de: ["Warenkorb", "Warenkörbe"],
    },
    {
      id: "payment",
      en: ["payment", "payments"],
      fr: fr("paiement", "paiements", "le paiement", "un paiement"),
      nl: ["betaling", "betalingen"],
      de: ["Zahlung", "Zahlungen"],
    },
    {
      id: "shippingMethod",
      en: ["shipping method", "shipping methods"],
      fr: fr(
        "mode de livraison",
        "modes de livraison",
        "le mode de livraison",
        "un mode de livraison",
      ),
      nl: ["verzendmethode", "verzendmethodes"],
      de: ["Versandart", "Versandarten"],
    },
    {
      id: "coupon",
      en: ["coupon", "coupons"],
      fr: fr("code promo", "codes promo", "le code promo", "un code promo"),
      nl: ["kortingscode", "kortingscodes"],
      de: ["Gutschein", "Gutscheine"],
    },
    {
      id: "invoice",
      en: ["invoice", "invoices"],
      fr: fr("facture", "factures", "la facture", "une facture", true),
      nl: ["factuur", "facturen"],
      de: ["Rechnung", "Rechnungen"],
    },
    {
      id: "refund",
      en: ["refund", "refunds"],
      fr: fr(
        "remboursement",
        "remboursements",
        "le remboursement",
        "un remboursement",
      ),
      nl: ["terugbetaling", "terugbetalingen"],
      de: ["Erstattung", "Erstattungen"],
    },
    {
      id: "address",
      en: ["address", "addresses"],
      fr: fr("adresse", "adresses", "l'adresse", "une adresse", true),
      nl: ["adres", "adressen"],
      de: ["Adresse", "Adressen"],
    },
  ],
  inventory: [
    {
      id: "store",
      en: ["store", "stores"],
      fr: fr("magasin", "magasins", "le magasin", "un magasin"),
      nl: ["winkel", "winkels"],
      de: ["Filiale", "Filialen"],
    },
    {
      id: "warehouse",
      en: ["warehouse", "warehouses"],
      fr: fr("entrepôt", "entrepôts", "l'entrepôt", "un entrepôt"),
      nl: ["magazijn", "magazijnen"],
      de: ["Lager", "Lager"],
    },
    {
      id: "transfer",
      en: ["transfer", "transfers"],
      fr: fr("transfert", "transferts", "le transfert", "un transfert"),
      nl: ["overboeking", "overboekingen"],
      de: ["Umlagerung", "Umlagerungen"],
    },
    {
      id: "stockCount",
      en: ["stock count", "stock counts"],
      fr: fr("inventaire", "inventaires", "l'inventaire", "un inventaire"),
      nl: ["telling", "tellingen"],
      de: ["Inventur", "Inventuren"],
    },
    {
      id: "reception",
      en: ["reception", "receptions"],
      fr: fr("réception", "réceptions", "la réception", "une réception", true),
      nl: ["ontvangst", "ontvangsten"],
      de: ["Wareneingang", "Wareneingänge"],
    },
    {
      id: "adjustment",
      en: ["adjustment", "adjustments"],
      fr: fr("ajustement", "ajustements", "l'ajustement", "un ajustement"),
      nl: ["correctie", "correcties"],
      de: ["Korrektur", "Korrekturen"],
    },
    {
      id: "location",
      en: ["location", "locations"],
      fr: fr("emplacement", "emplacements", "l'emplacement", "un emplacement"),
      nl: ["locatie", "locaties"],
      de: ["Lagerplatz", "Lagerplätze"],
    },
    {
      id: "batch",
      en: ["batch", "batches"],
      fr: fr("lot", "lots", "le lot", "un lot"),
      nl: ["partij", "partijen"],
      de: ["Charge", "Chargen"],
    },
  ],
  account: [
    {
      id: "user",
      en: ["user", "users"],
      fr: fr("utilisateur", "utilisateurs", "l'utilisateur", "un utilisateur"),
      nl: ["gebruiker", "gebruikers"],
      de: ["Benutzer", "Benutzer"],
    },
    {
      id: "team",
      en: ["team", "teams"],
      fr: fr("équipe", "équipes", "l'équipe", "une équipe", true),
      nl: ["team", "teams"],
      de: ["Team", "Teams"],
    },
    {
      id: "role",
      en: ["role", "roles"],
      fr: fr("rôle", "rôles", "le rôle", "un rôle"),
      nl: ["rol", "rollen"],
      de: ["Rolle", "Rollen"],
    },
    {
      id: "apiKey",
      en: ["API key", "API keys"],
      fr: fr("clé d'API", "clés d'API", "la clé d'API", "une clé d'API", true),
      nl: ["API-sleutel", "API-sleutels"],
      de: ["API-Schlüssel", "API-Schlüssel"],
    },
    {
      id: "session",
      en: ["session", "sessions"],
      fr: fr("session", "sessions", "la session", "une session", true),
      nl: ["sessie", "sessies"],
      de: ["Sitzung", "Sitzungen"],
    },
    {
      id: "notification",
      en: ["notification", "notifications"],
      fr: fr(
        "notification",
        "notifications",
        "la notification",
        "une notification",
        true,
      ),
      nl: ["melding", "meldingen"],
      de: ["Benachrichtigung", "Benachrichtigungen"],
    },
    {
      id: "subscription",
      en: ["subscription", "subscriptions"],
      fr: fr("abonnement", "abonnements", "l'abonnement", "un abonnement"),
      nl: ["abonnement", "abonnementen"],
      de: ["Abonnement", "Abonnements"],
    },
    {
      id: "device",
      en: ["device", "devices"],
      fr: fr("appareil", "appareils", "l'appareil", "un appareil"),
      nl: ["apparaat", "apparaten"],
      de: ["Gerät", "Geräte"],
    },
  ],
  emails: [
    {
      id: "template",
      en: ["template", "templates"],
      fr: fr("modèle", "modèles", "le modèle", "un modèle"),
      nl: ["sjabloon", "sjablonen"],
      de: ["Vorlage", "Vorlagen"],
    },
    {
      id: "campaign",
      en: ["campaign", "campaigns"],
      fr: fr("campagne", "campagnes", "la campagne", "une campagne", true),
      nl: ["campagne", "campagnes"],
      de: ["Kampagne", "Kampagnen"],
    },
    {
      id: "contact",
      en: ["contact", "contacts"],
      fr: fr("contact", "contacts", "le contact", "un contact"),
      nl: ["contactpersoon", "contactpersonen"],
      de: ["Kontakt", "Kontakte"],
    },
    {
      id: "segment",
      en: ["segment", "segments"],
      fr: fr("segment", "segments", "le segment", "un segment"),
      nl: ["segment", "segmenten"],
      de: ["Segment", "Segmente"],
    },
    {
      id: "mailingList",
      en: ["mailing list", "mailing lists"],
      fr: fr(
        "liste de diffusion",
        "listes de diffusion",
        "la liste de diffusion",
        "une liste de diffusion",
        true,
      ),
      nl: ["mailinglijst", "mailinglijsten"],
      de: ["Verteiler", "Verteiler"],
    },
    {
      id: "sender",
      en: ["sender", "senders"],
      fr: fr("expéditeur", "expéditeurs", "l'expéditeur", "un expéditeur"),
      nl: ["afzender", "afzenders"],
      de: ["Absender", "Absender"],
    },
    {
      id: "attachment",
      en: ["attachment", "attachments"],
      fr: fr(
        "pièce jointe",
        "pièces jointes",
        "la pièce jointe",
        "une pièce jointe",
        true,
      ),
      nl: ["bijlage", "bijlagen"],
      de: ["Anhang", "Anhänge"],
    },
    {
      id: "domain",
      en: ["sending domain", "sending domains"],
      fr: fr(
        "domaine d'envoi",
        "domaines d'envoi",
        "le domaine d'envoi",
        "un domaine d'envoi",
      ),
      nl: ["verzenddomein", "verzenddomeinen"],
      de: ["Versanddomain", "Versanddomains"],
    },
  ],
} satisfies Record<string, Entity[]>;

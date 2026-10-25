import { percentileOf } from "../query";

/** The languages of the workspace, the base one first. */
export const LANGUAGES = ["en", "fr", "nl", "de"] as const;
export type Language = (typeof LANGUAGES)[number];
export const BASE_LANGUAGE: Language = "en";

export interface LanguageInfo {
  label: string;
  locale: string;
}

export const LANGUAGE_INFO: Record<Language, LanguageInfo> = {
  en: { label: "English", locale: "en-GB" },
  fr: { label: "French", locale: "fr-BE" },
  nl: { label: "Dutch", locale: "nl-BE" },
  de: { label: "German", locale: "de-DE" },
};

/** The texts of one key, by language; a language left out is missing. */
export type KeyTexts = Partial<Record<Language, string>>;

export interface TranslationKey {
  key: string;
  namespace: string;
  texts: KeyTexts;
}

export interface NamespaceInfo {
  id: string;
  label: string;
  description: string;
}

interface FrenchNoun {
  /** The bare noun, after "Aucun" / "Aucune". */
  noun: string;
  plural: string;
  /** With its definite article, elided where French elides it. */
  definite: string;
  indefinite: string;
  feminine?: boolean;
}

interface Entity {
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

// The messages every entity of the back-office has, in the four languages.
const TEMPLATES: Record<string, Template> = {
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
};

const fr = (
  noun: string,
  plural: string,
  definite: string,
  indefinite: string,
  isFeminine = false,
): FrenchNoun => ({ noun, plural, definite, indefinite, feminine: isFeminine });

const ENTITIES: Record<string, Entity[]> = {
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
};

// The shared messages, written by hand.
const COMMON_KEYS: Record<string, Record<Language, string>> = {
  save: { en: "Save", fr: "Enregistrer", nl: "Opslaan", de: "Speichern" },
  cancel: { en: "Cancel", fr: "Annuler", nl: "Annuleren", de: "Abbrechen" },
  close: { en: "Close", fr: "Fermer", nl: "Sluiten", de: "Schließen" },
  retry: {
    en: "Retry",
    fr: "Réessayer",
    nl: "Opnieuw proberen",
    de: "Erneut versuchen",
  },
  loading: {
    en: "Loading…",
    fr: "Chargement…",
    nl: "Laden…",
    de: "Wird geladen…",
  },
  signOut: {
    en: "Sign out",
    fr: "Se déconnecter",
    nl: "Afmelden",
    de: "Abmelden",
  },
  help: { en: "Help", fr: "Aide", nl: "Help", de: "Hilfe" },
  welcome: {
    en: "Welcome back, {name}!",
    fr: "Bon retour, {name} !",
    nl: "Welkom terug, {name}!",
    de: "Willkommen zurück, {name}!",
  },
  lastSaved: {
    en: "Saved {time} ago",
    fr: "Enregistré il y a {time}",
    nl: "{time} geleden opgeslagen",
    de: "Vor {time} gespeichert",
  },
  unsaved: {
    en: "{count} unsaved changes",
    fr: "{count} modifications non enregistrées",
    nl: "{count} niet-opgeslagen wijzigingen",
    de: "{count} ungespeicherte Änderungen",
  },
  noResults: {
    en: "No results for “{query}”",
    fr: "Aucun résultat pour « {query} »",
    nl: "Geen resultaten voor ‘{query}’",
    de: "Keine Ergebnisse für „{query}“",
  },
  confirmLeave: {
    en: "Leave this page? Your changes will be lost.",
    fr: "Quitter cette page ? Vos modifications seront perdues.",
    nl: "Deze pagina verlaten? Je wijzigingen gaan verloren.",
    de: "Diese Seite verlassen? Ihre Änderungen gehen verloren.",
  },
  offline: {
    en: "You are offline. Your changes are kept on this device and sent as soon as the connection is back.",
    fr: "Vous êtes hors ligne. Vos modifications sont conservées sur cet appareil et envoyées dès le retour de la connexion.",
    nl: "Je bent offline. Je wijzigingen blijven op dit apparaat bewaard en worden verzonden zodra de verbinding terug is.",
    de: "Sie sind offline. Ihre Änderungen bleiben auf diesem Gerät gespeichert und werden gesendet, sobald die Verbindung wieder steht.",
  },
  legal: {
    en: "By continuing, you accept the terms of service.\nYour data is processed in the European Union and never sold.",
    fr: "En continuant, vous acceptez les conditions d'utilisation.\nVos données sont traitées dans l'Union européenne et ne sont jamais vendues.",
    nl: "Door verder te gaan, aanvaard je de gebruiksvoorwaarden.\nJe gegevens worden in de Europese Unie verwerkt en nooit verkocht.",
    de: "Mit dem Fortfahren akzeptieren Sie die Nutzungsbedingungen.\nIhre Daten werden in der Europäischen Union verarbeitet und nie verkauft.",
  },
  copyright: {
    en: "© {year} Altab. All rights reserved.",
    fr: "© {year} Altab. Tous droits réservés.",
    nl: "© {year} Altab. Alle rechten voorbehouden.",
    de: "© {year} Altab. Alle Rechte vorbehalten.",
  },
  pagination: {
    en: "Page {page} of {pages}",
    fr: "Page {page} sur {pages}",
    nl: "Pagina {page} van {pages}",
    de: "Seite {page} von {pages}",
  },
};

export const NAMESPACES: NamespaceInfo[] = [
  {
    id: "common",
    label: "Common",
    description: "Buttons and messages shared by every screen",
  },
  {
    id: "catalog",
    label: "Catalog",
    description: "Products, brands and collections",
  },
  {
    id: "checkout",
    label: "Checkout",
    description: "Cart, payment and invoices",
  },
  {
    id: "inventory",
    label: "Inventory",
    description: "Stores, warehouses and stock moves",
  },
  { id: "account", label: "Account", description: "Users, teams and access" },
  {
    id: "emails",
    label: "Emails",
    description: "Campaigns and transactional emails",
  },
];

// The share of keys left untranslated in each language (out of 100), and of
// translations whose placeholder a translator mistyped.
const MISSING_PERCENT: Record<Language, number> = {
  en: 0,
  fr: 4,
  nl: 11,
  de: 23,
};
const WRONG_PLACEHOLDER_PERCENT = 18;
const PLACEHOLDER = /\{(\w+)\}/;

// What a translator types when they translate a placeholder's name too.
const TRANSLATED_PLACEHOLDERS: Record<string, KeyTexts> = {
  count: { fr: "nombre", nl: "aantal", de: "Anzahl" },
  name: { fr: "nom", nl: "naam", de: "Name" },
  query: { fr: "recherche", nl: "zoekterm", de: "Suche" },
  time: { fr: "durée", nl: "tijd", de: "Zeit" },
  year: { fr: "année", nl: "jaar", de: "Jahr" },
  page: { fr: "page", nl: "pagina", de: "Seite" },
};

function withGaps(key: string, texts: Record<Language, string>): KeyTexts {
  const kept: KeyTexts = {};
  for (const language of LANGUAGES) {
    if (percentileOf(`${key}:${language}`) < MISSING_PERCENT[language])
      continue;
    kept[language] = withMistake(key, language, texts[language]);
  }
  return kept;
}

function withMistake(key: string, language: Language, text: string): string {
  const isBase = language === BASE_LANGUAGE;
  if (isBase || !PLACEHOLDER.test(text)) return text;
  if (
    percentileOf(`${key}:${language}:placeholder`) >= WRONG_PLACEHOLDER_PERCENT
  )
    return text;
  return text.replace(PLACEHOLDER, (placeholder, name: string) => {
    const translated = TRANSLATED_PLACEHOLDERS[name]?.[language];
    return translated ? `{${translated}}` : placeholder;
  });
}

function entityKeys(namespace: string, entities: Entity[]): TranslationKey[] {
  return entities.flatMap((entity) =>
    Object.entries(TEMPLATES).map(([templateId, template]) => {
      const key = `${namespace}.${entity.id}.${templateId}`;
      return { key, namespace, texts: withGaps(key, template(entity)) };
    }),
  );
}

function commonKeys(): TranslationKey[] {
  return Object.entries(COMMON_KEYS).map(([id, texts]) => {
    const key = `common.${id}`;
    return { key, namespace: "common", texts: withGaps(key, texts) };
  });
}

// Email bodies: long, multi-line texts, still missing in some languages, so
// their empty cells are edited in the drawer (cells[language].editIn).
const EMAIL_BODIES: TranslationKey[] = [
  {
    key: "emails.orderConfirmation.body",
    namespace: "emails",
    texts: {
      en: `Hello {name},

Thank you for your order {orderNumber}. We are preparing your parcel and will send you a tracking link as soon as it leaves our warehouse in Herstal.

You can change the delivery address until the parcel ships, from your account or by replying to this email.

See you soon,
The customer service team`,
      fr: `Bonjour {name},

Merci pour votre commande {orderNumber}. Nous préparons votre colis et vous enverrons un lien de suivi dès qu'il quittera notre entrepôt de Herstal.

Vous pouvez modifier l'adresse de livraison jusqu'à l'expédition, depuis votre compte ou en répondant à cet e-mail.

À bientôt,
Le service clients`,
    },
  },
  {
    key: "emails.pickupReady.body",
    namespace: "emails",
    texts: {
      en: `Good news, {name}!
Your pair is waiting for you at {store}.
We keep it for 7 days: bring your order number {orderNumber} or this email.`,
      fr: `Bonne nouvelle, {name} !
Votre paire vous attend au magasin {store}.
Nous la gardons 7 jours : présentez votre numéro de commande {orderNumber} ou cet e-mail.`,
      nl: `Goed nieuws, {name}!
Je paar ligt klaar in {store}.
We houden het 7 dagen voor je bij: breng je bestelnummer {orderNumber} of deze e-mail mee.`,
    },
  },
];

/** The workspace's keys, kept in memory: a restart puts them back. */
export const TRANSLATION_KEYS: TranslationKey[] = [
  ...commonKeys(),
  ...Object.entries(ENTITIES).flatMap(([namespace, entities]) =>
    entityKeys(namespace, entities),
  ),
  ...EMAIL_BODIES,
];

/**
 * The texts the module ships, before the workspace changed any of them:
 * what "Revert to the module's text" puts back.
 */
export const MODULE_TEXTS: ReadonlyMap<string, KeyTexts> = new Map(
  TRANSLATION_KEYS.map((entry) => [entry.key, { ...entry.texts }]),
);

// The shop's own wording, over the module's: it sells shoes, not "products".
const WORKSPACE_OVERRIDES: Record<string, KeyTexts> = {
  "catalog.product.title": {
    en: "Shoes",
    fr: "Chaussures",
    nl: "Schoenen",
    de: "Schuhe",
  },
  "catalog.product.empty": {
    en: "No shoes yet",
    fr: "Aucune chaussure pour l'instant",
    nl: "Nog geen schoenen",
    de: "Noch keine Schuhe",
  },
  "inventory.store.title": {
    en: "Shops",
    fr: "Boutiques",
    nl: "Winkels",
    de: "Filialen",
  },
  "common.signOut": {
    en: "Log out",
    fr: "Déconnexion",
    nl: "Uitloggen",
    de: "Abmelden",
  },
};

/**
 * The keys whose texts the workspace changed (seeded with the shop's own
 * wording, then every key saved): their rows carry an "Overridden" badge.
 */
export const OVERRIDDEN_KEYS = new Set<string>(
  Object.keys(WORKSPACE_OVERRIDES),
);

for (const entry of TRANSLATION_KEYS) {
  const override = WORKSPACE_OVERRIDES[entry.key];
  if (override) entry.texts = { ...override };
}

/**
 * The key a "colleague" keeps rewording in French: the route changes it just
 * after answering each read, so an edit of it always started from a value
 * that moved, and the save answers a conflict.
 */
export const CONTESTED_KEY = "common.welcome";
export const CONTESTED_LANGUAGE: Language = "fr";
export const CONTESTED_WORDINGS = [
  "Bon retour, {name} !",
  "Ravi de vous revoir, {name} !",
  "Bienvenue à nouveau, {name} !",
  "Content de vous revoir, {name} !",
];

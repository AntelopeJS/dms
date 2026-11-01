import { percentileOf } from "../query";
import { BASE_LANGUAGE, LANGUAGES, type Language } from "./languages";
import { ENTITIES, type Entity, TEMPLATES } from "./vocabulary";

/** The texts of one key, by language; a language left out is missing. */
export type KeyTexts = Partial<Record<Language, string>>;

/** Texts by language, by the key or the placeholder they belong to. */
interface TextsByName {
  [name: string]: KeyTexts;
}

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

/** The shared messages, written by hand. */
const COMMON_KEYS = {
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
} satisfies Record<string, Record<Language, string>>;

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

/**
 * The share of keys left untranslated in each language (out of 100), and of
 * translations whose placeholder a translator mistyped.
 */
const MISSING_PERCENT: Record<Language, number> = {
  en: 0,
  fr: 4,
  nl: 11,
  de: 23,
};
const WRONG_PLACEHOLDER_PERCENT = 18;
const PLACEHOLDER = /\{(\w+)\}/;

/** What a translator types when they translate a placeholder's name too. */
const TRANSLATED_PLACEHOLDERS: TextsByName = {
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

/**
 * Email bodies: long, multi-line texts, still missing in some languages, so
 * their empty cells are edited in the drawer (cells[language].editIn).
 */
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

/**
 * The shop's own wording, over the module's: it sells shoes, not "products".
 */
const WORKSPACE_OVERRIDES: TextsByName = {
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
 * The row value the row actions' `visibleWhen` reads: no column shows it,
 * the menu offers Revert or Override by it.
 */
export const OVERRIDDEN_FIELD = "overridden";

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

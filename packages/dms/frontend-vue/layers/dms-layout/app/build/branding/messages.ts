import { watch } from "vue";

const en = {
  header: { open: "Branding" },
  title: "Branding",
  dev_badge: "Dev",
  editor_mode: "Editor mode",
  mode: { simple: "Simple", developer: "Developer" },
  changes: "No changes | {count} change | {count} changes",
  discard: "Discard",
  save: "Save",
  discard_confirm: {
    title: "Discard your changes?",
    description: "The editor goes back to what the theme files hold.",
  },
  saved: "Theme saved",
  svg_sanitized:
    "Scripts and external references were removed from an SVG logo.",
  section: {
    accent: "Accent",
    backgrounds: "Backgrounds",
    light_dark: "Light · Dark",
    corners: "Corners",
    font: "Font",
    logos: "Logos",
    status: "Status colors",
    other_variables: "Other variables",
    logo_slots: "Logo slots",
  },
  accent: { more: "More palettes", palette: "Palette {name}" },
  background: {
    canvas: "Canvas",
    sidebar: "Sidebar",
    cards: "Cards",
    edit: "{name}, {mode}",
  },
  corners: { sharp: "Sharp", soft: "Soft", round: "Round", pill: "Pill" },
  font: { dms: "DMS default (Geist)" },
  logo: {
    light: "Light",
    dark: "Dark",
    favicon: "Favicon",
    favicon_hint: "Square icon",
    email: "Email",
    email_hint: "PNG · auto",
    dms_default: "DMS logo",
    pick: "Choose a file for {name}",
    remove: "Back to the DMS logo for {name}",
    wrong_type: "A logo is an SVG, PNG, JPEG, WebP or ICO file.",
    too_large: "A logo holds at most 512 KiB.",
    not_drawable: "The browser could not draw this file as an email PNG.",
    slot: {
      default: "Logo",
      collapsed: "Collapsed logo",
      email: "Email logo",
      favicon: "Favicon",
    },
  },
  group: {
    surfaces: "Backgrounds",
    text: "Text",
    borders: "Borders",
    accent: "Accent, one by one",
    shape: "Shape and type",
  },
  token: {
    ui_bg_muted: "Page",
    ui_bg: "Cards and panels",
    dms_bg_sidebar: "Sidebar",
    dms_bg_field: "Fields",
    dms_surface_card: "Card frame",
    ui_bg_elevated: "Raised",
    ui_bg_accented: "Pressed",
    dms_bg_muted: "Bands",
    ui_text_highlighted: "Titles",
    ui_text: "Body",
    ui_text_toned: "Toned",
    ui_text_muted: "Secondary",
    ui_text_dimmed: "Dimmed",
    ui_border: "Borders",
    ui_border_muted: "Light borders",
    ui_border_accented: "Strong borders",
    dms_border_top: "Strongest borders",
    ui_primary: "Accent ink",
    dms_accent_fill: "Accent fill",
    dms_accent_fill_hover: "Accent fill, hovered",
    dms_accent_on_fill: "On the accent fill",
    ui_radius: "Corners",
    dms_radius_card: "Card corners",
    font_sans: "Font",
    font_mono: "Monospace font",
  },
  developer: {
    light: "Light",
    dark: "Dark",
    both: "Both modes",
    value: "{name}, {mode}",
    variable_name: "--variable-name",
    add: "Add",
    remove: "Remove {name}",
    dms_palette: "DMS default",
    reset_all: "Reset to DMS defaults",
  },
  role: {
    primary: "Accent",
    success: "Success",
    warning: "Warning",
    error: "Error",
    info: "Information",
  },
  problem: {
    too_long: "holds more than 512 characters",
    unsafe: "cannot hold ; { } < > \\, a comment, url(), @import or !important",
    not_color: "is not a color",
    not_radius: "is not a length such as 0.5rem",
    not_font: 'is not a list of fonts such as "Inter", sans-serif',
    palette: "is not a palette name such as violet",
  },
  state: {
    no_layer_title: "This project has no theme layer yet",
    no_layer_description: "The theme is written to a frontend layer: {ref}",
    create_layer: "Create theme layer",
    layer_created:
      "Layer created in {path}. Restart the dev server so it serves the layer, then reload this page.",
    refused: "The theme cannot be read",
    save_refused: "Save refused",
    invalid: "Some values cannot be saved",
    stale: "The theme files changed on disk",
    stale_description:
      "Reload them: your changes stay on top of the new files.",
    reload: "Reload",
  },
  preview: {
    label: "Live preview",
    mode: "Preview mode",
    light: "Light",
    dark: "Dark",
    sample: {
      name: "Bike rental",
      dashboard: "Dashboard",
      bikes: "Bikes",
      rentals: "Rentals",
      revenue: "Revenue",
      new_rental: "New rental",
    },
  },
};

export type BrandingMessages = typeof en;

const fr: BrandingMessages = {
  header: { open: "Image de marque" },
  title: "Image de marque",
  dev_badge: "Dev",
  editor_mode: "Mode de l'éditeur",
  mode: { simple: "Simple", developer: "Développeur" },
  changes: "Aucune modification | {count} modification | {count} modifications",
  discard: "Abandonner",
  save: "Enregistrer",
  discard_confirm: {
    title: "Abandonner vos modifications ?",
    description:
      "L'éditeur revient à ce que contiennent les fichiers du thème.",
  },
  saved: "Thème enregistré",
  svg_sanitized:
    "Des scripts et des références externes ont été retirés d'un logo SVG.",
  section: {
    accent: "Accent",
    backgrounds: "Fonds",
    light_dark: "Clair · Sombre",
    corners: "Coins",
    font: "Police",
    logos: "Logos",
    status: "Couleurs d'état",
    other_variables: "Autres variables",
    logo_slots: "Emplacements de logo",
  },
  accent: { more: "Plus de palettes", palette: "Palette {name}" },
  background: {
    canvas: "Page",
    sidebar: "Barre latérale",
    cards: "Cartes",
    edit: "{name}, {mode}",
  },
  corners: { sharp: "Nets", soft: "Doux", round: "Arrondis", pill: "Pilule" },
  font: { dms: "Par défaut du DMS (Geist)" },
  logo: {
    light: "Clair",
    dark: "Sombre",
    favicon: "Favicon",
    favicon_hint: "Icône carrée",
    email: "E-mail",
    email_hint: "PNG · auto",
    dms_default: "Logo du DMS",
    pick: "Choisir un fichier pour {name}",
    remove: "Revenir au logo du DMS pour {name}",
    wrong_type: "Un logo est un fichier SVG, PNG, JPEG, WebP ou ICO.",
    too_large: "Un logo pèse au plus 512 Kio.",
    not_drawable:
      "Le navigateur n'a pas pu dessiner ce fichier en PNG pour les e-mails.",
    slot: {
      default: "Logo",
      collapsed: "Logo replié",
      email: "Logo des e-mails",
      favicon: "Favicon",
    },
  },
  group: {
    surfaces: "Fonds",
    text: "Texte",
    borders: "Bordures",
    accent: "Accent, un par un",
    shape: "Forme et typographie",
  },
  token: {
    ui_bg_muted: "Page",
    ui_bg: "Cartes et panneaux",
    dms_bg_sidebar: "Barre latérale",
    dms_bg_field: "Champs",
    dms_surface_card: "Cadre des cartes",
    ui_bg_elevated: "Surélevé",
    ui_bg_accented: "Enfoncé",
    dms_bg_muted: "Bandeaux",
    ui_text_highlighted: "Titres",
    ui_text: "Texte courant",
    ui_text_toned: "Atténué",
    ui_text_muted: "Secondaire",
    ui_text_dimmed: "Estompé",
    ui_border: "Bordures",
    ui_border_muted: "Bordures légères",
    ui_border_accented: "Bordures marquées",
    dms_border_top: "Bordures les plus marquées",
    ui_primary: "Encre d'accent",
    dms_accent_fill: "Remplissage d'accent",
    dms_accent_fill_hover: "Remplissage d'accent, survolé",
    dms_accent_on_fill: "Sur le remplissage d'accent",
    ui_radius: "Coins",
    dms_radius_card: "Coins des cartes",
    font_sans: "Police",
    font_mono: "Police à chasse fixe",
  },
  developer: {
    light: "Clair",
    dark: "Sombre",
    both: "Les deux modes",
    value: "{name}, {mode}",
    variable_name: "--nom-de-variable",
    add: "Ajouter",
    remove: "Retirer {name}",
    dms_palette: "Par défaut du DMS",
    reset_all: "Revenir aux valeurs du DMS",
  },
  role: {
    primary: "Accent",
    success: "Succès",
    warning: "Avertissement",
    error: "Erreur",
    info: "Information",
  },
  problem: {
    too_long: "dépasse 512 caractères",
    unsafe:
      "ne peut contenir ; { } < > \\, un commentaire, url(), @import ou !important",
    not_color: "n'est pas une couleur",
    not_radius: "n'est pas une longueur comme 0.5rem",
    not_font: 'n\'est pas une liste de polices comme "Inter", sans-serif',
    palette: "n'est pas un nom de palette comme violet",
  },
  state: {
    no_layer_title: "Ce projet n'a pas encore de couche de thème",
    no_layer_description: "Le thème s'écrit dans une couche frontend : {ref}",
    create_layer: "Créer la couche de thème",
    layer_created:
      "Couche créée dans {path}. Redémarrez le serveur de développement pour qu'il la serve, puis rechargez cette page.",
    refused: "Le thème ne peut pas être lu",
    save_refused: "Enregistrement refusé",
    invalid: "Certaines valeurs ne peuvent pas être enregistrées",
    stale: "Les fichiers du thème ont changé sur le disque",
    stale_description:
      "Rechargez-les : vos modifications restent par-dessus les nouveaux fichiers.",
    reload: "Recharger",
  },
  preview: {
    label: "Aperçu en direct",
    mode: "Mode de l'aperçu",
    light: "Clair",
    dark: "Sombre",
    sample: {
      name: "Location de vélos",
      dashboard: "Tableau de bord",
      bikes: "Vélos",
      rentals: "Locations",
      revenue: "Chiffre d'affaires",
      new_rental: "Nouvelle location",
    },
  },
};

const CATALOGUES: Record<string, BrandingMessages> = { en, fr };

interface MessageTarget {
  locale: { value: string };
  mergeLocaleMessage: (
    locale: string,
    messages: { branding: BrandingMessages },
  ) => void;
}

function mergeFor(i18n: MessageTarget, locale: string): void {
  const catalogue = Object.hasOwn(CATALOGUES, locale) ? CATALOGUES[locale] : en;
  i18n.mergeLocaleMessage(locale, { branding: catalogue ?? en });
}

/**
 * Adds the editor's messages under `branding`, for the current locale and
 * every locale switched to later: they live here, not in the layer's locale
 * files, so no production build carries them.
 */
export function installBrandingMessages(i18n: MessageTarget): void {
  mergeFor(i18n, i18n.locale.value);
  watch(
    () => i18n.locale.value,
    (locale) => mergeFor(i18n, locale),
    { flush: "sync" },
  );
}

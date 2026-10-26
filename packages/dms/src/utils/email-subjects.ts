const DEFAULT_LANGUAGE = "en";
const LANGUAGE_CODE_LENGTH = 2;

/** The built-in emails whose subject does not depend on names. */
export type BuiltInEmailSubject =
  | "userValidation"
  | "resetPassword"
  | "twoFactor"
  | "emailChangeVerification"
  | "emailChangeNotice"
  | "exportReady";

const SUBJECTS: Record<string, Record<BuiltInEmailSubject, string>> = {
  en: {
    userValidation: "Verify Your Email",
    resetPassword: "Reset Your Password",
    twoFactor: "Your verification code",
    emailChangeVerification: "Confirm your new sign-in email",
    emailChangeNotice: "Your sign-in email is being changed",
    exportReady: "Your data export is ready",
  },
  fr: {
    userValidation: "Vérifiez votre adresse e-mail",
    resetPassword: "Réinitialisez votre mot de passe",
    twoFactor: "Votre code de vérification",
    emailChangeVerification: "Confirmez votre nouvelle adresse de connexion",
    emailChangeNotice: "Votre adresse de connexion va changer",
    exportReady: "Votre export de données est prêt",
  },
};

/**
 * The supported language a built-in email is written in: the two-letter code
 * of `language` when there is copy for it, English otherwise.
 */
export function resolveEmailLanguage(language?: string): string {
  const code = language?.slice(0, LANGUAGE_CODE_LENGTH).toLowerCase();
  return code && Object.hasOwn(SUBJECTS, code) ? code : DEFAULT_LANGUAGE;
}

/** The subject of a built-in email, in the recipient's language. */
export function builtInEmailSubject(
  email: BuiltInEmailSubject,
  language?: string,
): string {
  return SUBJECTS[resolveEmailLanguage(language)][email];
}

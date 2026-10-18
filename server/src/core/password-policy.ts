/**
 * Politique de mot de passe commune aux modules (users, mariadb).
 * Longueur minimale 12, au moins 3 classes de caractères parmis
 * minuscules / majuscules / chiffres / spéciaux.
 */
const MIN_LENGTH = 12;

export function validatePasswordPolicy(password: string): string {
  if (password.length < MIN_LENGTH) {
    throw new Error(`Mot de passe trop court (${MIN_LENGTH} min.)`);
  }
  const classes = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^a-zA-Z0-9]/.test(password),
  ].filter(Boolean).length;
  if (classes < 3) {
    throw new Error('Mot de passe trop faible : mélange minuscules, majuscules, chiffres et spéciaux (3 classes min.)');
  }
  return password;
}

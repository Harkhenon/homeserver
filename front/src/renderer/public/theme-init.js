// Applique le thème mémorisé avant le premier rendu, pour éviter un flash au démarrage.
// Fichier externe (et non inline) : la CSP de production n'autorise que script-src 'self'.
// À garder synchronisé avec src/theme/registry.ts et src/theme/AppearanceProvider.tsx.
(function () {
  // Thèmes disponibles en clair ET en sombre ; les autres sont imposés en sombre.
  var MULTI_SCHEME_THEMES = ['modern'];
  var root = document.documentElement;
  var theme = 'classic';
  var scheme = 'dark';
  try {
    theme = localStorage.getItem('hs_theme') || 'classic';
    if (MULTI_SCHEME_THEMES.indexOf(theme) !== -1) {
      var pref = localStorage.getItem('hs_color_scheme');
      if (pref !== 'light' && pref !== 'dark') {
        pref = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
      }
      scheme = pref;
    }
  } catch (e) {
    // localStorage indisponible : thème par défaut.
  }
  root.setAttribute('data-hs-theme', theme);
  root.setAttribute('data-mantine-color-scheme', scheme);
  root.style.colorScheme = scheme;
})();

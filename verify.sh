#!/usr/bin/env bash
# À lancer UNE fois APRÈS un logout/login (pour que le Shell charge le nouveau code).
# Vérifie que l'extension charge sans erreur, puis montre la popup pour test visuel.
set -uo pipefail
U=accent-hold@local
SHELL_DEST=(--session --dest org.gnome.Shell --object-path /org/gnome/Shell)

echo "==> 1. Activation de l'extension"
gdbus call "${SHELL_DEST[@]}" --method org.gnome.Shell.Extensions.EnableExtension "$U" >/dev/null
sleep 1

echo "==> 2. État réel dans le Shell"
INFO=$(gdbus call "${SHELL_DEST[@]}" --method org.gnome.Shell.Extensions.GetExtensionInfo "$U" 2>&1)
STATE=$(echo "$INFO" | grep -oP "'state': <\K[0-9]+")
ERR=$(echo "$INFO" | grep -o "'error': <'[^']*'>")
case "$STATE" in
  1) echo "   ✅ ACTIVE — l'extension a chargé SANS erreur (le bug de freeze ne s'est pas reproduit au chargement)";;
  3) echo "   ❌ ERREUR : $ERR"; echo "   -> colle-moi ça."; exit 1;;
  *) echo "   ⚠️ état=$STATE (2=INACTIVE). Détail: $INFO";;
esac

echo "==> 3. Le daemon tourne-t-il ?"
if pgrep -x accent-holdd >/dev/null; then echo "   oui"; else
  echo "   non (normal si pas encore lancé). L'appui long nécessite : sudo usermod -aG input $USER + relogin + démarrer le daemon."
fi

cat <<'EOF'

==> 4. TEST VISUEL de la popup (sans daemon, zéro risque de freeze)
   Une popup d'accents pour « e » va s'ouvrir au pointeur.
   - Appuie sur 3  -> « ê » doit s'insérer ICI, dans ce terminal
   - ou Échap pour fermer
   - si rien : elle se ferme seule après 6 s, et ton clavier RESTE libre
   (Si le clavier se fige, c'est un échec — note-le. Mais le code fautif a été retiré.)

Curseur ici ->
EOF
sleep 2
gdbus call "${SHELL_DEST[@]}" --method org.gnome.Shell.Extensions.GetExtensionInfo "$U" >/dev/null
gdbus call --session --dest dev.accenthold.Popup --object-path /dev/accenthold/Popup \
  --method dev.accenthold.Popup.Trigger 'e' 2>&1 \
  && echo "(Trigger renvoyé ci-dessus : (true,) = popup affichée)"

echo
echo "==> Résultat attendu : popup visible + 'ê' inséré + clavier libre = freeze CORRIGÉ + injection OK."
echo "    Ensuite, pour le VRAI appui long : sudo usermod -aG input $USER ; relogin ; timeout 25 env ACCENT_HOLD_MS=450 /usr/local/bin/accent-holdd"

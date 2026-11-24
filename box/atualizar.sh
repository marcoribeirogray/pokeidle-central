#!/data/data/com.termux/files/usr/bin/sh
git -C "$HOME/pokeidle-central" pull --ff-only || exit 1
pkill -f "node .*pokebox.mjs" 2>/dev/null
sleep 7
tail -n 3 "$HOME/pokebox-dados/pokebox.log"
echo "Atualizado."

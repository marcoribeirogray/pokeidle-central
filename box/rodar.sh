#!/data/data/com.termux/files/usr/bin/sh
DADOS="$HOME/pokebox-dados"
mkdir -p "$DADOS"
PIDF="$DADOS/rodar.pid"
if [ -f "$PIDF" ] && kill -0 "$(cat "$PIDF")" 2>/dev/null; then
  echo "O PokeBox já está rodando."
  exit 0
fi
echo $$ > "$PIDF"
rm -f "$DADOS/parado"
termux-wake-lock 2>/dev/null
cd "$(dirname "$0")" || exit 1
LOG="$DADOS/pokebox.log"
while true; do
  if [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 5000000 ]; then
    tail -c 1000000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
  fi
  node --max-old-space-size=160 pokebox.mjs >> "$LOG" 2>&1
  if [ -f "$DADOS/parado" ]; then
    echo "$(date '+%F %T') PokeBox desligado pelo painel. Para ligar de novo, reinicie a box ou rode rodar.sh." >> "$LOG"
    rm -f "$PIDF"
    exit 0
  fi
  echo "$(date '+%F %T') PokeBox parou. Reiniciando em 5 s." >> "$LOG"
  sleep 5
done

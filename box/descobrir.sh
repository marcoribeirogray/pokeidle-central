#!/data/data/com.termux/files/usr/bin/sh
D="$HOME/.descobrir"
mkdir -p "$D" && cd "$D" || exit 1
B="https://pokeidle.io"
curl -sL "$B/app" -o app.html
echo "== pagina: $(wc -c < app.html) bytes"
abs() { case "$1" in http*) echo "$1";; /*) echo "$B$1";; ./*) echo "$B/${1#./}";; *) echo "$B/$1";; esac; }
grep -oE '(src|href)="[^"]+\.m?js[^"]*"' app.html | cut -d'"' -f2 | sort -u > lista1.txt
: > todos.txt
for s in $(cat lista1.txt); do
  u=$(abs "$s"); echo "$u" >> todos.txt
  f="j$(echo "$u" | md5sum | cut -c1-8).js"; curl -sL "$u" -o "$f"
  grep -oE '"(\./|/)?[A-Za-z0-9_./-]+\.m?js"' "$f" | tr -d '"' | sort -u | while read -r c; do
    case "$c" in *assets*|*chunk*|*index*|*app*|./*|/*) echo "$(abs "$c")" >> todos.txt;; esac
  done
done
sort -u todos.txt -o todos.txt
echo "== arquivos js: $(wc -l < todos.txt)"
for u in $(cat todos.txt); do
  f="j$(echo "$u" | md5sum | cut -c1-8).js"; [ -s "$f" ] || curl -sL "$u" -o "$f"
done
echo "== WebSocket"
cat j*.js | grep -oE '.{0,160}new WebSocket\(.{0,160}' | head -5
cat j*.js | grep -oE '"wss?://[^"]{0,80}"|`wss?://[^`]{0,80}`' | sort -u | head -10
echo "== localStorage"
cat j*.js | grep -oE 'localStorage\.(getItem|setItem|removeItem)\(["'"'"'`][^"'"'"'`]{1,40}' | sort -u | head -30
echo "== hello"
cat j*.js | grep -oE '.{0,120}t:"hello".{0,200}' | head -3
echo "== auth"
cat j*.js | grep -oE '"/auth/[a-zA-Z/]+"' | sort -u | head -20
echo "== fim"

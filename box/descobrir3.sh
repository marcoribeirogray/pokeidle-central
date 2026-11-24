#!/data/data/com.termux/files/usr/bin/sh
cd "$HOME/.descobrir" || exit 1
F="app.html j*.js"
echo "== sessao"
cat $F | grep -oE "sessao ?= ?[^;]{0,200}" | sort -u | head -8
echo "== salvar sessao"
cat $F | grep -oE "function (salvarSessao|lerSessao|carregarSessao|obterSessao|guardarSessao)[^}]{0,300}" | head -4
cat $F | grep -oE "(salvarSessao|lerSessao|carregarSessao)\([^)]{0,60}\)" | sort -u | head -6
echo "== chaves"
cat $F | grep -oE "(getItem|setItem)\([A-Za-z_]+[,)]" | sort -u | head -10
cat $F | grep -oE "const [A-Z_]+ ?= ?['\"][a-zA-Z:._-]{2,30}['\"]" | sort -u | head -25
echo "== fim"

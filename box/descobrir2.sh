#!/data/data/com.termux/files/usr/bin/sh
cd "$HOME/.descobrir" || exit 1
F="app.html j*.js"
echo "== hello"
cat $F | grep -oE ".{0,220}['\"]hello['\"].{0,260}" | head -4
echo "== token"
cat $F | grep -oE ".{0,90}(tokenNovo|token:|\.token\b|'token'|\"token\").{0,110}" | head -14
echo "== armazenamento"
cat $F | grep -oE "localStorage\[[^]]{1,40}\]|sessionStorage\.[a-zA-Z]+\([^)]{0,40}|document\.cookie.{0,60}|indexedDB.{0,40}" | sort -u | head -12
echo "== login"
cat $F | grep -oE ".{0,120}/auth/conta.{0,160}" | head -3
echo "== fim"

#!/data/data/com.termux/files/usr/bin/sh
set -e
echo "== 1/4 Instalando o git =="
pkg install -y git >/dev/null 2>&1 || pkg install -y git
echo "== 2/4 Baixando o PokeBox =="
if [ -d "$HOME/pokeidle-central/.git" ]; then
  git -C "$HOME/pokeidle-central" pull --ff-only
else
  git clone --depth 1 https://github.com/marcoribeirogray/pokeidle-central "$HOME/pokeidle-central"
fi
mkdir -p "$HOME/pokebox-dados/novas"
chmod 700 "$HOME/pokebox-dados"
echo "== 3/4 Configurando para ligar junto com a box =="
mkdir -p "$HOME/.termux/boot"
cat > "$HOME/.termux/boot/10-pokebox.sh" <<'BOOT'
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock
sshd
nohup sh "$HOME/pokeidle-central/box/rodar.sh" >/dev/null 2>&1 &
BOOT
chmod 700 "$HOME/.termux/boot/10-pokebox.sh"
echo "== 4/4 Ligando o PokeBox =="
nohup sh "$HOME/pokeidle-central/box/rodar.sh" >/dev/null 2>&1 &
sleep 4
tail -n 3 "$HOME/pokebox-dados/pokebox.log" 2>/dev/null || true
IP=$(ip -4 addr show wlan0 2>/dev/null | grep -oE 'inet [0-9.]+' | cut -d' ' -f2)
echo ""
echo "PRONTO. Painel: http://${IP:-IP-DA-BOX}:8377"

export DEBIAN_FRONTEND=noninteractive
echo "== 1/4 Atualizando o Termux (pode levar alguns minutos) =="
pkg update -y -o Dpkg::Options::=--force-confnew
pkg upgrade -y -o Dpkg::Options::=--force-confnew
echo "== 2/4 Instalando Node.js LTS e acesso remoto (SSH) =="
pkg install -y nodejs-lts openssh
echo "== 3/4 Autorizando o notebook =="
mkdir -p ~/.ssh
cat /data/local/tmp/pokebox.pub >> ~/.ssh/authorized_keys
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
echo "== 4/4 Ligando o acesso remoto =="
sshd
termux-wake-lock 2>/dev/null
echo ""
echo "Node.js: $(node -v)"
echo "PRONTO - pode voltar para o notebook"

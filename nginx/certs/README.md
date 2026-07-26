# TLS certificates for ClientShield nginx (not committed)

Mount your certificates here (or set `TLS_CERTS_DIR` in compose to another host path):

- `fullchain.pem` — certificate + intermediates
- `privkey.pem` — private key (mode 600 on the host)

Example (Let's Encrypt):

```bash
sudo cp /etc/letsencrypt/live/YOUR_DOMAIN/fullchain.pem ./nginx/certs/
sudo cp /etc/letsencrypt/live/YOUR_DOMAIN/privkey.pem ./nginx/certs/
sudo chown root:root ./nginx/certs/*.pem
sudo chmod 600 ./nginx/certs/privkey.pem
```

Until real certs exist, the HTTP `:80` location proxies to the app.
The HTTPS server block will fail to start nginx cleanly if these files are missing —
use self-signed placeholders for lab smoke tests only:

```bash
openssl req -x509 -nodes -newkey rsa:2048 -days 30 \
  -keyout nginx/certs/privkey.pem \
  -out nginx/certs/fullchain.pem \
  -subj "/CN=localhost"
```

Do not commit real certificates or private keys.

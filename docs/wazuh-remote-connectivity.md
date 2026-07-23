# Wazuh remote endpoint connectivity (ClientShield)

## Current bindings

| Service | Host binding | Purpose |
|---------|--------------|---------|
| Manager agent 1514 | `127.0.0.1` + `100.99.136.98` | Agent events (local + Tailscale) |
| Manager authd 1515 | `127.0.0.1` + `100.99.136.98` | Agent enrollment (local + Tailscale) |
| Manager API 55000 | `127.0.0.1:55000` | ClientShield Manager API |
| Indexer 9200 | `127.0.0.1:9200` | ClientShield Indexer queries |
| Dashboard 443→5601 | `127.0.0.1:443` | Wazuh UI |

**ClientShield application enrollment is ready.**

**Applied (lab):** dual-publish agent ports on localhost + Tailscale IPv4 only:

- `127.0.0.1:1514` / `127.0.0.1:1515` — local Agent 001
- `100.99.136.98:1514` / `100.99.136.98:1515` — Tailscale overlay (`utun6`)
- `55000` / `9200` / `443` remain `127.0.0.1` only
- **Never** `0.0.0.0`

Backup + rollback: `~/Desktop/SIEM/backups/wazuh-single-node-20260722T140500Z/`

## Recommended architecture for this local development environment

**Prefer: private overlay (Tailscale or WireGuard)**

```
Remote endpoint
  → Tailscale/WireGuard tunnel
  → Dev Mac Tailscale IP (100.99.136.98) OR localhost for local agents
  → Wazuh Manager 1514/1515 (not on LAN/WAN)
  → Indexer (localhost only)
  → ClientShield worker (localhost)
```

### Why not direct 0.0.0.0 exposure?

- Authd (1515) and agent channel (1514) become an internet attack surface.
- Dynamic residential IPs / NAT complicate certificates and ACLs.
- Indexer/API/Dashboard must never follow agent ports onto the public edge.

### Alternatives evaluated

| Option | Verdict |
|--------|---------|
| A. Bind 1514/1515 to `0.0.0.0` | High risk; needs firewall + approval |
| B. Site-to-site VPN | Good for production MSSP |
| C. Tailscale/WireGuard overlay | **Best for this local lab** |
| D. Reverse tunnel/gateway | Possible; more moving parts |
| E. Dedicated remote gateway manager | Future scale-out |

## Ports remote agents need

- **Required (via private network only):** TCP 1514, TCP 1515
- **Never expose to remote agents:** 9200, 55000, 443

## Applied compose change (Tailscale dual-bind)

```yaml
- "127.0.0.1:1514:1514"
- "127.0.0.1:1515:1515"
- "100.99.136.98:1514:1514"
- "100.99.136.98:1515:1515"
- "127.0.0.1:55000:55000"   # unchanged
# indexer/dashboard unchanged: 127.0.0.1 only
```

If this Mac’s Tailscale IPv4 changes, update the two `100.x` lines and recreate `wazuh.manager` only.

### Risks

- Misconfiguration to `0.0.0.0` exposes enrollment to the internet.
- Weak authd password + public 1515 = unauthorized agents.
- Tailscale IP churn requires compose update.

### Firewall / ACL recommendation (manual — not auto-applied)

- Prefer Tailscale ACL/grants: only authorized endpoint tags → this Mac → TCP 1514, 1515.
- Deny remote access to 443, 9200, 55000.
- No WAN port forwarding / UPnP.

### TLS / enrollment implications

- Agent↔manager uses Wazuh protocol over authorized channel.
- Enrollment secrets must be issued out-of-band (ClientShield stores placeholders only).
- Do not weaken Manager API / Indexer TLS for agent connectivity.

### Rollback

```bash
BACKUP=~/Desktop/SIEM/backups/wazuh-single-node-20260722T140500Z
"$BACKUP/ROLLBACK.sh"
# or:
# cp "$BACKUP/docker-compose.yml" ~/Desktop/SIEM/third_party/wazuh-docker/single-node/
# cd ~/Desktop/SIEM/third_party/wazuh-docker/single-node && docker compose up -d --force-recreate wazuh.manager
docker port single-node-wazuh.manager-1
# Expect 1514/1515 on 127.0.0.1 only
```

## ClientShield enrollment secret handling (TODO)

Secure authd password / enrollment token issuance is **not** automated in this phase.

- UI instructions use `<ENROLLMENT_SECRET>` and `<MANAGER_ADDRESS>` placeholders.
- Never persist plaintext secrets in `WazuhAgentEnrollment` or audit logs.
- Future: short-lived hashed tokens with single display, or integration with password manager / sealed vault.

## Success path (application)

Client → AUTHORIZED WORKSTATION/SERVER → Prepare Enrollment → Install on endpoint (manual) → Verify against Manager inventory → Explicit Map → SecurityEvents via existing ingestion → Investigation → Manual Incident

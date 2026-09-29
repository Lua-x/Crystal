# Running behind a reverse proxy

Crystal speaks plain HTTP on port 3000 and expects a reverse proxy to terminate HTTPS. For
every setup:

1. Set `BASE_URL` to the public address, e.g. `https://todo.example.com` (no path – Crystal
   must be served from the root of a domain or subdomain).
2. Set `TRUST_PROXY=true` (or the number of proxies in the chain), so Crystal sees the real
   client address for rate limiting and the correct scheme.
3. Do not publish port 3000 to the internet; let only the proxy reach it.
4. Let long-lived responses through unbuffered. Open apps receive changes to shared lists
   over Server-Sent Events (`/api/v1/events`), a response that stays open and sends a
   keep-alive every 25 seconds. Caddy and Traefik handle this without extra settings; for
   Nginx see below.

## Traefik

```yaml
services:
  crystal:
    image: ghcr.io/lua-x/crystal:latest
    restart: unless-stopped
    environment:
      BASE_URL: https://todo.example.com
      TRUST_PROXY: 'true'
    volumes:
      - crystal-data:/data
    networks: [proxy]
    labels:
      - traefik.enable=true
      - traefik.http.routers.crystal.rule=Host(`todo.example.com`)
      - traefik.http.routers.crystal.entrypoints=websecure
      - traefik.http.routers.crystal.tls.certresolver=letsencrypt
      - traefik.http.services.crystal.loadbalancer.server.port=3000

networks:
  proxy:
    external: true

volumes:
  crystal-data:
```

## Caddy

```caddyfile
todo.example.com {
	reverse_proxy crystal:3000
}
```

Caddy sets `X-Forwarded-For`, `X-Forwarded-Proto` and `X-Forwarded-Host` automatically.

## Nginx / Nginx Proxy Manager

In Nginx Proxy Manager, create a proxy host for `todo.example.com` pointing to `crystal:3000`
(scheme `http`), request a certificate and enable “Force SSL”. With plain Nginx:

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name todo.example.com;

    # ssl_certificate …; ssl_certificate_key …;

    client_max_body_size 25m;

    location / {
        proxy_pass http://crystal:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
    }

    # Live updates: an event stream that stays open.
    location /api/v1/events {
        proxy_pass http://crystal:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_read_timeout 1h;
    }
}
```

Crystal also sends `X-Accel-Buffering: no` on the stream, which turns buffering off in most
Nginx setups (including Nginx Proxy Manager) even without the extra `location`.

## Troubleshooting

- **“The request could not be verified” when signing in** – `BASE_URL` does not match the
  address in the browser (check `http` vs. `https`, the port and `www.`).
- **Signing in works but you are signed out immediately** – you open Crystal over plain
  HTTP while `BASE_URL` starts with `https://`. Browsers drop `Secure` cookies on HTTP.
- **Every client shares one rate limit** – `TRUST_PROXY` is not set, so all requests appear
  to come from the proxy.
- **Changes from others only appear after a reload** – the proxy buffers or cuts the event
  stream at `/api/v1/events`. Check the Nginx settings above; in the browser's developer
  tools, the request should stay open and show `ready` and `changed` events.

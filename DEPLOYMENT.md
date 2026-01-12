# 🚀 Deployment Manual

**Project:** OSLSR (Oyo State Labour & Skills Registry)
**Target:** Ubuntu VPS (Hetzner/DigitalOcean/AWS)

## 1. Prerequisites (Server Side)

Run these commands on your fresh VPS to prepare it:

```bash
# Update System
sudo apt update && sudo apt upgrade -y

# Install Docker & Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
# (Log out and log back in for group changes to take effect)
```

## 2. First-Time Deployment (Manual)

If you are not using the GitHub Action yet, follow this:

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/YOUR_USERNAME/oslrs-main.git
    cd oslrs-main
    ```

2.  **Configure Environment:**
    *   **Crucial:** You MUST create a `.env` file.
    ```bash
    cp .env.example .env
    nano .env
    ```
    *   *Fill in real production values!*

3.  **Start Services:**
    ```bash
    docker compose -f docker/docker-compose.yml up -d --build
    ```

4.  **Verify:**
    *   Check logs: `docker compose -f docker/docker-compose.yml logs -f`
    *   Visit: `http://YOUR_SERVER_IP`

## 3. How It Works (Under the Hood)

*   **Nginx:** configured to serve the React app and handle routing (`/dashboard`, `/login`) correctly.
*   **API:** Automatically runs `pnpm db:push` on startup. If the database is empty, it creates the tables. If updated, it syncs the schema.
*   **Restart Policy:** Containers will auto-restart if the server reboots.

## 4. Troubleshooting

**"Database connection error":**
*   Check `.env`. Ensure `DATABASE_URL` matches the docker service name (e.g., `postgres://user:pass@postgres:5432/app_db`). Note: Inside Docker, host is `postgres`, not `localhost`.

**"404 Not Found" on Web:**
*   Ensure the `docker/nginx.conf` was successfully copied. You can check by running `docker exec -it <web-container-id> cat /etc/nginx/conf.d/default.conf`.

**"Permission Denied" on Scripts:**
*   Run `chmod +x docker/production-entrypoint.sh` locally and commit, or run it on the server.

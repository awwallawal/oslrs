# Oyo State Labour & Skills Registry (OSLSR)

The **Oyo State Labour & Skills Registry (OSLSR)** is a state-wide digital registry system designed to establish a trusted, continuously updated register of skilled, semi-skilled, and unskilled workers across all 33 Local Government Areas of Oyo State.

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v20 LTS (required)
- **pnpm**: v9.x (required)
- **Docker**: For local database and services

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-org/oslsr.git
    cd oslsr
    ```

2.  **Install dependencies:**
    ```bash
    pnpm install
    ```

3.  **Environment Setup:**
    Copy `.env.example` to `.env` and configure:
    ```bash
    cp .env.example .env
    ```

4.  **Start Development Environment:**
    ```bash
    docker-compose up -d  # Start Postgres/Redis
    pnpm dev              # Start API and Web servers
    ```

## 🏗️ Architecture

- **Apps:**
    - `@oslsr/web`: React 18.3 PWA with Vite & Tailwind v4
    - `@oslsr/api`: Express.js API with Node 20 & Drizzle ORM
- **Services:**
    - `odk-integration`: Service abstraction for ODK Central
- **Infrastructure:**
    - Single Hetzner VPS (CX43)
    - Docker Compose orchestration
    - NGINX Reverse Proxy

## 📦 Deployment Guide (Portainer)

**1. VPS Preparation**
- Provision Hetzner CX43 instance (Ubuntu 22.04)
- Install Docker & Docker Compose

**2. Install Portainer CE**
```bash
docker volume create portainer_data
docker run -d -p 8000:8000 -p 9443:9443 --name portainer --restart=always -v /var/run/docker.sock:/var/run/docker.sock -v portainer_data:/data portainer/portainer-ce:latest
```
- Access `https://<YOUR-IP>:9443` and set admin password.

**3. Deploy OSLSR Stack**
- In Portainer, go to **Stacks** > **Add stack**.
- Name: `oslsr-prod`.
- Upload `docker/docker-compose.yml`.
- Add environment variables from `.env`.
- Click **Deploy the stack**.

## 🧪 Testing

Run all tests across the monorepo:
```bash
pnpm test
```

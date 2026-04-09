# TMAC CRM deployment guide

## What you have
TMAC CRM is a browser-based CRM with:
- secure login
- multiple users
- central database
- shared updates across different offices/IP addresses
- purple/green TMAC branding

## Important hosting reality
Your **123 Reg domain account can absolutely be used for the web address**, but it may **not** be the best place to run this app unless you have a VPS or server-level hosting.

This CRM needs:
- a place to run the backend
- a PostgreSQL database
- a place to serve the frontend
- SSL/HTTPS

## Best beginner route
Use:
- **123 Reg** for the domain / DNS
- **Railway, Render, or a VPS** for the app itself
- **PostgreSQL** hosted on the same platform or via Neon/Supabase/Railway

## Easiest route if you want one hosting place
Use a **Linux VPS**. Then run TMAC CRM with Docker.

## Before you deploy
1. Buy or confirm a VPS/server that supports Docker.
2. Point a subdomain like `crm.yourdomain.co.uk` to that server IP.
3. Install Docker and Docker Compose on the server.
4. Upload this project.
5. Edit environment values.
6. Start the stack.
7. Add HTTPS with a reverse proxy.

## Option A: Deploy to a Linux VPS with Docker
### 1. Connect to the server
Use SSH to connect.

### 2. Upload the project
Upload the project folder or zip, then unzip it.

### 3. Edit passwords and secrets
Open `docker-compose.yml` and change:
- PostgreSQL password
- JWT secret
- admin email/password
- frontend and backend URLs if using a real domain

### 4. Start the app
Run:
```bash
docker compose up -d --build
```

### 5. Open the app
Frontend: `http://YOUR_SERVER_IP:8080`
Backend health: `http://YOUR_SERVER_IP:4000/health`

### 6. First login
Use the admin credentials in your environment values.

## Option B: Domain at 123 Reg, app on Render/Railway
### 1. Create a PostgreSQL database on your chosen platform
### 2. Deploy backend service from `/backend`
### 3. Deploy frontend service from `/frontend`
### 4. Add environment variables
### 5. Point your 123 Reg DNS record to the hosted frontend

## Environment variables
### Backend
- `PORT`
- `CLIENT_ORIGIN`
- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `TMAC_ADMIN_EMAIL`
- `TMAC_ADMIN_PASSWORD`

### Frontend
- `VITE_API_URL`

## What to do next after first live test
- change the default admin password
- add real users
- add backups
- add HTTPS
- add password reset
- add audit/reporting refinements
- add API partner endpoints

## Recommended first live URL
Use a subdomain such as:
- `crm.yourdomain.co.uk`
- `portal.yourdomain.co.uk`
- `app.yourdomain.co.uk`

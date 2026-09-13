# edu-api

Backend REST API and real-time service for the EduMovimiento platform.

## Architecture & Deployment
- **Runtime**: Node.js >= 22 (Express 5)
- **Container**: Docker & Docker Compose
- **Server**: VPS 2 (`72.62.27.45`)
- **Gateway**: Nginx Reverse Proxy with Let's Encrypt SSL (`api.edumovimiento.com`)
- **CI/CD**: Automated deployment via GitHub Actions on push to `main`
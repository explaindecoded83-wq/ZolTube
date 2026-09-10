# ZolTube V3 — working full-stack foundation

## Run
1. Install Node.js 20+.
2. In this folder run: `npm install`
3. Set a strong `JWT_SECRET` environment variable before production.
4. Run: `npm start`
5. Open http://localhost:3000

## Included
- User signup/login with hashed passwords
- SQLite database
- Video upload (up to 500 MB in this demo)
- HTTP video streaming with Range support
- Video feed/search
- View counting
- Basic channel and creator studio

## Production before public launch
Use cloud object storage/CDN for videos, HTTPS, rate limiting, moderation/reporting, backups, virus/file validation, privacy/terms, scalable database, and a compliant ad/payout provider. Earnings shown by a future monetization layer must only come from real platform revenue; never credit demo values as real money.

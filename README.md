# Upwork Real Browser Scraper

A small Node.js scraper for Upwork using **puppeteer-real-browser**.  
It launches a real browser, waits for Cloudflare checks to finish, and extracts structured job data (title, URL, budget, experience level, skills, client info, etc.) — with or without cookies.

---

## Features

- Uses **puppeteer-real-browser** (fingerprint + turnstile support)
- Handles Cloudflare “just a moment” pages
- Randomized delays to mimic human behavior
- Scrapes:
  - Job ID, title, URL
  - Description
  - Budget & experience level
  - Posted time
  - Skills
  - Client payment verification, rating, total spent, location

---

## Installation

```bash
git clone https://github.com/your-username/upwork-real-browser-scraper.git
cd upwork-real-browser-scraper
npm install
```

// scraper.js
const { connect } = require("puppeteer-real-browser");
const fs = require("fs");
const path = (require = require("path"));

class UpworkScraper {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  // Load cookies from cookies.json (if it exists)
  async loadCookiesFromFile() {
    const cookiesPath = path.join(__dirname, "cookies.json");
    if (!fs.existsSync(cookiesPath)) {
      console.log("cookies.json not found – continuing without cookies.");
      return [];
    }

    try {
      const raw = fs.readFileSync(cookiesPath, "utf-8");
      const cookies = JSON.parse(raw);
      if (Array.isArray(cookies)) {
        console.log(`Loaded ${cookies.length} cookies from cookies.json`);
        return cookies;
      }
      console.warn("cookies.json is not an array – ignoring.");
      return [];
    } catch (err) {
      console.error("Failed to read cookies.json:", err.message);
      return [];
    }
  }

  // === NEW METHOD: SAVE COOKIES ===
  async saveCookiesToFile() {
    if (!this.page) {
      console.error("Cannot save cookies: Page is not initialized.");
      return;
    }
    try {
      const cookies = await this.page.cookies();
      const cookiesPath = path.join(__dirname, "cookies.json");
      fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
      console.log(`Saved ${cookies.length} cookies to cookies.json.`);
    } catch (err) {
      console.error("Failed to save cookies.json:", err.message);
    }
  }
  // ==================================

  // Start browser and load cookies
  async init() {
    console.log("Initializing Puppeteer Real Browser...");

    try {
      const { browser, page } = await connect({
        headless: false,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
        fingerprint: true,
        turnstile: true,
        connectOption: {
          defaultViewport: null,
        },
      });

      this.browser = browser;
      this.page = page;

      // Load cookies from file
      const cookies = await this.loadCookiesFromFile();
      if (cookies.length > 0) {
        try {
          await this.page.setCookie(...cookies);
          console.log("Cookies applied to page.");
        } catch (err) {
          console.error("Failed to set cookies:", err.message);
        }
      }

      await this.page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
      );

      console.log("Puppeteer Real Browser initialized successfully.");
      return true;
    } catch (err) {
      console.error("Failed to initialize browser:", err.message);
      return false;
    }
  }

  async delay(min = 2000, max = 4000) {
    const ms = Math.random() * (max - min) + min;
    console.log(`Waiting for ${Math.round(ms / 1000)}s...`);
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async navigateToUpwork(targetUrl) {
    console.log(`Navigating to Upwork URL: ${targetUrl}`);

    try {
      await this.page.goto(targetUrl, {
        waitUntil: "networkidle0",
        timeout: 120000,
      });

      await this.waitForJobsToAppear();

      await this.delay(3000, 5000);
      await this.delay(1000, 2000);

      console.log("Page loaded successfully.");
      return true;
    } catch (err) {
      console.error("Navigation failed:", err.message);
      try {
        await this.page.screenshot({
          path: "debug_navigation_failed.png",
          fullPage: true,
        });
        console.log("Saved debug_navigation_failed.png");
      } catch (sErr) {
        console.error("Failed to capture debug screenshot:", sErr.message);
      }
      return false;
    }
  }

  // Wait until job links appear in the DOM (or timeout)
  async waitForJobsToAppear() {
    console.log("Waiting for job links to appear on the page...");

    try {
      await this.page.waitForFunction(
        () => {
          const links = Array.from(
            document.querySelectorAll('a[href*="/jobs/"]')
          );
          return links.some((a) =>
            (a.getAttribute("href") || "").includes("/jobs/~")
          );
        },
        { timeout: 90000 }
      );
      console.log("Job links detected in DOM.");
    } catch (err) {
      console.log(
        "Timeout waiting for job links. Page may still be on a challenge:",
        err.message
      );
    }
  }

  // Scrape job data from links like /jobs/~XXXX
  async scrapeJobs(maxJobs = 20) {
    console.log("Starting job scraping process...");

    try {
      const rawJobs = await this.page.$$eval(
        'a[href*="/jobs/"]',
        (links, maxJobs) => {
          const results = [];
          const seen = new Set();

          for (const link of links) {
            const href = link.href || "";
            if (!href.includes("/jobs/~")) continue; // only real job detail links
            if (seen.has(href)) continue;
            seen.add(href);

            const root =
              link.closest("article") ||
              link.closest("section") ||
              link.closest("div");

            const getText = (selector) => {
              if (!root) return null;
              const el = root.querySelector(selector);
              return el ? el.textContent.trim() : null;
            };

            const title =
              link.textContent.trim() || getText("h3, h4") || "No title";

            const description =
              getText(
                '[data-test="UpCLineClamp JobDescription"] p, [data-test="job-description-text"], .air3-line-clamp p'
              ) || "";

            const metaText = Array.from(
              root ? root.querySelectorAll("li, small, span") : []
            )
              .map((el) => el.textContent.trim())
              .filter(Boolean)
              .slice(0, 15)
              .join(" | ");

            const skills = Array.from(
              root
                ? root.querySelectorAll(
                    '[data-test="token"] span, .air3-token span'
                  )
                : []
            ).map((el) => el.textContent.trim());

            results.push({
              title,
              url: href,
              description,
              meta: metaText,
              skills,
            });

            if (results.length >= maxJobs) break;
          }

          return results;
        },
        maxJobs
      );

      const jobs = rawJobs.map((job, idx) => ({
        id: idx + 1,
        ...job,
        scrapedAt: new Date().toISOString(),
      }));

      console.log(`Scraped ${jobs.length} jobs.`);
      if (jobs.length === 0) {
        try {
          await this.page.screenshot({
            path: "debug_no_jobs.png",
            fullPage: true,
          });
          console.log("Saved debug_no_jobs.png for inspection.");
        } catch (e) {
          console.error(
            "Failed to capture debug_no_jobs screenshot:",
            e.message
          );
        }
      }

      return jobs;
    } catch (err) {
      console.error("Error in scrapeJobs:", err.message);
      return [];
    }
  }

  async close() {
    try {
      if (this.browser) {
        await this.browser.close();
        console.log("Browser closed successfully.");
      }
    } catch (err) {
      console.error("Error closing browser:", err.message);
    }
  }
}

module.exports = UpworkScraper;

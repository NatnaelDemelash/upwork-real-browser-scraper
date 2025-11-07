const express = require("express");
const WorkingUpworkScraper_NoCookie = require("./WorkingUpworkScraper_NoCookie");

const app = express();
const PORT = process.env.PORT || 3000;

// Parse JSON body
app.use(express.json());

// Health check
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Upwork Real Browser Scraper API",
    endpoint: "/scrape",
  });
});

/**
 * POST /scrape
 * Body JSON:
 * {
 *   "url": "https://www.upwork.com/nx/jobs/search/?q=nodejs&sort=recency",
 *   "cookie": [ ...optional puppeteer cookie objects... ],
 *   "maxJobs": 20   // optional
 * }
 */
app.post("/scrape", async (req, res) => {
  const { url, cookie, maxJobs } = req.body || {};

  if (!url) {
    return res.status(400).json({
      error: "Missing required field 'url' in request body.",
    });
  }

  console.log(`Incoming scrape request for URL: ${url}`);

  const scraper = new WorkingUpworkScraper_NoCookie();
  let initialized = false;

  try {
    // cookie is expected to be an array of cookie objects compatible with page.setCookie
    initialized = await scraper.init(cookie || null);
    if (!initialized) {
      return res.status(500).json({
        error: "Failed to initialize scraper browser instance.",
      });
    }

    const navigated = await scraper.navigateToUpwork(url);
    if (!navigated) {
      return res.status(500).json({
        error: "Failed to navigate to target URL.",
      });
    }

    const jobs = await scraper.scrapeJobs(Number(maxJobs) || 20);

    return res.json({
      url,
      count: jobs.length,
      jobs,
    });
  } catch (err) {
    console.error("Error in /scrape handler:", err);
    return res.status(500).json({
      error: "Unexpected error while scraping.",
      details: err.message,
    });
  } finally {
    try {
      if (initialized) {
        await scraper.close();
      }
    } catch (closeErr) {
      console.error("Error closing scraper in finally:", closeErr.message);
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

// server.js
const express = require("express");
const UpworkScraper = require("./scraper");

const app = express();
const PORT = process.env.PORT || 3000;

// --- CRITICAL REFACTOR: INITIALIZE SCRAPER ONCE ---
const scraper = new UpworkScraper();
let isScraperInitialized = false;

// Function to initialize the scraper once when the server starts
async function initScraper() {
  console.log("Starting initial browser connection...");
  isScraperInitialized = await scraper.init();
  if (isScraperInitialized) {
    console.log("Scraper is ready for job requests.");
  } else {
    console.error(
      "CRITICAL: Scraper failed to initialize. Check your dependencies."
    );
  }
}
// ---------------------------------------------------

// Parse JSON body
app.use(express.json());

// Health check
app.get("/", (req, res) => {
  res.json({
    status: isScraperInitialized ? "ready" : "initializing/failed",
    message: "Upwork Real Browser Scraper API",
    endpoint: "/scrape",
  });
});

/**
 * POST /scrape
 */
app.post("/scrape", async (req, res) => {
  const { url, maxJobs } = req.body || {};

  // Check if the single browser instance is ready
  if (!isScraperInitialized || !scraper.page) {
    return res.status(503).json({
      error:
        "Scraper is not yet initialized or has failed. Please try again in a moment.",
    });
  }

  if (!url) {
    return res.status(400).json({
      error: "Missing required field 'url' in request body.",
    });
  }

  console.log(`Incoming scrape request for URL: ${url}`);

  try {
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
  }
});

// Start initialization and then listen
initScraper()
  .then(() => {
    const server = app.listen(PORT, () => {
      console.log(`Server listening on http://localhost:${PORT}`);
    });

    // --- GRACEFUL SHUTDOWN (BEST PRACTICE + COOKIE SAVE) ---
    process.on("SIGINT", async () => {
      console.log("\nSIGINT received. Closing browser and server...");

      // CRITICAL STEP: Save cookies before closing!
      await scraper.saveCookiesToFile();

      await scraper.close();
      server.close(() => {
        console.log("Express server closed.");
        process.exit(0);
      });
    });
    // ----------------------------------------------------------
  })
  .catch((e) => {
    console.error("Server startup failed:", e.message);
    process.exit(1);
  });

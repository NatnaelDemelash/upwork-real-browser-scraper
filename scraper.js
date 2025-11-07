const { connect } = require("puppeteer-real-browser");
const fs = require("fs"); // Currently unused, but kept
const { get } = require("http"); // Currently unused, but kept

class WorkingUpworkScraper_NoCookie {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  // Launch puppeteer-real-browser and optionally load cookies
  async init(cookieData = null) {
    console.log("Initializing Puppeteer Real Browser...");
    try {
      const { browser, page } = await connect({
        headless: true,
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

      // Optional: load cookies if provided
      if (cookieData && Array.isArray(cookieData) && cookieData.length > 0) {
        console.log("Attempting to load provided cookies...");
        try {
          await this.page.setCookie(...cookieData);
          console.log("Cookies loaded successfully.");
        } catch (error) {
          console.error("Failed to set cookies:", error.message);
        }
      }

      // Set a desktop Chrome user agent
      await this.page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.82 Safari/537.36"
      );

      console.log("Puppeteer Real Browser initialized successfully.");
      return true;
    } catch (error) {
      console.error("Failed to initialize browser:", error);
      return false;
    }
  }

  // Go to a given Upwork URL and wait for Cloudflare to finish
  async navigateToUpwork(targetUrl) {
    console.log(`Navigating to Upwork URL: ${targetUrl}`);
    try {
      await this.page.goto(targetUrl, {
        waitUntil: "networkidle2",
        timeout: 60000,
      });

      await this.waitForCloudflareComplete();
      await this.delay(3000, 5000);
      console.log("Page loaded successfully.");
      return true;
    } catch (error) {
      console.error("Navigation failed:", error);
      return false;
    }
  }

  // Random delay between min/max ms
  async delay(min = 2000, max = 4000) {
    const delay = Math.random() * (max - min) + min;
    console.log(
      `Waiting for ${Math.round(delay / 1000)}s before proceeding...`
    );
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  // Wait until Cloudflare challenge is done (approx heuristic)
  async waitForCloudflareComplete() {
    console.log("Waiting for Cloudflare checks to complete...");
    let attempts = 0;
    const maxAttempts = 20;

    while (attempts < maxAttempts) {
      attempts++;
      const title = await this.page.title();
      const url = this.page.url();

      console.log(
        `Attempt ${attempts}/${maxAttempts} : Current title is "${title}"`
      );

      if (
        url.includes("upwork.com") &&
        !title.toLowerCase().includes("cloudflare") &&
        !title.toLowerCase().includes("just a moment") &&
        !title.toLowerCase().includes("checking")
      ) {
        console.log("Cloudflare checks completed.");
        return true;
      }

      await this.delay(5000, 8000);
    }

    console.log("Continuing despite potential Cloudflare checks...");
    return true;
  }

  // Find job tiles on the Upwork jobs page using multiple selectors
  async findJobElements() {
    console.log("Searching for job elements on the page...");

    const selectors = [
      'article[data-test="job-tile"]',
      ".job-tile",
      ".air3-card.job-tile",
    ];

    for (const selector of selectors) {
      try {
        await this.page.waitForSelector(selector, { timeout: 10000 });
        const elements = await this.page.$$(selector);

        if (elements.length > 0) {
          console.log(
            `Found ${elements.length} job elements using selector: ${selector}`
          );
          return { elements, selector };
        }
      } catch (error) {
        console.error(
          `Error while searching with selector ${selector}:`,
          error.message
        );
      }
    }

    console.log("No job elements found with any selector.");
    await this.page.screenshot({ path: "debug_no_jobs.png", fullPage: true });
    return { elements: [], selector: null };
  }

  // Scrape jobs from the page
  async scrapeJobs(maxJobs = 20) {
    console.log("Starting job scraping process...");
    const jobs = [];

    try {
      const { elements: jobElements } = await this.findJobElements();

      if (!jobElements || jobElements.length === 0) {
        console.log("No job elements found to scrape.");
        return jobs;
      }

      const maxJobsToProcess = Math.min(jobElements.length, maxJobs);

      for (let i = 0; i < maxJobsToProcess; i++) {
        try {
          const jobData = await jobElements[i].evaluate((el) => {
            const getText = (selector) => {
              const node = el.querySelector(selector);
              return node ? node.textContent.trim() : null;
            };

            // Job ID from attribute
            const jobId = el.getAttribute("data-ev-jobuid") || null;

            // Title & URL
            const titleLink = el.querySelector(
              'h2 a[href*="/jobs/"], [data-test="job-title-link"]'
            );
            const title = titleLink ? titleLink.textContent.trim() : null;
            const url = titleLink ? titleLink.href : null;

            // Full description
            const description =
              getText(
                '[data-test="UpCLineClamp JobDescription"] p, .air3-line-clamp p'
              ) || "No description";

            // Budget & experience level
            let budget = "Not Specified";
            let experienceLevel = "Not Specified";

            const jobInfoItems = el.querySelectorAll(
              '[data-test="JobInfo"] li, .job-title-info-list li'
            );

            jobInfoItems.forEach((item) => {
              const text = item.textContent.trim();

              if (text.includes("Hourly") || text.includes("Fixed-price")) {
                budget = text;
              }

              if (
                text.includes("Entry") ||
                text.includes("Intermediate") ||
                text.includes("Expert")
              ) {
                experienceLevel = text;
              }
            });

            // Posted time
            const rawPosted = getText(
              '[data-test="job-published-date"] small, small.text-light'
            );
            const posted = rawPosted
              ? rawPosted.replace("Posted ", "").trim()
              : "No posted time";

            // Skills
            const skills = Array.from(
              el.querySelectorAll('[data-test="token"] span, .air3-token span')
            ).map((skillEl) => skillEl.textContent.trim());

            // Client info
            const paymentText = getText(
              '[data-test="payment-verification-badge"]'
            );
            const paymentVerified =
              paymentText && paymentText.includes("Payment verified")
                ? "Verified"
                : "Unverified";

            const ratingText = getText(".air3-rating-value-text");
            const rating = ratingText ? `${ratingText} stars` : "No rating";

            const totalSpent =
              getText("[data-test='total-spent'] strong") ||
              "No total spent info";
            const location =
              getText("[data-test='location']") || "No location info";

            const clientInfo = `{Payment: ${paymentVerified} | Rating: ${rating} | Total Spent: ${totalSpent} | Location: ${location}}`;

            return {
              jobId,
              title,
              url,
              description,
              budget,
              experienceLevel,
              posted,
              skills,
              clientInfo,
            };
          });

          if (jobData && jobData.title) {
            jobs.push({
              id: jobs.length + 1,
              ...jobData,
              scrapedAt: new Date().toISOString(),
            });

            console.log(
              `✅ Job ${jobs.length}: [${
                jobData.jobId
              }] ${jobData.title.substring(0, 40)}...`
            );
          } else {
            console.log(`⚠️ Skipped job ${i + 1} - no valid title/data found.`);
          }

          await new Promise((resolve) =>
            setTimeout(resolve, Math.random() * (500 - 200) + 200)
          );
        } catch (err) {
          console.error(`Error scraping job ${i + 1}:`, err.message);
        }
      }
    } catch (error) {
      console.error("Error during scraping:", error.message);
    }

    return jobs;
  }

  // Close the browser
  async close() {
    try {
      if (this.browser) {
        await this.browser.close();
        console.log("Browser closed successfully.");
      }
    } catch (error) {
      console.error("Error occurred while closing the browser:", error.message);
    }
  }
}

module.exports = WorkingUpworkScraper_NoCookie;

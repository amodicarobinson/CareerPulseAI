import express from "express";
import { createServer as createViteServer } from "vite";
import { Resend } from "resend";
import path from "path";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Initialize Resend lazily
  let resend: Resend | null = null;
  const getResend = () => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn("RESEND_API_KEY is not set. Email notifications will be skipped.");
      return null;
    }
    if (!resend) {
      resend = new Resend(apiKey);
    }
    return resend;
  };

  // API Route for sending emails
  app.post("/api/notify-application", async (req, res) => {
    const { email, jobTitle, company, appliedAt, isAutoPilot } = req.body;

    if (!email || !jobTitle || !company) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const resendClient = getResend();
    if (!resendClient) {
      return res.status(500).json({ error: "Email service not configured (RESEND_API_KEY missing)" });
    }

    try {
      const subject = isAutoPilot 
        ? `⚡ Auto-Pilot Action: Application Prepared for ${jobTitle} @ ${company}`
        : `🚀 Application Submitted: ${jobTitle} @ ${company}`;

      const title = isAutoPilot ? "Auto-Pilot Execution" : "Submission Success!";
      const description = isAutoPilot 
        ? "Your match score was above 90%! AI has automatically tailored your resume and cover letter. They are ready for you in Mission Control."
        : "Your AI-tailored application has been submitted.";

      const { data, error } = await resendClient.emails.send({
        from: "CareerPulse AI <onboarding@resend.dev>",
        to: email,
        subject,
        html: `
          <div style="font-family: sans-serif; padding: 20px; color: #333;">
            <h1 style="color: #2563eb;">${title}</h1>
            <p>${description}</p>
            <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Role:</strong> ${jobTitle}</p>
              <p><strong>Company:</strong> ${company}</p>
              <p><strong>Status:</strong> ${isAutoPilot ? 'PREPPED & READY' : 'SUBMITTED'}</p>
              <p><strong>Date:</strong> ${new Date(appliedAt).toLocaleString()}</p>
            </div>
            ${isAutoPilot ? '<p style="color: #2563eb; font-weight: bold;">Final Action: Head to CareerPulse to open the portal and paste your docs!</p>' : ''}
            <p style="font-size: 12px; color: #666;">Sent automatically by CareerPulse AI Mission Control.</p>
          </div>
        `,
      });

      if (error) {
        return res.status(400).json({ error });
      }

      res.status(200).json({ success: true, data });
    } catch (err) {
      console.error("Failed to send email:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // API Route for URL validation
  app.post("/api/validate-url", async (req, res) => {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    try {
      // 1. Basic format check
      new URL(url);

      // 2. Accessibility check (HEAD request)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(url, {
          method: "HEAD",
          signal: controller.signal,
          headers: {
            "User-Agent": "CareerPulse-Bot/1.0",
          },
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          return res.status(200).json({ valid: true });
        } else {
          // If HEAD fails, try GET (some sites block HEAD)
          const getResponse = await fetch(url, {
            method: "GET",
            signal: controller.signal,
            headers: {
              "User-Agent": "CareerPulse-Bot/1.0",
            },
          });
          if (getResponse.ok) {
            return res.status(200).json({ valid: true });
          }
          return res.status(200).json({ 
            valid: false, 
            error: `URL returned status ${getResponse.status}` 
          });
        }
      } catch (fetchErr: any) {
        if (fetchErr.name === 'AbortError') {
          return res.status(200).json({ valid: false, error: "Validation timed out (URL might be slow or blocked)" });
        }
        return res.status(200).json({ valid: false, error: "URL is unreachable" });
      }
    } catch (err) {
      return res.status(200).json({ valid: false, error: "Invalid URL format" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

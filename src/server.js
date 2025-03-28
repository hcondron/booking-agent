import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { handleWebhook } from "./routes/whatsappWebhook.js";
import { handleStripeWebhook } from "./routes/stripeWebhook.js";
import { config } from "./config.js";

console.log("Environment variables loaded:", {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ? "Present" : "Missing",
  NODE_ENV: process.env.NODE_ENV,
});

// Create Express app
const app = express();

// Parse JSON bodies for API requests
app.use(bodyParser.json());

// Special handling for Stripe webhooks to get the raw body
app.use(
  "/webhook/stripe",
  bodyParser.raw({ type: "application/json" }),
  (req, res, next) => {
    req.rawBody = req.body;
    req.body = JSON.parse(req.rawBody);
    next();
  }
);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.all("/webhook/whatsapp", handleWebhook);
app.post("/webhook/stripe", handleStripeWebhook);

// Health check
app.get("/", (req, res) => {
  res.status(200).send({
    status: "OK",
    message: "WhatsApp AI Booking Agent API is running",
  });
});

// Start server
const PORT = config.app.port;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

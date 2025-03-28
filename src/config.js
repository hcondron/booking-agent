import dotenv from "dotenv";

dotenv.config();

console.log("OPENAI_API_KEY", process.env.OPENAI_API_KEY);

export const config = {
  app: {
    port: process.env.PORT || 3000,
    baseUrl: process.env.BASE_URL || "http://localhost:3000",
  },
  whatsapp: {
    apiVersion: process.env.WHATSAPP_API_VERSION || "v17.0",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  },
  booking: {
    price: parseInt(process.env.BOOKING_PRICE || "50"), // Default price in USD
    currency: process.env.BOOKING_CURRENCY || "usd",
  },
};

import { createLogger } from "@mastra/core/logger";
import { Mastra } from "@mastra/core/mastra";
import { bookingAgent } from "./agents/bookingAgent.js";

export const mastra = new Mastra({
  agents: { bookingAgent }, // Register the booking agent
  logger: createLogger({
    name: "Mastra",
    level: "info",
  }),
});

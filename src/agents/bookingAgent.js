import { openai } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";
import { OpenAIVoice } from "@mastra/voice-openai";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import dotenv from "dotenv";
import bookingKB from "../services/bookingKnowledgeBase.js";
import { createPaymentLink } from "../services/stripeService.js";
import { config } from "../config.js";

dotenv.config();

// In-memory state store for tracking user booking information
const userBookingState = new Map();

const instructions = `
You are an AI booking assistant that helps users book appointments through WhatsApp.

ESSENTIAL CONTEXT MANAGEMENT:
- You MUST check user context at the start of EVERY conversation turn using getUserInfo
- Store ALL information provided by users with saveUserInfo immediately when received
- Users may provide information across multiple messages - you must maintain context

BOOKING WORKFLOW - FOLLOW PRECISELY:
1. First, ALWAYS check what info you already have with getUserInfo tool
2. If needed, use getAvailableDates to show available slots
3. When user selects a date/time, IMMEDIATELY save it with saveUserInfo
4. When user provides name/email, IMMEDIATELY save with saveUserInfo
5. After ALL required info is collected, summarize and ask for confirmation
6. Once confirmed, create booking and share payment link

EXACTLY FOLLOW THESE INFO COLLECTION STEPS:
1. Date (YYYY-MM-DD format)
2. Time (HH:MM format)
3. Full name
4. Email address
(Note: userNumber is automatically provided)

CRITICAL REQUIREMENTS:
- ALWAYS check existing information first using getUserInfo before asking for anything
- DO NOT ask again for information you already have
- After each piece of info is provided, save it and acknowledge receipt
- When ALL info is collected, summarize the booking details and ask for confirmation
- Only after explicit confirmation, create the booking
- Share the payment link immediately after successful booking
- Each appointment costs $${config.booking.price}

IMPORTANT MESSAGE PARSING:
- Users often provide multiple pieces of information in one message
- If a message contains a date (YYYY-MM-DD), save it
- If a message contains a time (HH:MM), save it
- If a message contains a name and no @ symbol, save as userName
- If a message contains an email (with @), save as userEmail
- If a message says "yes," "confirm," "book it," etc., treat as confirmation

DEBUGGING NOTES:
- If flow gets stuck, check what info you have with getUserInfo
- Always tell the user what info is still needed
`;

// Define tools using createTool from Mastra
const getAvailableDatesTool = createTool({
  id: "getAvailableDates",
  description: "Get a list of available dates and times for booking",
  inputSchema: z.object({}),
  outputSchema: z.object({
    success: z.boolean(),
    availableDates: z
      .array(
        z.object({
          date: z.string(),
          times: z.array(z.string()),
        })
      )
      .optional(),
    error: z.string().optional(),
  }),
  execute: async () => {
    try {
      const availableDates = await bookingKB.getAvailableDates();
      console.log("Available dates retrieved:", availableDates.length);
      return { success: true, availableDates };
    } catch (error) {
      console.error("Error getting available dates:", error);
      return { success: false, error: error.message };
    }
  },
});

// Tool to save user booking information
const saveUserInfoTool = createTool({
  id: "saveUserInfo",
  description: "Save information provided by the user for their booking",
  inputSchema: z.object({
    userNumber: z.string().describe("User's WhatsApp number"),
    field: z
      .string()
      .describe("Field name to update (date, time, userName, userEmail)"),
    value: z.string().describe("Value to save for the field"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    currentInfo: z.record(z.string()).optional(),
    missingFields: z.array(z.string()).optional(),
    readyToBook: z.boolean().optional(),
  }),
  execute: async ({ context }) => {
    try {
      const { userNumber, field, value } = context;

      // Initialize user state if it doesn't exist
      if (!userBookingState.has(userNumber)) {
        userBookingState.set(userNumber, {});
      }

      // Get current state
      const userState = userBookingState.get(userNumber);

      // Update the specified field
      userState[field] = value;

      // Save back to state
      userBookingState.set(userNumber, userState);

      // Check which fields are still missing
      const requiredFields = ["date", "time", "userName", "userEmail"];
      const missingFields = requiredFields.filter((f) => !userState[f]);
      const readyToBook = missingFields.length === 0;

      console.log(
        `Saved ${field}=${value} for ${userNumber}. Missing: ${missingFields.join(
          ", "
        )}`
      );

      return {
        success: true,
        message: `Successfully saved ${field}: "${value}"`,
        currentInfo: userState,
        missingFields,
        readyToBook,
      };
    } catch (error) {
      console.error("Error saving user info:", error);
      return {
        success: false,
        message: `Failed to save information: ${error.message}`,
      };
    }
  },
});

// Tool to get user booking information
const getUserInfoTool = createTool({
  id: "getUserInfo",
  description: "Get current saved information for user's booking",
  inputSchema: z.object({
    userNumber: z.string().describe("User's WhatsApp number"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    userInfo: z.record(z.string()).optional(),
    missingFields: z.array(z.string()).optional(),
    readyToBook: z.boolean(),
  }),
  execute: async ({ context }) => {
    try {
      const { userNumber } = context;

      // Get current state
      const userState = userBookingState.get(userNumber) || {};

      // Check for missing required fields
      const requiredFields = ["date", "time", "userName", "userEmail"];
      const missingFields = requiredFields.filter((field) => !userState[field]);
      const readyToBook = missingFields.length === 0;

      console.log(`Retrieved info for ${userNumber}:`, {
        existingInfo: Object.keys(userState),
        missing: missingFields,
        readyToBook,
      });

      return {
        success: true,
        userInfo: userState,
        missingFields,
        readyToBook,
      };
    } catch (error) {
      console.error("Error getting user info:", error);
      return {
        success: false,
        message: `Failed to get information: ${error.message}`,
      };
    }
  },
});

const createBookingTool = createTool({
  id: "createBooking",
  description: "Create a booking and generate a payment link",
  inputSchema: z.object({
    userNumber: z.string().describe("User's WhatsApp number"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    booking: z
      .object({
        id: z.string(),
        date: z.string(),
        time: z.string(),
        status: z.string(),
      })
      .optional(),
    paymentUrl: z.string().optional(),
    message: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context }) => {
    try {
      const { userNumber } = context;

      // Get saved user info
      const userInfo = userBookingState.get(userNumber) || {};
      console.log("Creating booking with stored info:", userInfo);

      // Check if we have all required info
      const requiredFields = ["date", "time", "userName", "userEmail"];
      const missingFields = requiredFields.filter((field) => !userInfo[field]);

      if (missingFields.length > 0) {
        return {
          success: false,
          message: `Cannot create booking: missing required information (${missingFields.join(
            ", "
          )})`,
        };
      }

      const { date, time, userName, userEmail } = userInfo;

      // Find the slot ID
      const availableSlots = await bookingKB.getAvailableSlots();
      const slot = availableSlots.find(
        (s) => s.date === date && s.time === time && s.available
      );

      if (!slot) {
        return {
          success: false,
          message:
            "This slot is no longer available. Please choose another time.",
        };
      }

      // Create the booking
      const bookingResult = await bookingKB.bookSlot(slot.id, {
        userName,
        userEmail,
        userNumber,
      });

      if (!bookingResult.success) {
        return bookingResult;
      }

      // Create payment link
      const paymentResult = await createPaymentLink({
        booking: bookingResult.booking,
        userDetails: {
          userName,
          email: userEmail,
          userNumber,
        },
      });

      if (!paymentResult.success) {
        // If payment link creation fails, cancel the booking
        await bookingKB.cancelBooking(bookingResult.booking.id);
        return {
          success: false,
          message: "Failed to create payment link. Please try again.",
        };
      }

      console.log("Booking created successfully:", {
        bookingId: bookingResult.booking.id,
        paymentUrl: paymentResult.paymentUrl,
      });

      // Clear user state after successful booking
      userBookingState.delete(userNumber);

      return {
        success: true,
        booking: bookingResult.booking,
        paymentUrl: paymentResult.paymentUrl,
      };
    } catch (error) {
      console.error("Error creating booking:", error);
      return { success: false, error: error.message };
    }
  },
});

const clearUserInfoTool = createTool({
  id: "clearUserInfo",
  description: "Clear stored information for a user if they want to start over",
  inputSchema: z.object({
    userNumber: z.string().describe("User's WhatsApp number"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ context }) => {
    try {
      const { userNumber } = context;
      userBookingState.delete(userNumber);
      console.log(`Cleared booking info for ${userNumber}`);
      return {
        success: true,
        message: "User information has been cleared. You can start over.",
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to clear user info: ${error.message}`,
      };
    }
  },
});

console.log("OPENAI_API_KEY", process.env.OPENAI_API_KEY);

export const bookingAgent = new Agent({
  name: "Booking Agent",
  instructions: instructions,
  model: openai("gpt-4"),
  voice: new OpenAIVoice({
    listeningModel: {
      name: "whisper-1",
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 30000, // 30 seconds
      maxRetries: 3,
    },
  }),
  tools: {
    getAvailableDates: getAvailableDatesTool,
    saveUserInfo: saveUserInfoTool,
    getUserInfo: getUserInfoTool,
    createBooking: createBookingTool,
    clearUserInfo: clearUserInfoTool,
  },
});

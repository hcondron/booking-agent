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

const instructions = `
You are an AI booking assistant that helps users book appointments.

BOOKING WORKFLOW:
1. When a user wants to book, first use getAvailableDates to check available slots
2. Once user selects a specific date and time, collect their full name and email
3. When you have all required information (date, time, name, email), use createBooking to create the booking
4. Share the payment link with the user and explain they need to complete payment to confirm
5. The booking is only confirmed after payment is made

IMPORTANT GUIDELINES:
- Always collect ALL required information before attempting to create a booking
- Required fields: date (YYYY-MM-DD), time (HH:MM), userName, userEmail, userNumber
- Only proceed to booking creation when you have confirmed all details with the user
- After creating a booking, immediately share the payment link
- Be clear that the slot is temporarily reserved but will only be confirmed after payment
- Each appointment costs $${config.booking.price}
- Track what information you've already collected from the user
- Do not ask for the same information multiple times

If you encounter errors creating the booking:
- Clearly explain the issue to the user
- Try to resolve it by suggesting alternatives (different time/date)

Remember user context between messages and don't repeatedly ask for information you already have.
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
      return { success: true, availableDates };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
});

const createBookingTool = createTool({
  id: "createBooking",
  description: "Create a booking and generate a payment link",
  inputSchema: z.object({
    date: z.string().describe("Date in YYYY-MM-DD format"),
    time: z.string().describe("Time in HH:MM format"),
    userName: z.string().describe("User's full name"),
    userEmail: z.string().describe("User's email address"),
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
      const { date, time, userName, userEmail, userNumber } = context;
      console.log("Creating booking with:", {
        date,
        time,
        userName,
        userEmail,
        userNumber,
      });

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

const getUserBookingsTool = createTool({
  id: "getUserBookings",
  description: "Get a list of bookings for a user",
  inputSchema: z.object({
    userNumber: z.string().describe("User's WhatsApp number"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    bookings: z
      .array(
        z.object({
          id: z.string(),
          date: z.string(),
          time: z.string(),
          status: z.string(),
        })
      )
      .optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context }) => {
    try {
      const bookings = await bookingKB.getBookingsByUser(context.userNumber);
      return { success: true, bookings };
    } catch (error) {
      return { success: false, error: error.message };
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
    createBooking: createBookingTool,
    getUserBookings: getUserBookingsTool,
  },
});

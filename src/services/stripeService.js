import Stripe from "stripe";
import { config } from "../config.js";

const stripe = new Stripe(config.stripe.secretKey);

export async function createPaymentLink(bookingDetails) {
  try {
    const { booking, userDetails } = bookingDetails;

    // Format date and time for display
    const dateObj = new Date(booking.date + "T" + booking.time);
    const formattedDateTime = dateObj.toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    });

    // Create a payment link
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Appointment Booking`,
              description: `Booking for ${formattedDateTime}`,
            },
            unit_amount: config.booking.price * 100, // Price in cents
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${config.app.baseUrl}/booking/success?session_id={CHECKOUT_SESSION_ID}&booking_id=${booking.id}`,
      cancel_url: `${config.app.baseUrl}/booking/cancel?booking_id=${booking.id}`,
      client_reference_id: booking.id,
      customer_email: userDetails.email,
      metadata: {
        bookingId: booking.id,
        userNumber: userDetails.userNumber,
        userName: userDetails.userName,
        bookingDate: booking.date,
        bookingTime: booking.time,
      },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // Expires in 30 minutes
    });

    return {
      success: true,
      paymentUrl: session.url,
      sessionId: session.id,
    };
  } catch (error) {
    console.error("Error creating payment link:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function verifyPayment(sessionId) {
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === "paid") {
      return {
        success: true,
        bookingId: session.metadata.bookingId,
        paymentDetails: {
          amount: session.amount_total / 100,
          currency: session.currency,
          paymentId: session.payment_intent,
          paymentStatus: session.payment_status,
          paidAt: new Date().toISOString(),
        },
      };
    } else {
      return {
        success: false,
        message: `Payment not completed. Status: ${session.payment_status}`,
      };
    }
  } catch (error) {
    console.error("Error verifying payment:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

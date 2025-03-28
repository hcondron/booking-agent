import { verifyPayment } from "../services/stripeService.js";
import bookingKB from "../services/bookingKnowledgeBase.js";
import { sendWhatsAppMessage } from "../services/whatsappService.js";
import { config } from "../config.js";
import Stripe from "stripe";

const stripe = new Stripe(config.stripe.secretKey);

export async function handleStripeWebhook(req, res) {
  const signature = req.headers["stripe-signature"];

  try {
    // Verify the webhook signature
    const event = stripe.webhooks.constructEvent(
      req.rawBody, // You need to ensure the raw body is available
      signature,
      config.stripe.webhookSecret
    );

    // Handle the event
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutComplete(event.data.object);
        break;

      case "checkout.session.expired":
        await handleCheckoutExpired(event.data.object);
        break;

      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.status(200).send({ received: true });
  } catch (err) {
    console.error(`Webhook Error: ${err.message}`);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
}

async function handleCheckoutComplete(session) {
  try {
    const bookingId = session.metadata.bookingId;
    const userNumber = session.metadata.userNumber;

    // Verify payment and confirm booking
    const paymentResult = await verifyPayment(session.id);

    if (paymentResult.success) {
      const result = await bookingKB.confirmBooking(
        bookingId,
        paymentResult.paymentDetails
      );

      if (result.success) {
        // Format date and time for display
        const booking = result.booking;
        const dateObj = new Date(booking.date + "T" + booking.time);
        const formattedDateTime = dateObj.toLocaleString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "numeric",
        });

        // Send confirmation message to user
        await sendWhatsAppMessage(
          userNumber,
          `🎉 Your booking is confirmed! \n\nDate and time: ${formattedDateTime}\n\nBooking ID: ${booking.id}\n\nThank you for your payment. We look forward to seeing you!`
        );
      }
    }
  } catch (error) {
    console.error("Error handling checkout complete:", error);
  }
}

async function handleCheckoutExpired(session) {
  try {
    const bookingId = session.metadata.bookingId;
    const userNumber = session.metadata.userNumber;

    // Cancel the booking
    const result = await bookingKB.cancelBooking(bookingId);

    if (result.success) {
      // Send notification to user
      await sendWhatsAppMessage(
        userNumber,
        `Your payment session for booking ID ${bookingId} has expired. The time slot has been released. Please make a new booking if you still wish to schedule an appointment.`
      );
    }
  } catch (error) {
    console.error("Error handling checkout expired:", error);
  }
}

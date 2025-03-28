import { Readable } from "node:stream";
import { mastra } from "../mastra.js";
import {
  downloadMedia,
  sendWhatsAppMessage,
} from "../services/whatsappService.js";

// Get the booking agent from the Mastra instance
const bookingAgent = mastra.getAgent("bookingAgent");

export async function handleWebhook(req, res) {
  try {
    // Verify webhook
    if (req.method === "GET") {
      // WhatsApp verification challenge
      const mode = req.query["hub.mode"];
      const token = req.query["hub.verify_token"];
      const challenge = req.query["hub.challenge"];

      // Verify with a token you set
      if (mode === "subscribe" && token === process.env.WEBHOOK_VERIFY_TOKEN) {
        return res.status(200).send(challenge);
      } else {
        return res.status(403).send("Verification failed");
      }
    }

    // Handle incoming messages
    if (req.method === "POST") {
      const body = req.body;

      // Check if this is a WhatsApp message
      if (
        body.object &&
        body.entry &&
        body.entry[0].changes &&
        body.entry[0].changes[0].value.messages &&
        body.entry[0].changes[0].value.messages.length > 0
      ) {
        const message = body.entry[0].changes[0].value.messages[0];
        const userNumber = message.from; // User's phone number

        // Get user profile info if available
        const userProfile =
          body.entry[0].changes[0].value.contacts?.[0]?.profile || {};
        const userName = userProfile.name || "Customer";

        if (message.type === "audio" || message.type === "voice") {
          try {
            console.log("Processing voice message");
            // Download the audio file
            const mediaId = message.audio ? message.audio.id : message.voice.id;
            const audioBuffer = await downloadMedia(mediaId);
            const audioStream = Readable.from(audioBuffer);

            // Transcribe the audio using the agent's voice capability
            const text = await bookingAgent.voice.listen(audioStream);
            console.log("Transcribed text:", text);

            if (text) {
              // Process the transcribed text with the agent
              const agentResponse = await bookingAgent.generate(text);

              console.log("Agent response:", agentResponse);

              // Extract just the text content from the response
              const messageText =
                typeof agentResponse === "string"
                  ? agentResponse
                  : agentResponse.text || agentResponse.toString();

              await sendWhatsAppMessage(userNumber, messageText);
            } else {
              await sendWhatsAppMessage(
                userNumber,
                "Sorry, I couldn't understand your voice message. Could you please try again?"
              );
            }
          } catch (error) {
            console.error("Error processing voice message:", error);
            await sendWhatsAppMessage(
              userNumber,
              "I'm having trouble processing your voice message. Could you please try sending your message as text?"
            );
          }
          return res.status(200).send("OK");
        } else if (message.type === "text") {
          // Process text messages directly
          const text = message.text.body;
          console.log("Processing text message:", text);

          try {
            const agentResponse = await bookingAgent.message(text);

            console.log("Agent response:", agentResponse);

            // Extract the response text
            const messageText =
              typeof agentResponse === "string"
                ? agentResponse
                : agentResponse.text || agentResponse.toString();

            await sendWhatsAppMessage(userNumber, messageText);
          } catch (error) {
            console.error("Error processing text message:", error);
            await sendWhatsAppMessage(
              userNumber,
              "I'm having trouble processing your message. Please try again or contact support."
            );
          }
        }

        return res.status(200).send("OK");
      }
    }

    return res.status(400).send("Bad request");
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(500).send("Internal server error");
  }
}

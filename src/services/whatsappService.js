import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_API_URL = `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`;

export async function sendWhatsAppMessage(to, response) {
  const messageText =
    typeof response === "string" ? response : response.toString();

  console.log("messageText", messageText);
  try {
    // Extract just the text content if it's a complex response object

    const apiResponse = await axios.post(
      WHATSAPP_API_URL,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to,
        type: "text",
        text: {
          body: messageText,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_API_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    return apiResponse.data;
  } catch (error) {
    console.error(
      "Error sending WhatsApp message:",
      error.response?.data || error.message
    );
    throw error;
  }
}

export async function downloadMedia(mediaId) {
  try {
    const mediaUrl = `https://graph.facebook.com/v17.0/${mediaId}`;

    // First, get the media URL
    const mediaInfoResponse = await axios.get(mediaUrl, {
      headers: {
        Authorization: `Bearer ${WHATSAPP_API_TOKEN}`,
      },
    });

    // Then download the actual media
    const mediaResponse = await axios.get(mediaInfoResponse.data.url, {
      headers: {
        Authorization: `Bearer ${WHATSAPP_API_TOKEN}`,
      },
      responseType: "arraybuffer",
    });

    return Buffer.from(mediaResponse.data);
  } catch (error) {
    console.error(
      "Error downloading media:",
      error.response?.data || error.message
    );
    throw error;
  }
}

# WhatsApp AI Booking Agent

An AI-powered booking agent that runs on WhatsApp, built with Node.js and the Mastra framework.

## Features

- Listens for voice messages from users via a WhatsApp webhook
- Uses OpenAI's Speech-to-Text to transcribe voice messages
- Processes the transcribed text with an AI agent to find available slots
- Sends responses back to the user via WhatsApp
- Handles both voice and text messages

## Prerequisites

- Node.js (v16 or higher)
- An OpenAI API key
- A WhatsApp Business API account
- A publicly accessible URL for the webhook (e.g., using ngrok for development)

## Setup

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file with the following variables:
   ```
   OPENAI_API_KEY=your_openai_api_key
   WHATSAPP_API_TOKEN=your_whatsapp_api_token
   WHATSAPP_PHONE_NUMBER_ID=your_whatsapp_phone_number_id
   WEBHOOK_VERIFY_TOKEN=your_webhook_verify_token
   PORT=3000
   ```
4. Start the server:
   ```
   npm start
   ```

## WhatsApp API Setup

1. Register for the WhatsApp Business API
2. Create a WhatsApp Business App in the Meta Developer Dashboard
3. Set up a webhook with your verification token
4. Subscribe to relevant webhook events (messages, message_acks, etc.)
5. Configure your app to point to your server's webhook URL

## Development

For local development, you can use ngrok to expose your local server:

```
ngrok http 3000
```

Then update your webhook URL in the Meta Developer Dashboard to the ngrok URL.

## Available Booking Slots

The current implementation has the following available slots:

- Monday: 9:00 AM, 11:00 AM, 2:00 PM, 4:00 PM
- Tuesday: 10:00 AM, 12:00 PM, 3:00 PM
- Wednesday: 9:00 AM, 1:00 PM, 3:00 PM, 5:00 PM
- Thursday: 11:00 AM, 2:00 PM, 4:00 PM
- Friday: 9:00 AM, 12:00 PM, 2:00 PM, 4:00 PM

You can modify these slots in the `src/agents/bookingAgent.js` file.

## License

ISC

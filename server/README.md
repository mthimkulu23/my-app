# Relay API

This service owns MongoDB access, user authentication, chat persistence, Twilio Voice access tokens, and call logs. Keep its `.env` file on the server only; never use Expo `EXPO_PUBLIC_` variables for secrets.

## Local setup

1. Copy `.env.example` to `.env` and set `MONGODB_URI` and a randomly generated `JWT_SECRET` of at least 32 characters.
	Set `AGENT_EMAILS` to a comma-separated list of trusted agent email addresses. Users on this list receive the agent role when they register or next sign in; all other registrations are customers.
2. For WhatsApp demo messaging, create a Meta developer app with the WhatsApp use case and use its test phone number. Add the test recipient in Meta API Setup, then configure `META_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, and `WHATSAPP_GRAPH_API_VERSION` on the server.
3. Expose the local API through an HTTPS tunnel. In the Meta app's WhatsApp webhook settings, use `https://<public-api-host>/webhooks/whatsapp`, enter the same `WHATSAPP_VERIFY_TOKEN`, and subscribe to the `messages` field. Meta signs webhook POSTs with the app secret.
4. A customer sends the first WhatsApp message to the Meta test number; the webhook creates a WhatsApp conversation in MongoDB for agents. Agents reply from Relay. Free-form replies are supported during WhatsApp's 24-hour customer service window; outside it, an approved template is required and is not implemented here.
5. To retain voice calling, separately configure `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_AUTH_TOKEN`, `TWILIO_TWIML_APP_SID`, and `TWILIO_CALLER_ID`. Configure the TwiML App's Voice URL as `https://<public-api-host>/webhooks/twilio/voice`.
6. Run `npm install` and `npm run dev` from this directory.

The API uses password hashing, short-lived bearer sessions, per-user authorization for internal conversations and call history, agent-only WhatsApp inbox access, request validation, rate limits, secure HTTP headers, and provider webhook-signature checks. Production deployment must use HTTPS and a managed secrets store. Configure Twilio geographic permissions and spend limits before enabling outbound calls.

Chat content is stored as ordinary application data in MongoDB: TLS protects it in transit and Atlas encryption-at-rest protects stored data, but the API can read message text. This is not end-to-end encryption. Twilio Voice uses Twilio's encrypted voice transport, but calls are not end-to-end encrypted between the two devices. Do not promise absolute interception prevention.
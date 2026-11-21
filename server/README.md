# Relay API

This service owns MongoDB access, user authentication, chat persistence, Twilio Voice access tokens, and call logs. Keep its `.env` file on the server only; never use Expo `EXPO_PUBLIC_` variables for secrets.

## Local setup

1. Copy `.env.example` to `.env` and set `MONGODB_URI` and a randomly generated `JWT_SECRET` of at least 32 characters.
2. Set up a Twilio API key, Voice TwiML App, and Twilio phone number. Configure the TwiML App's Voice URL as `https://<public-api-host>/webhooks/twilio/voice`.
3. Configure `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_AUTH_TOKEN`, `TWILIO_TWIML_APP_SID`, and `TWILIO_CALLER_ID` on the server.
4. Expose the local API through an HTTPS tunnel for Twilio webhooks and set `PUBLIC_URL` to that exact HTTPS origin. Twilio signs webhook requests against this URL.
5. Run `npm install` and `npm run dev` from this directory.

The API uses password hashing, short-lived bearer sessions, per-user authorization for conversations and call history, request validation, rate limits, secure HTTP headers, and Twilio request-signature checks. Production deployment must use HTTPS and a managed secrets store. Configure Twilio geographic permissions and spend limits before enabling outbound calls.

Chat content is stored as ordinary application data in MongoDB: TLS protects it in transit and Atlas encryption-at-rest protects stored data, but the API can read message text. This is not end-to-end encryption. Twilio Voice uses Twilio's encrypted voice transport, but calls are not end-to-end encrypted between the two devices. Do not promise absolute interception prevention.
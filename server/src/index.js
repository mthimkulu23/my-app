import bcrypt from 'bcryptjs';
import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import twilio from 'twilio';
import { z } from 'zod';
import { CallLog, Conversation, Message, User } from './models.js';

const app = express();
const port = Number(process.env.PORT || 4000);
const jwtSecret = process.env.JWT_SECRET;
const publicUrl = process.env.PUBLIC_URL?.replace(/\/$/, '');
const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean);
const agentEmails = new Set((process.env.AGENT_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));

if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
if (!jwtSecret || jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
if (process.env.NODE_ENV === 'production' && !publicUrl?.startsWith('https://')) {
  throw new Error('PUBLIC_URL must use HTTPS in production');
}

app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    const isLocalDevelopmentOrigin = process.env.NODE_ENV !== 'production'
      && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || '');
    if (!origin || allowedOrigins.includes(origin) || isLocalDevelopmentOrigin) return callback(null, true);
    return callback(new Error('Origin is not allowed'));
  },
}));
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));

const authLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });
const callLimiter = rateLimit({ windowMs: 60_000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false });
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const error = new Error(result.error.issues[0]?.message || 'Invalid request');
    error.status = 400;
    throw error;
  }
  return result.data;
}

function issueSession(user) {
  return jwt.sign({ sub: user.id }, jwtSecret, { expiresIn: '1h', issuer: 'relay-api', audience: 'relay-app' });
}

function requireAuth(req, res, next) {
  const authorization = req.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const claims = jwt.verify(token, jwtSecret, { issuer: 'relay-api', audience: 'relay-app' });
    req.userId = claims.sub;
    return next();
  } catch {
    return res.status(401).json({ error: 'Session expired or invalid' });
  }
}

function requireTwilioConfig() {
  const names = [
    'TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY_SID', 'TWILIO_API_KEY_SECRET',
    'TWILIO_AUTH_TOKEN', 'TWILIO_TWIML_APP_SID', 'TWILIO_CALLER_ID', 'PUBLIC_URL',
  ];
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length) {
    const error = new Error(`Voice calling is not configured on the server: ${missing.join(', ')}`);
    error.status = 503;
    throw error;
  }
}

function verifyTwilioRequest(req) {
  requireTwilioConfig();
  const signature = req.get('x-twilio-signature') || '';
  const url = `${publicUrl}${req.originalUrl}`;
  if (!twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN, signature, url, req.body)) {
    const error = new Error('Invalid Twilio signature');
    error.status = 403;
    throw error;
  }
}

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.post('/auth/register', authLimiter, asyncRoute(async (req, res) => {
  const body = parse(z.object({
    displayName: z.string().trim().min(1).max(80),
    email: z.email().max(254),
    password: z.string().min(12).max(128),
  }).strict(), req.body);
  const email = body.email.toLowerCase();
  if (await User.exists({ email })) return res.status(409).json({ error: 'An account with that email already exists' });
  const user = await User.create({
    displayName: body.displayName,
    email,
    passwordHash: await bcrypt.hash(body.password, 12),
    role: agentEmails.has(email) ? 'agent' : 'customer',
    presence: { online: true, lastSeenAt: new Date() },
  });
  return res.status(201).json({ token: issueSession(user), user: { id: user.id, displayName: user.displayName, email: user.email, role: user.role } });
}));

app.post('/auth/login', authLimiter, asyncRoute(async (req, res) => {
  const body = parse(z.object({ email: z.email().max(254), password: z.string().min(1).max(128) }).strict(), req.body);
  const user = await User.findOne({ email: body.email.toLowerCase() }).select('+passwordHash');
  if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
    return res.status(401).json({ error: 'Email or password is incorrect' });
  }
  if (agentEmails.has(user.email)) user.role = 'agent';
  user.presence = { online: true, lastSeenAt: new Date() };
  await user.save();
  return res.json({ token: issueSession(user), user: { id: user.id, displayName: user.displayName, email: user.email, role: user.role } });
}));

app.get('/api/me', requireAuth, asyncRoute(async (req, res) => {
  const user = await User.findById(req.userId).select('displayName email role');
  if (!user) return res.status(401).json({ error: 'Account no longer exists' });
  return res.json({ id: user.id, displayName: user.displayName, email: user.email, role: user.role });
}));

app.get('/api/agents', requireAuth, asyncRoute(async (req, res) => {
  const onlineSince = new Date(Date.now() - 90_000);
  const agents = await User.find({ role: 'agent' })
    .select('displayName presence.online presence.lastSeenAt').sort({ displayName: 1 }).lean();
  const directory = agents.map((agent) => {
    const lastSeenAt = agent.presence?.lastSeenAt ?? null;
    return {
      id: String(agent._id),
      displayName: agent.displayName,
      online: Boolean(agent.presence?.online && lastSeenAt && lastSeenAt >= onlineSince),
      lastSeenAt,
    };
  }).sort((left, right) => Number(right.online) - Number(left.online) || left.displayName.localeCompare(right.displayName));
  return res.json(directory);
}));

app.put('/api/presence', requireAuth, asyncRoute(async (req, res) => {
  const user = await User.findByIdAndUpdate(req.userId, {
    $set: { 'presence.online': true, 'presence.lastSeenAt': new Date() },
  }, { new: true }).select('_id');
  if (!user) return res.status(401).json({ error: 'Account no longer exists' });
  return res.sendStatus(204);
}));

app.post('/api/presence/offline', requireAuth, asyncRoute(async (req, res) => {
  await User.findByIdAndUpdate(req.userId, { $set: { 'presence.online': false } });
  return res.sendStatus(204);
}));

app.get('/api/conversations', requireAuth, asyncRoute(async (req, res) => {
  const conversations = await Conversation.find({ participantIds: req.userId })
    .sort({ lastMessageAt: -1, updatedAt: -1 })
    .populate('participantIds', 'displayName');
  return res.json(conversations.map((conversation) => ({
    id: conversation.id,
    participants: conversation.participantIds,
    lastMessageText: conversation.lastMessageText,
    lastMessageAt: conversation.lastMessageAt,
  })));
}));

app.post('/api/conversations', requireAuth, asyncRoute(async (req, res) => {
  const body = parse(z.union([
    z.object({ userId: z.string().min(1) }).strict(),
    z.object({ email: z.email().max(254) }).strict(),
  ]), req.body);
  const peer = 'userId' in body
    ? (mongoose.isValidObjectId(body.userId) ? await User.findById(body.userId).select('_id displayName') : null)
    : await User.findOne({ email: body.email.toLowerCase() }).select('_id displayName');
  if (!peer) return res.status(404).json({ error: 'No account found for that email' });
  if (peer.id === req.userId) return res.status(400).json({ error: 'You cannot start a conversation with yourself' });
  const participantIds = [req.userId, peer.id].sort();
  const participantKey = participantIds.join(':');
  const conversation = await Conversation.findOneAndUpdate(
    { participantKey },
    { $setOnInsert: { participantIds, participantKey } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).populate('participantIds', 'displayName');
  return res.status(200).json({ id: conversation.id, participants: conversation.participantIds, lastMessageText: conversation.lastMessageText, lastMessageAt: conversation.lastMessageAt });
}));

async function findAccessibleConversation(conversationId, userId) {
  if (!mongoose.isValidObjectId(conversationId)) return null;
  return Conversation.findOne({ _id: conversationId, participantIds: userId });
}

app.get('/api/conversations/:conversationId/messages', requireAuth, asyncRoute(async (req, res) => {
  const conversation = await findAccessibleConversation(req.params.conversationId, req.userId);
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
  const messages = await Message.find({ conversationId: conversation.id })
    .sort({ createdAt: -1 }).limit(100).populate('senderId', 'displayName');
  return res.json(messages.reverse().map((message) => ({
    id: message.id,
    senderId: message.senderId.id,
    senderName: message.senderId.displayName,
    text: message.text,
    createdAt: message.createdAt,
  })));
}));

app.post('/api/conversations/:conversationId/messages', requireAuth, asyncRoute(async (req, res) => {
  const conversation = await findAccessibleConversation(req.params.conversationId, req.userId);
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
  const { text } = parse(z.object({ text: z.string().trim().min(1).max(4000) }).strict(), req.body);
  const message = await Message.create({ conversationId: conversation.id, senderId: req.userId, text });
  conversation.lastMessageText = text;
  conversation.lastMessageAt = message.createdAt;
  await conversation.save();
  const sender = await User.findById(req.userId).select('displayName');
  return res.status(201).json({ id: message.id, senderId: req.userId, senderName: sender.displayName, text, createdAt: message.createdAt });
}));

app.get('/api/calls', requireAuth, asyncRoute(async (req, res) => {
  const calls = await CallLog.find({ ownerId: req.userId }).sort({ startedAt: -1 }).limit(100).lean();
  return res.json(calls.map(({ _id, ownerId, __v, ...call }) => ({ id: _id, ...call })));
}));

app.post('/api/calls/token', requireAuth, callLimiter, asyncRoute(async (req, res) => {
  requireTwilioConfig();
  const identity = req.userId;
  const token = new twilio.jwt.AccessToken(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_API_KEY_SID,
    process.env.TWILIO_API_KEY_SECRET,
    { identity, ttl: 3600 },
  );
  token.addGrant(new twilio.jwt.AccessToken.VoiceGrant({
    outgoingApplicationSid: process.env.TWILIO_TWIML_APP_SID,
    incomingAllow: false,
  }));
  return res.json({ token: token.toJwt(), identity, expiresIn: 3600 });
}));

app.post('/webhooks/twilio/voice', asyncRoute(async (req, res) => {
  verifyTwilioRequest(req);
  const identity = String(req.body.From || '').replace(/^client:/, '');
  const destination = String(req.body.To || '');
  if (!mongoose.isValidObjectId(identity) || !/^\+[1-9]\d{7,14}$/.test(destination)) {
    return res.status(400).type('text/plain').send('Invalid call identity or destination');
  }
  const user = await User.findById(identity).select('_id');
  if (!user) return res.status(403).type('text/plain').send('Unknown caller');
  const callSid = String(req.body.CallSid || '');
  if (!callSid.startsWith('CA')) return res.status(400).type('text/plain').send('Invalid call SID');
  await CallLog.updateOne(
    { callSid },
    { $setOnInsert: { ownerId: user.id, callSid, from: process.env.TWILIO_CALLER_ID, to: destination, status: 'initiated', startedAt: new Date() } },
    { upsert: true },
  );
  const response = new twilio.twiml.VoiceResponse();
  const dial = response.dial({ callerId: process.env.TWILIO_CALLER_ID });
  dial.number({
    statusCallback: `${publicUrl}/webhooks/twilio/status`,
    statusCallbackMethod: 'POST',
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
  }, destination);
  return res.type('text/xml').send(response.toString());
}));

app.post('/webhooks/twilio/status', asyncRoute(async (req, res) => {
  verifyTwilioRequest(req);
  const callSid = String(req.body.ParentCallSid || req.body.CallSid || '');
  const status = String(req.body.CallStatus || '').toLowerCase();
  const allowedStatuses = new Set(['initiated', 'ringing', 'in-progress', 'completed', 'busy', 'failed', 'no-answer', 'canceled']);
  if (!callSid.startsWith('CA') || !allowedStatuses.has(status)) return res.sendStatus(204);
  const update = { status };
  if (status === 'in-progress') update.answeredAt = new Date();
  if (['completed', 'busy', 'failed', 'no-answer', 'canceled'].includes(status)) update.endedAt = new Date();
  if (/^\d+$/.test(String(req.body.CallDuration || ''))) update.durationSeconds = Number(req.body.CallDuration);
  await CallLog.updateOne({ callSid }, { $set: update });
  return res.sendStatus(204);
}));

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = Number(error.status) || (error.code === 11000 ? 409 : 500);
  if (status >= 500) console.error(error);
  return res.status(status).json({ error: status >= 500 ? 'Unexpected server error' : error.message });
});

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
app.listen(port, '0.0.0.0', () => console.log(`Relay API listening on port ${port}`));
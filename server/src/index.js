import bcrypt from 'bcryptjs';
import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import twilio from 'twilio';
import { z } from 'zod';
import { AgentShift, CallLog, Conversation, Message, User } from './models.js';

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
app.use(express.json({
  limit: '1mb',
  verify(req, _res, buffer) {
    req.rawBody = Buffer.from(buffer);
  },
}));
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
  const unconfigured = names.filter((name) => {
    const value = process.env[name]?.trim() || '';
    return !value || /replace-with|x{4,}|example|placeholder/i.test(value)
      || (name === 'TWILIO_CALLER_ID' && value === '+10000000000');
  });
  if (unconfigured.length) {
    const error = new Error(`Voice calling is not configured with real Twilio values: ${unconfigured.join(', ')}`);
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

function verifyWhatsAppRequest(req) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    const error = new Error('WhatsApp webhook is not configured on the server');
    error.status = 503;
    throw error;
  }
  const signature = Buffer.from(req.get('x-hub-signature-256') || '');
  const expected = Buffer.from(`sha256=${createHmac('sha256', appSecret).update(req.rawBody || Buffer.alloc(0)).digest('hex')}`);
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) {
    const error = new Error('Invalid WhatsApp webhook signature');
    error.status = 403;
    throw error;
  }
}

function getWhatsAppMessageText(message) {
  if (message.type === 'text') return String(message.text?.body || '').trim();
  if (message.type === 'button') return String(message.button?.text || message.button?.payload || 'Button reply');
  if (message.type === 'interactive') {
    return String(message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || 'Interactive reply');
  }
  return `[${String(message.type || 'unsupported')} message received]`;
}

async function sendWhatsAppText(conversation, text) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const apiVersion = process.env.WHATSAPP_GRAPH_API_VERSION || 'v23.0';
  const missing = [
    ['WHATSAPP_PHONE_NUMBER_ID', phoneNumberId],
    ['WHATSAPP_ACCESS_TOKEN', accessToken],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) {
    const error = new Error(`WhatsApp sending is not configured: ${missing.join(', ')}`);
    error.status = 503;
    throw error;
  }
  if (!conversation.lastInboundAt || Date.now() - conversation.lastInboundAt.getTime() >= 24 * 60 * 60 * 1000) {
    const error = new Error('The WhatsApp 24-hour reply window is closed; a template message is required.');
    error.status = 400;
    throw error;
  }

  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: conversation.externalContact.id,
      type: 'text',
      text: { body: text },
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error?.message || `WhatsApp send failed (${response.status})`);
    error.status = 502;
    throw error;
  }
  return result.messages?.[0]?.id;
}

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/webhooks/whatsapp', (req, res) => {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (!verifyToken) return res.sendStatus(503);
  if (mode === 'subscribe' && token === verifyToken && typeof challenge === 'string') return res.status(200).send(challenge);
  return res.sendStatus(403);
});

app.post('/webhooks/whatsapp', asyncRoute(async (req, res) => {
  verifyWhatsAppRequest(req);
  const entries = Array.isArray(req.body?.entry) ? req.body.entry : [];
  for (const entry of entries) {
    for (const change of Array.isArray(entry.changes) ? entry.changes : []) {
      if (change.field !== 'messages') continue;
      const value = change.value || {};
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      for (const message of Array.isArray(value.messages) ? value.messages : []) {
        const externalId = String(message.from || '');
        const providerMessageId = String(message.id || '');
        const text = getWhatsAppMessageText(message);
        if (!externalId || !providerMessageId || !text) continue;
        const contact = contacts.find((candidate) => String(candidate.wa_id || '') === externalId);
        const contactName = String(contact?.profile?.name || externalId).slice(0, 80);
        const timestamp = Number(message.timestamp);
        const createdAt = Number.isFinite(timestamp) ? new Date(timestamp * 1000) : new Date();
        const participantKey = `whatsapp:${externalId}`;
        const conversation = await Conversation.findOneAndUpdate(
          { participantKey },
          {
            $set: { channel: 'whatsapp', externalContact: { id: externalId, displayName: contactName } },
            $setOnInsert: { participantIds: [], participantKey },
          },
          { new: true, upsert: true, setDefaultsOnInsert: true },
        );
        const inserted = await Message.updateOne(
          { providerMessageId },
          {
            $setOnInsert: {
              conversationId: conversation.id,
              senderName: contactName,
              direction: 'inbound',
              providerMessageId,
              text: text.slice(0, 4000),
              createdAt,
              updatedAt: createdAt,
            },
          },
          { upsert: true },
        );
        if (inserted.upsertedCount) {
          await Conversation.updateOne({ _id: conversation.id }, {
            $set: { lastMessageText: text.slice(0, 4000), lastMessageAt: createdAt, lastInboundAt: createdAt },
          });
        }
      }
    }
  }
  return res.sendStatus(200);
}));

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
    role: 'agent',
    presence: { online: false, lastSeenAt: null },
  });
  return res.status(201).json({ user: { id: user.id, displayName: user.displayName, email: user.email, role: user.role } });
}));

app.post('/auth/login', authLimiter, asyncRoute(async (req, res) => {
  const body = parse(z.object({ email: z.email().max(254), password: z.string().min(1).max(128) }).strict(), req.body);
  const user = await User.findOne({ email: body.email.toLowerCase() }).select('+passwordHash');
  if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
    return res.status(401).json({ error: 'Email or password is incorrect' });
  }
  user.role = 'agent';
  user.presence = { online: true, lastSeenAt: new Date() };
  await user.save();

  if (user.role === 'agent') {
    const previousShift = await AgentShift.findOne({ agentId: user._id, status: 'active' }).sort({ loginAt: -1 });
    if (previousShift) {
      const logoutAt = new Date();
      previousShift.logoutAt = logoutAt;
      previousShift.durationMinutes = Math.max(1, Math.round((logoutAt - previousShift.loginAt) / 60000));
      previousShift.status = 'completed';
      await previousShift.save();
    }
    await AgentShift.create({
      agentId: user._id,
      agentName: user.displayName,
      email: user.email,
      loginAt: new Date(),
      status: 'active',
    });
    console.log(`[MANAGER NOTIFICATION] Agent logged in: ${user.displayName} (${user.email}) at ${new Date().toLocaleTimeString()}`);
  }

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
  const user = await User.findByIdAndUpdate(req.userId, { $set: { 'presence.online': false } });
  if (user && user.role === 'agent') {
    const shift = await AgentShift.findOne({ agentId: req.userId, status: 'active' }).sort({ loginAt: -1 });
    if (shift) {
      const logoutAt = new Date();
      shift.logoutAt = logoutAt;
      shift.durationMinutes = Math.max(1, Math.round((logoutAt - shift.loginAt) / 60000));
      shift.status = 'completed';
      await shift.save();
      console.log(`[MANAGER NOTIFICATION] Agent logged out: ${shift.agentName} (${shift.email}) at ${logoutAt.toLocaleTimeString()}. Shift duration: ${shift.durationMinutes} min`);
    }
  }
  return res.sendStatus(204);
}));

app.get('/api/agent-shifts', requireAuth, asyncRoute(async (req, res) => {
  const user = await User.findById(req.userId).select('role');
  if (!user || user.role !== 'agent') {
    return res.status(403).json({ error: 'Only agents and managers can view shift logs' });
  }

  // Auto-close active shifts whose last heartbeat was > 90 seconds ago
  const onlineSince = new Date(Date.now() - 90_000);
  const activeShifts = await AgentShift.find({ status: 'active' }).populate('agentId', 'presence');
  for (const shift of activeShifts) {
    const presence = shift.agentId?.presence;
    if (presence && (!presence.online || (presence.lastSeenAt && presence.lastSeenAt < onlineSince))) {
      const logoutAt = presence.lastSeenAt || new Date();
      shift.logoutAt = logoutAt;
      shift.durationMinutes = Math.max(1, Math.round((logoutAt - shift.loginAt) / 60000));
      shift.status = 'completed';
      await shift.save();
    }
  }

  const shifts = await AgentShift.find().sort({ loginAt: -1 }).limit(100).lean();
  return res.json(shifts.map((s) => ({
    id: String(s._id),
    agentId: String(s.agentId?._id || s.agentId),
    agentName: s.agentName,
    email: s.email,
    loginAt: s.loginAt,
    logoutAt: s.logoutAt,
    durationMinutes: s.durationMinutes,
    status: s.status,
  })));
}));

app.get('/api/conversations', requireAuth, asyncRoute(async (req, res) => {
  const user = await User.findById(req.userId).select('role');
  if (!user) return res.status(401).json({ error: 'Account no longer exists' });
  const filter = user.role === 'agent'
    ? { $or: [{ participantIds: req.userId }, { channel: 'whatsapp' }] }
    : { participantIds: req.userId, channel: 'internal' };
  const conversations = await Conversation.find(filter)
    .sort({ lastMessageAt: -1, updatedAt: -1 })
    .populate('participantIds', 'displayName');
  return res.json(conversations.map((conversation) => ({
    id: conversation.id,
    participants: conversation.participantIds,
    channel: conversation.channel,
    contactName: conversation.externalContact?.displayName || null,
    contactAddress: conversation.externalContact?.id || null,
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
  const user = await User.findById(userId).select('role');
  if (!user) return null;
  const access = user.role === 'agent'
    ? { $or: [{ participantIds: userId }, { channel: 'whatsapp' }] }
    : { participantIds: userId, channel: 'internal' };
  return Conversation.findOne({ _id: conversationId, ...access });
}

app.get('/api/conversations/:conversationId/messages', requireAuth, asyncRoute(async (req, res) => {
  const conversation = await findAccessibleConversation(req.params.conversationId, req.userId);
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
  const messages = await Message.find({ conversationId: conversation.id })
    .sort({ createdAt: -1 }).limit(100).populate('senderId', 'displayName');
  return res.json(messages.reverse().map((message) => ({
    id: message.id,
    senderId: message.senderId?.id || null,
    senderName: message.senderId?.displayName || message.senderName,
    direction: message.direction,
    text: message.text,
    createdAt: message.createdAt,
  })));
}));

app.post('/api/conversations/:conversationId/messages', requireAuth, asyncRoute(async (req, res) => {
  const conversation = await findAccessibleConversation(req.params.conversationId, req.userId);
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
  const { text } = parse(z.object({ text: z.string().trim().min(1).max(4000) }).strict(), req.body);
  const sender = await User.findById(req.userId).select('displayName role');
  if (conversation.channel === 'whatsapp' && sender.role !== 'agent') return res.status(403).json({ error: 'Only agents can reply to WhatsApp conversations' });
  const providerMessageId = conversation.channel === 'whatsapp' ? await sendWhatsAppText(conversation, text) : undefined;
  const message = await Message.create({
    conversationId: conversation.id,
    senderId: req.userId,
    senderName: sender.displayName,
    direction: conversation.channel === 'whatsapp' ? 'outbound' : 'internal',
    providerMessageId,
    text,
  });
  conversation.lastMessageText = text;
  conversation.lastMessageAt = message.createdAt;
  await conversation.save();
  return res.status(201).json({ id: message.id, senderId: req.userId, senderName: sender.displayName, direction: message.direction, text, createdAt: message.createdAt });
}));

app.get('/api/calls', requireAuth, asyncRoute(async (req, res) => {
  const calls = await CallLog.find({ ownerId: req.userId }).sort({ startedAt: -1 }).limit(100).lean();
  return res.json(calls.map(({ _id, ownerId, __v, ...call }) => ({
    id: String(_id),
    direction: call.direction || 'outbound',
    mode: call.mode || 'live',
    ...call,
  })));
}));

app.post('/api/calls/demo', requireAuth, asyncRoute(async (req, res) => {
  const { to } = parse(z.object({ to: z.string().trim().min(1).max(64) }).strict(), req.body);
  const call = await CallLog.create({
    ownerId: req.userId,
    callSid: `DEMO-${new mongoose.Types.ObjectId()}`,
    from: 'Demo mode',
    to,
    direction: 'outbound',
    mode: 'demo',
    status: 'ringing',
    startedAt: new Date(),
  });
  return res.status(201).json({
    id: String(call.id),
    from: call.from,
    to: call.to,
    direction: call.direction,
    mode: call.mode,
    status: call.status,
    startedAt: call.startedAt,
    answeredAt: call.answeredAt,
    endedAt: call.endedAt,
    durationSeconds: call.durationSeconds,
  });
}));

app.patch('/api/calls/demo/:callId', requireAuth, asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.callId)) return res.status(404).json({ error: 'Call not found' });
  const body = parse(z.object({
    status: z.enum(['in-progress', 'completed', 'canceled']),
    durationSeconds: z.number().int().min(0).optional(),
  }).strict(), req.body);
  const update = { status: body.status };
  if (body.status === 'in-progress') update.answeredAt = new Date();
  if (body.status === 'completed' || body.status === 'canceled') update.endedAt = new Date();
  if (body.durationSeconds !== undefined) update.durationSeconds = body.durationSeconds;
  const call = await CallLog.findOneAndUpdate(
    { _id: req.params.callId, ownerId: req.userId, mode: 'demo' },
    { $set: update },
    { new: true },
  ).select('_id status');
  if (!call) return res.status(404).json({ error: 'Call not found' });
  return res.json({ id: String(call.id), status: call.status });
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
    { $setOnInsert: { ownerId: user.id, callSid, from: process.env.TWILIO_CALLER_ID, to: destination, direction: 'outbound', mode: 'live', status: 'initiated', startedAt: new Date() } },
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
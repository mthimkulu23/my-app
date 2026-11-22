import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  displayName: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['customer', 'agent'], default: 'customer', required: true },
  presence: {
    online: { type: Boolean, default: false },
    lastSeenAt: { type: Date, default: null },
  },
}, { timestamps: true });

const conversationSchema = new mongoose.Schema({
  participantIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  participantKey: { type: String, required: true, unique: true },
  channel: { type: String, enum: ['internal', 'whatsapp'], default: 'internal', required: true },
  externalContact: {
    id: { type: String, default: null },
    displayName: { type: String, default: null },
  },
  lastMessageText: { type: String, default: '' },
  lastMessageAt: { type: Date, default: null },
  lastInboundAt: { type: Date, default: null },
  queueName: { type: String, default: 'OtherInquiries_Queue', trim: true },
  status: { type: String, enum: ['waiting', 'assigned', 'closed'], default: 'waiting' },
  assignedAgentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

const messageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  senderName: { type: String, required: true, maxlength: 80 },
  direction: { type: String, enum: ['internal', 'inbound', 'outbound'], default: 'internal', required: true },
  providerMessageId: { type: String, unique: true, sparse: true },
  text: { type: String, required: true, maxlength: 4000 },
}, { timestamps: true });

const callLogSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  callSid: { type: String, required: true, unique: true },
  from: { type: String, required: true },
  to: { type: String, required: true },
  direction: { type: String, enum: ['inbound', 'outbound'], default: 'outbound', required: true },
  mode: { type: String, enum: ['live', 'demo'], default: 'live', required: true },
  status: {
    type: String,
    enum: ['initiated', 'ringing', 'in-progress', 'completed', 'busy', 'failed', 'no-answer', 'canceled'],
    default: 'initiated',
  },
  startedAt: { type: Date, required: true, default: Date.now },
  answeredAt: { type: Date, default: null },
  endedAt: { type: Date, default: null },
  durationSeconds: { type: Number, default: 0 },
}, { timestamps: true });

export const User = mongoose.model('User', userSchema);
export const Conversation = mongoose.model('Conversation', conversationSchema);
export const Message = mongoose.model('Message', messageSchema);
export const CallLog = mongoose.model('CallLog', callLogSchema);

const agentShiftSchema = new mongoose.Schema({
  agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  agentName: { type: String, required: true },
  email: { type: String, required: true },
  loginAt: { type: Date, required: true, default: Date.now },
  logoutAt: { type: Date, default: null },
  durationMinutes: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'completed'], default: 'active' },
}, { timestamps: true });

export const AgentShift = mongoose.model('AgentShift', agentShiftSchema);
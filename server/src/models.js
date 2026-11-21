import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  displayName: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
}, { timestamps: true });

const conversationSchema = new mongoose.Schema({
  participantIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
  participantKey: { type: String, required: true, unique: true },
  lastMessageText: { type: String, default: '' },
  lastMessageAt: { type: Date, default: null },
}, { timestamps: true });

const messageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true, maxlength: 4000 },
}, { timestamps: true });

const callLogSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  callSid: { type: String, required: true, unique: true },
  from: { type: String, required: true },
  to: { type: String, required: true },
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
const mongoose = require('mongoose');
const crypto = require('crypto');

const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGODB_URI;
        if (!mongoURI) throw new Error("MONGODB_URI is not defined");
        await mongoose.connect(mongoURI, { serverSelectionTimeoutMS: 5000 });
        console.log('🟢 تم الاتصال بقاعدة البيانات بنجاح تام!');
    } catch (error) {
        console.error('🔴 خطأ في الاتصال بقاعدة البيانات:', error.message);
    }
};

const userSchema = new mongoose.Schema({
    googleId: { type: String, required: true, unique: true },
    channelName: { type: String, required: true },
    channelId: { type: String, required: true },
    tokens: { type: Object, required: true },
    credits: { type: Number, default: 1 }, // نقطة ترحيبية واحدة فقط
    referralCode: { type: String, unique: true },
    referredBy: { type: String, default: null },
    status: { type: String, default: 'active', enum: ['active', 'banned'] }, // نظام الحظر
    role: { type: String, default: 'user' },
    createdAt: { type: Date, default: Date.now }
});

userSchema.pre('save', function(next) {
    if (!this.referralCode) {
        this.referralCode = crypto.randomBytes(4).toString('hex');
    }
    next();
});

const User = mongoose.model('User', userSchema);
module.exports = { connectDB, User };

// تحميل متغيرات البيئة من ملف .env لاستخدامها في المشروع
require('dotenv').config();

// استدعاء مكتبة إكسبريس (Express) لإنشاء خادم الويب
const express = require('express');

// استدعاء الدوال اللازمة من مكتبة فايربيس (Firebase) لتهيئة الاتصال
const { initializeApp, cert } = require("firebase-admin/app");

// استدعاء دالة جلب قاعدة بيانات فايرستور (Firestore) للتعامل مع البيانات
const { getFirestore } = require("firebase-admin/firestore");

// استدعاء دالة المصادقة من Firebase Admin للتحقق من ID Tokens
const { getAuth } = require("firebase-admin/auth");

// استدعاء مكتبة المسارات (path) للتعامل مع مسارات الملفات بشكل صحيح
const path = require('path');

// ==========================================
// تهيئة Firebase من متغيرات البيئة (آمن للنشر على Render وغيره)
// بدلاً من ملف serviceAccountKey.json الذي لا يُرفع للسيرفرات
// ==========================================

// دالة لتنظيف المفتاح الخاص
function cleanPrivateKey(key) {
    if (!key) return undefined;
    
    return key
        .replace(/"/g, '') // إزالة علامات الاستشهام
        .replace(/\\n/g, '\n') // استبدال \\n بـ \n
        .replace(/\n\n/g, '\n') // إزالة الأسطر الفارغة الإضافية
        .trim();
}

// التحقق من وجود ملف JSON محلي أولاً (للتطوير)
let serviceAccount;

try {
    // محاولة قراءة ملف JSON الصحيح
    serviceAccount = require('./serviceAccountKey.json');
} catch (err) {
    // إذا لم يوجد الملف، نستخدم متغيرات البيئة (للإنتاج)
    if (process.env.FIREBASE_PROJECT_ID) {
        serviceAccount = {
            type: 'service_account',
            project_id: process.env.FIREBASE_PROJECT_ID,
            private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
            private_key: cleanPrivateKey(process.env.FIREBASE_PRIVATE_KEY),
            client_email: process.env.FIREBASE_CLIENT_EMAIL,
            client_id: process.env.FIREBASE_CLIENT_ID,
            auth_uri: 'https://accounts.google.com/o/oauth2/auth',
            token_uri: 'https://oauth2.googleapis.com/token',
        };
    } else {
        console.error('❌ خطأ: لم يتم العثور على ملف serviceAccountKey.json أو متغيرات البيئة');
        process.exit(1);
    }
}

// تهيئة تطبيق فايربيس باستخدام بيانات التوثيق
initializeApp({
  // استخدام التوثيق الذي جلبناه من ملف المفاتيح
  credential: cert(serviceAccount)
});

// حفظ مرجع لقاعدة البيانات في متغير للوصول إليها بسهولة لاحقاً
const db = getFirestore();

// إنشاء نسخة من تطبيق إكسبريس
const app = express();

// تحديد منفذ التشغيل، إما من متغيرات البيئة أو المنفذ 3000 افتراضياً
const PORT = process.env.PORT || 3000;

// إعداد التطبيق لفهم وقراءة البيانات المرسلة بصيغة JSON
app.use(express.json());

// إعداد التطبيق لقراءة البيانات المرسلة عبر النماذج (Forms)
app.use(express.urlencoded({ extended: true }));

// تحديد المجلد العام (public) لتقديم الملفات الثابتة (مثل HTML و CSS و JS)
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// Middleware للتحقق من Firebase ID Token
// ==========================================

// دالة Middleware للتحقق من هوية المستخدم باستخدام Firebase ID Token
async function authenticateUser(req, res, next) {
    try {
        // الحصول على Authorization header
        const authHeader = req.headers.authorization;

        // التحقق من وجود الـ header
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'غير مصرح: مفقود رمز المصادقة' });
        }

        // استخراج ID Token من الـ header
        const idToken = authHeader.split('Bearer ')[1];

        // التحقق من صحة ID Token باستخدام Firebase Admin
        const decodedToken = await getAuth().verifyIdToken(idToken);

        // إضافة معلومات المستخدم إلى كائن الطلب
        req.user = {
            uid: decodedToken.uid,
            email: decodedToken.email
        };

        // المتابعة إلى المعالج التالي
        next();
    } catch (error) {
        console.error('خطأ في التحقق من ID Token:', error);
        return res.status(401).json({ error: 'غير مصرح: رمز المصادقة غير صالح' });
    }
}


// ==========================================
// مسارات المصروفات (Expenses APIs)
// ==========================================

// مسار لجلب جميع المصروفات من قاعدة البيانات (مع المصادقة)
app.get('/api/expenses', authenticateUser, async (req, res) => {
    // محاولة تنفيذ الكود وتجنب توقف السيرفر في حال حدوث خطأ
    try {
        // جلب البيانات من مجموعة المصروفات للمستخدم الحالي فقط
        const snapshot = await db.collection('expenses')
            .where('userId', '==', req.user.uid)
            .get();
        // تحويل البيانات من فايربيس إلى مصفوفة (Array) عادية
        const expenses = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                // حفظ معرّف المستند (ID)
                id: doc.id,
                // فك ودمج باقي بيانات المستند
                ...data,
                // تحويل صيغة التاريخ الخاصة بـ فايربيس إلى نص ليتمكن المتصفح من قراءته
                date: data.date && data.date.toDate ? data.date.toDate().toISOString() : data.date
            };
        });
        // ترتيب البيانات تنازلياً حسب التاريخ في الكود بدلاً من Firestore
        expenses.sort((a, b) => new Date(b.date) - new Date(a.date));
        // إرسال البيانات كاستجابة ناجحة (Status 200) بصيغة JSON
        res.status(200).json(expenses);
    } catch (err) {
        // في حال حدوث خطأ، نرسل استجابة توضح سبب المشكلة
        res.status(500).json({ error: 'حدث خطأ أثناء جلب البيانات', details: err.message });
    }
});

// مسار لإضافة مصروف جديد إلى قاعدة البيانات (مع المصادقة)
app.post('/api/expenses', authenticateUser, async (req, res) => {
    // محاولة تنفيذ الكود
    try {
        // تجهيز كائن (Object) يحتوي على بيانات المصروف الجديد مع userId
        const newExpense = {
            // حفظ معرّف المستخدم لعزل البيانات
            userId: req.user.uid,
            // حفظ عنوان المصروف
            title: req.body.title,
            // تحويل المبلغ إلى رقم وحفظه
            amount: Number(req.body.amount),
            // حفظ تصنيف المصروف
            category: req.body.category,
            // حفظ التاريخ أو استخدام تاريخ اليوم في حال عدم وجوده
            date: req.body.date ? new Date(req.body.date) : new Date(),
            // حفظ الملاحظات أو تركها فارغة
            notes: req.body.notes || '',
            // حفظ وقت إنشاء المصروف
            createdAt: new Date()
        };

        // إضافة المصروف الجديد إلى قاعدة البيانات والانتظار حتى الانتهاء
        const docRef = await db.collection('expenses').add(newExpense);
        // إرسال استجابة بنجاح الإضافة (Status 201) مع المعرّف الجديد
        res.status(201).json({ id: docRef.id, ...newExpense });
    } catch (err) {
        // في حال حدوث خطأ أثناء الحفظ، نرسل رسالة خطأ
        res.status(400).json({ error: 'حدث خطأ أثناء حفظ المصروف', details: err.message });
    }
});

// مسار لحذف مصروف محدد من قاعدة البيانات بواسطة المعرّف (ID) (مع المصادقة)
app.delete('/api/expenses/:id', authenticateUser, async (req, res) => {
    // محاولة تنفيذ الكود
    try {
        // التحقق من أن المستند يخص المستخدم الحالي قبل الحذف
        const docRef = db.collection('expenses').doc(req.params.id);
        const doc = await docRef.get();

        if (!doc.exists) {
            return res.status(404).json({ error: 'المصروف غير موجود' });
        }

        // التحقق من أن المستند يخص المستخدم الحالي
        if (doc.data().userId !== req.user.uid) {
            return res.status(403).json({ error: 'غير مصرح: لا يمكنك حذف بيانات مستخدم آخر' });
        }

        // البحث عن المستند بالمعرّف الممرر في الرابط وحذفه
        await docRef.delete();
        // إرسال رسالة تفيد بنجاح عملية الحذف
        res.status(200).json({ message: 'تم حذف المصروف بنجاح!' });
    } catch (err) {
        // إرسال رسالة خطأ في حال فشل الحذف
        res.status(500).json({ error: 'حدث خطأ أثناء عملية الحذف', details: err.message });
    }
});


// ==========================================
// مسارات دفعات الأغنام (Batches APIs)
// ==========================================

// مسار لجلب جميع دفعات الأغنام من قاعدة البيانات (مع المصادقة)
app.get('/api/batches', authenticateUser, async (req, res) => {
    // محاولة جلب البيانات
    try {
        // جلب المستندات من مجموعة الدفعات للمستخدم الحالي فقط
        const snapshot = await db.collection('batches')
            .where('userId', '==', req.user.uid)
            .get();
        // تحويل المستندات إلى مصفوفة قابلة للاستخدام
        const batches = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                // جلب المعرّف (ID) الخاص بكل دفعة
                id: doc.id,
                // دمج باقي بيانات الدفعة
                ...data,
                // تحويل صيغة التاريخ الخاصة بـ فايربيس إلى نص ليتمكن المتصفح من قراءته
                date: data.date && data.date.toDate ? data.date.toDate().toISOString() : data.date
            };
        });
        // ترتيب البيانات تنازلياً حسب التاريخ في الكود بدلاً من Firestore
        batches.sort((a, b) => new Date(b.date) - new Date(a.date));
        // إرسال الاستجابة بنجاح
        res.status(200).json(batches);
    } catch (err) {
        // إرسال رسالة خطأ في حال فشل الجلب
        res.status(500).json({ error: 'حدث خطأ أثناء جلب بيانات الدفعات', details: err.message });
    }
});

// مسار لإضافة دفعة أغنام جديدة (مع المصادقة)
app.post('/api/batches', authenticateUser, async (req, res) => {
    // محاولة الإضافة
    try {
        // إنشاء كائن يحتوي على تفاصيل دفعة الأغنام مع userId
        const newBatch = {
            // حفظ معرّف المستخدم لعزل البيانات
            userId: req.user.uid,
            // حفظ عدد الأغنام في الدفعة
            count: Number(req.body.count),
            // حفظ السعر الإجمالي للدفعة
            price: Number(req.body.price),
            // حفظ اسم البائع الذي تم الشراء منه
            seller: req.body.seller || 'غير محدد',
            // حفظ تاريخ الشراء
            date: req.body.date ? new Date(req.body.date) : new Date(),
            // حفظ وقت إنشاء السجل في النظام
            createdAt: new Date()
        };

        // حفظ الدفعة في مجموعة (batches) داخل فايرستور
        const docRef = await db.collection('batches').add(newBatch);
        // الرد بنجاح العملية مع إرسال بيانات الدفعة والمعرّف الجديد
        res.status(201).json({ id: docRef.id, ...newBatch });
    } catch (err) {
        // الرد برسالة خطأ في حال فشل الحفظ
        res.status(400).json({ error: 'حدث خطأ أثناء حفظ الدفعة', details: err.message });
    }
});

// مسار لحذف دفعة أغنام محددة بواسطة المعرّف (ID) (مع المصادقة)
app.delete('/api/batches/:id', authenticateUser, async (req, res) => {
    // محاولة تنفيذ عملية الحذف
    try {
        // التحقق من أن المستند يخص المستخدم الحالي قبل الحذف
        const docRef = db.collection('batches').doc(req.params.id);
        const doc = await docRef.get();

        if (!doc.exists) {
            return res.status(404).json({ error: 'الدفعة غير موجودة' });
        }

        // التحقق من أن المستند يخص المستخدم الحالي
        if (doc.data().userId !== req.user.uid) {
            return res.status(403).json({ error: 'غير مصرح: لا يمكنك حذف بيانات مستخدم آخر' });
        }

        // تحديد المستند المطلوب حذفه وتنفيذ العملية
        await docRef.delete();
        // الرد برسالة نجاح الحذف
        res.status(200).json({ message: 'تم حذف الدفعة بنجاح!' });
    } catch (err) {
        // الرد برسالة خطأ في حال الفشل
        res.status(500).json({ error: 'حدث خطأ أثناء حذف الدفعة', details: err.message });
    }
});

// ==========================================
// مسارات جدول الأدوية والتطعيمات (Medications APIs)
// ==========================================

// مسار لجلب جميع جداول الأدوية من قاعدة البيانات (مع المصادقة)
app.get('/api/medications', authenticateUser, async (req, res) => {
    // محاولة تنفيذ الجلب
    try {
        // جلب الأدوية للمستخدم الحالي فقط
        const snapshot = await db.collection('medications')
            .where('userId', '==', req.user.uid)
            .get();
        // تحويل البيانات لنسق يسهل استخدامه
        const medications = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                // حفظ المعرّف
                id: doc.id,
                // دمج البيانات
                ...data,
                // تحويل التاريخ من Timestamp إلى صيغة نصية مقروءة
                date: data.date && data.date.toDate ? data.date.toDate().toISOString() : data.date
            };
        });
        // ترتيب البيانات تصاعدياً حسب التاريخ في الكود بدلاً من Firestore
        medications.sort((a, b) => new Date(a.date) - new Date(b.date));
        // الإرسال بنجاح
        res.status(200).json(medications);
    } catch (err) {
        // إرسال الخطأ إن وجد
        res.status(500).json({ error: 'حدث خطأ أثناء جلب الأدوية', details: err.message });
    }
});

// مسار لإضافة دواء/تطعيم جديد (مع المصادقة)
app.post('/api/medications', authenticateUser, async (req, res) => {
    // محاولة التنفيذ
    try {
        // بناء الكائن الذي سيتم حفظه مع userId
        const newMedication = {
            // حفظ معرّف المستخدم لعزل البيانات
            userId: req.user.uid,
            // اسم الدواء
            name: req.body.name,
            // نوعه (تطعيم، فيتامين، مضاد، إلخ)
            type: req.body.type,
            // تاريخ ووقت الاستحقاق
            date: req.body.date ? new Date(req.body.date) : new Date(),
            // طريقة الإعطاء
            administrationMethod: req.body.administrationMethod || 'غير محدد',
            // الملاحظات
            notes: req.body.notes || '',
            // توقيت التسجيل في النظام
            createdAt: new Date()
        };

        // حفظ السجل في فايرستور
        const docRef = await db.collection('medications').add(newMedication);
        // إعادة الاستجابة مع معرف السجل الجديد
        res.status(201).json({ id: docRef.id, ...newMedication });
    } catch (err) {
        // الرد في حال الخطأ
        res.status(400).json({ error: 'حدث خطأ أثناء حفظ الدواء', details: err.message });
    }
});

// مسار لحذف دواء محدد (مع المصادقة)
app.delete('/api/medications/:id', authenticateUser, async (req, res) => {
    // محاولة الحذف
    try {
        // التحقق من أن المستند يخص المستخدم الحالي قبل الحذف
        const docRef = db.collection('medications').doc(req.params.id);
        const doc = await docRef.get();

        if (!doc.exists) {
            return res.status(404).json({ error: 'الدواء غير موجود' });
        }

        // التحقق من أن المستند يخص المستخدم الحالي
        if (doc.data().userId !== req.user.uid) {
            return res.status(403).json({ error: 'غير مصرح: لا يمكنك حذف بيانات مستخدم آخر' });
        }

        // حذف المستند بناءً على المعرف
        await docRef.delete();
        // إرسال رد النجاح
        res.status(200).json({ message: 'تم حذف الدواء بنجاح!' });
    } catch (err) {
        // إرسال رد الخطأ
        res.status(500).json({ error: 'حدث خطأ أثناء حذف الدواء', details: err.message });
    }
});

// مسار لتحديث حالة الدواء (إتمام/غير مكتمل) (مع المصادقة)
app.patch('/api/medications/:id', authenticateUser, async (req, res) => {
    try {
        // التحقق من أن المستند يخص المستخدم الحالي قبل التحديث
        const docRef = db.collection('medications').doc(req.params.id);
        const doc = await docRef.get();

        if (!doc.exists) {
            return res.status(404).json({ error: 'الدواء غير موجود' });
        }

        // التحقق من أن المستند يخص المستخدم الحالي
        if (doc.data().userId !== req.user.uid) {
            return res.status(403).json({ error: 'غير مصرح: لا يمكنك تعديل بيانات مستخدم آخر' });
        }

        // تحديث الحقل isCompleted للمستند المطلوب
        await docRef.update({
            isCompleted: req.body.isCompleted
        });
        res.status(200).json({ message: 'تم تحديث حالة الدواء بنجاح!' });
    } catch (err) {
        res.status(500).json({ error: 'حدث خطأ أثناء تحديث الدواء', details: err.message });
    }
});

// ==========================================
// مسارات قسم المبيعات والأرباح (Sales APIs)
// ==========================================

// مسار لجلب سجلات المبيعات من قاعدة البيانات (مع المصادقة)
app.get('/api/sales', authenticateUser, async (req, res) => {
    try {
        // جلب البيانات للمستخدم الحالي فقط
        const snapshot = await db.collection('sales')
            .where('userId', '==', req.user.uid)
            .get();
        const sales = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                // تحويل التاريخ لنص مقروء
                date: data.date && data.date.toDate ? data.date.toDate().toISOString() : data.date
            };
        });
        // ترتيب البيانات تنازلياً حسب التاريخ في الكود بدلاً من Firestore
        sales.sort((a, b) => new Date(b.date) - new Date(a.date));
        res.status(200).json(sales);
    } catch (err) {
        res.status(500).json({ error: 'حدث خطأ أثناء جلب المبيعات', details: err.message });
    }
});

// مسار لإضافة عملية بيع جديدة (مع المصادقة)
app.post('/api/sales', authenticateUser, async (req, res) => {
    try {
        // تجهيز بيانات البيع مع userId
        const newSale = {
            // حفظ معرّف المستخدم لعزل البيانات
            userId: req.user.uid,
            // عدد الأغنام المباعة
            count: Number(req.body.count),
            // إجمالي سعر البيع
            price: Number(req.body.price),
            // اسم المشتري (اختياري)
            buyer: req.body.buyer || 'غير محدد',
            // الملاحظات
            notes: req.body.notes || '',
            // متوسط التكلفة المحسوب وقت البيع لضمان دقة الأرباح حتى لو تغيرت الأسعار لاحقاً
            costAtSaleTime: Number(req.body.costAtSaleTime),
            // تاريخ البيع
            date: req.body.date ? new Date(req.body.date) : new Date(),
            // وقت إنشاء السجل
            createdAt: new Date()
        };

        const docRef = await db.collection('sales').add(newSale);
        res.status(201).json({ id: docRef.id, ...newSale });
    } catch (err) {
        res.status(400).json({ error: 'حدث خطأ أثناء حفظ عملية البيع', details: err.message });
    }
});

// مسار لحذف عملية بيع (مع المصادقة)
app.delete('/api/sales/:id', authenticateUser, async (req, res) => {
    try {
        // التحقق من أن المستند يخص المستخدم الحالي قبل الحذف
        const docRef = db.collection('sales').doc(req.params.id);
        const doc = await docRef.get();

        if (!doc.exists) {
            return res.status(404).json({ error: 'عملية البيع غير موجودة' });
        }

        // التحقق من أن المستند يخص المستخدم الحالي
        if (doc.data().userId !== req.user.uid) {
            return res.status(403).json({ error: 'غير مصرح: لا يمكنك حذف بيانات مستخدم آخر' });
        }

        await docRef.delete();
        res.status(200).json({ message: 'تم حذف عملية البيع بنجاح!' });
    } catch (err) {
        res.status(500).json({ error: 'حدث خطأ أثناء حذف المبيعات', details: err.message });
    }
});

// ==========================================
// مسار تصفير النظام (حذف جميع البيانات) - مع المصادقة
// ==========================================
app.delete('/api/reset', authenticateUser, async (req, res) => {
    try {
        // مصفوفة بأسماء جميع المجموعات (Collections)
        const collections = ['expenses', 'batches', 'medications', 'sales'];

        // المرور على كل مجموعة وحذف جميع مستنداتها للمستخدم الحالي فقط
        for (const col of collections) {
            const snapshot = await db.collection(col).where('userId', '==', req.user.uid).get();
            // استخدام Batch لعمليات الحذف المتعددة السريعة
            const batch = db.batch();
            snapshot.docs.forEach((doc) => {
                batch.delete(doc.ref);
            });
            // تنفيذ الحذف لهذه المجموعة
            await batch.commit();
        }

        res.status(200).json({ message: 'تم تصفير النظام وحذف كافة بياناتك بنجاح!' });
    } catch (err) {
        res.status(500).json({ error: 'حدث خطأ أثناء تصفير النظام', details: err.message });
    }
});

// ==========================================
// تشغيل السيرفر
// ==========================================

// توجيه السيرفر للاستماع إلى المنفذ المحدد
app.listen(PORT, () => {
    // طباعة رسالة في موجه الأوامر للتأكيد على عمل السيرفر
    console.log(`🚀 السيرفر يعمل الآن بنجاح مع Firebase على http://localhost:${PORT}`);
});
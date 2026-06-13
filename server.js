// تحميل متغيرات البيئة من ملف .env لاستخدامها في المشروع
require('dotenv').config();

// استدعاء مكتبة إكسبريس (Express) لإنشاء خادم الويب
const express = require('express');

// استدعاء الدوال اللازمة من مكتبة فايربيس (Firebase) لتهيئة الاتصال
const { initializeApp, cert } = require("firebase-admin/app");

// استدعاء دالة جلب قاعدة بيانات فايرستور (Firestore) للتعامل مع البيانات
const { getFirestore } = require("firebase-admin/firestore");

// استدعاء مكتبة المسارات (path) للتعامل مع مسارات الملفات بشكل صحيح
const path = require('path');

// استدعاء ملف المفاتيح الخاص بـ فايربيس للتوثيق والاتصال
const serviceAccount = require("./serviceAccountKey.json");

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
// مسارات المصروفات (Expenses APIs)
// ==========================================

// مسار لجلب جميع المصروفات من قاعدة البيانات
app.get('/api/expenses', async (req, res) => {
    // محاولة تنفيذ الكود وتجنب توقف السيرفر في حال حدوث خطأ
    try {
        // جلب البيانات من مجموعة المصروفات وترتيبها تنازلياً حسب التاريخ
        const snapshot = await db.collection('expenses').orderBy('date', 'desc').get();
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
        // إرسال البيانات كاستجابة ناجحة (Status 200) بصيغة JSON
        res.status(200).json(expenses);
    } catch (err) {
        // في حال حدوث خطأ، نرسل استجابة توضح سبب المشكلة
        res.status(500).json({ error: 'حدث خطأ أثناء جلب البيانات', details: err.message });
    }
});

// مسار لإضافة مصروف جديد إلى قاعدة البيانات
app.post('/api/expenses', async (req, res) => {
    // محاولة تنفيذ الكود
    try {
        // تجهيز كائن (Object) يحتوي على بيانات المصروف الجديد
        const newExpense = {
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

// مسار لحذف مصروف محدد من قاعدة البيانات بواسطة المعرّف (ID)
app.delete('/api/expenses/:id', async (req, res) => {
    // محاولة تنفيذ الكود
    try {
        // البحث عن المستند بالمعرّف الممرر في الرابط وحذفه
        await db.collection('expenses').doc(req.params.id).delete();
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

// مسار لجلب جميع دفعات الأغنام من قاعدة البيانات
app.get('/api/batches', async (req, res) => {
    // محاولة جلب البيانات
    try {
        // جلب المستندات من مجموعة الدفعات وترتيبها حسب التاريخ تنازلياً
        const snapshot = await db.collection('batches').orderBy('date', 'desc').get();
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
        // إرسال الاستجابة بنجاح
        res.status(200).json(batches);
    } catch (err) {
        // إرسال رسالة خطأ في حال فشل الجلب
        res.status(500).json({ error: 'حدث خطأ أثناء جلب بيانات الدفعات', details: err.message });
    }
});

// مسار لإضافة دفعة أغنام جديدة
app.post('/api/batches', async (req, res) => {
    // محاولة الإضافة
    try {
        // إنشاء كائن يحتوي على تفاصيل دفعة الأغنام
        const newBatch = {
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

// مسار لحذف دفعة أغنام محددة بواسطة المعرّف (ID)
app.delete('/api/batches/:id', async (req, res) => {
    // محاولة تنفيذ عملية الحذف
    try {
        // تحديد المستند المطلوب حذفه وتنفيذ العملية
        await db.collection('batches').doc(req.params.id).delete();
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

// مسار لجلب جميع جداول الأدوية من قاعدة البيانات
app.get('/api/medications', async (req, res) => {
    // محاولة تنفيذ الجلب
    try {
        // ترتيب الأدوية بناءً على التاريخ ليكون الأقرب أولاً
        const snapshot = await db.collection('medications').orderBy('date', 'asc').get();
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
        // الإرسال بنجاح
        res.status(200).json(medications);
    } catch (err) {
        // إرسال الخطأ إن وجد
        res.status(500).json({ error: 'حدث خطأ أثناء جلب الأدوية', details: err.message });
    }
});

// مسار لإضافة دواء/تطعيم جديد
app.post('/api/medications', async (req, res) => {
    // محاولة التنفيذ
    try {
        // بناء الكائن الذي سيتم حفظه
        const newMedication = {
            // اسم الدواء
            name: req.body.name,
            // نوعه (تطعيم، فيتامين، مضاد، إلخ)
            type: req.body.type,
            // تاريخ ووقت الاستحقاق
            date: req.body.date ? new Date(req.body.date) : new Date(),
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

// مسار لحذف دواء محدد
app.delete('/api/medications/:id', async (req, res) => {
    // محاولة الحذف
    try {
        // حذف المستند بناءً على المعرف
        await db.collection('medications').doc(req.params.id).delete();
        // إرسال رد النجاح
        res.status(200).json({ message: 'تم حذف الدواء بنجاح!' });
    } catch (err) {
        // إرسال رد الخطأ
        res.status(500).json({ error: 'حدث خطأ أثناء حذف الدواء', details: err.message });
    }
});

// مسار لتحديث حالة الدواء (إتمام/غير مكتمل)
app.patch('/api/medications/:id', async (req, res) => {
    try {
        // تحديث الحقل isCompleted للمستند المطلوب
        await db.collection('medications').doc(req.params.id).update({
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

// مسار لجلب سجلات المبيعات من قاعدة البيانات
app.get('/api/sales', async (req, res) => {
    try {
        // جلب البيانات مرتبة زمنياً
        const snapshot = await db.collection('sales').orderBy('date', 'desc').get();
        const sales = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                // تحويل التاريخ لنص مقروء
                date: data.date && data.date.toDate ? data.date.toDate().toISOString() : data.date
            };
        });
        res.status(200).json(sales);
    } catch (err) {
        res.status(500).json({ error: 'حدث خطأ أثناء جلب المبيعات', details: err.message });
    }
});

// مسار لإضافة عملية بيع جديدة
app.post('/api/sales', async (req, res) => {
    try {
        // تجهيز بيانات البيع
        const newSale = {
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

// مسار لحذف عملية بيع
app.delete('/api/sales/:id', async (req, res) => {
    try {
        await db.collection('sales').doc(req.params.id).delete();
        res.status(200).json({ message: 'تم حذف عملية البيع بنجاح!' });
    } catch (err) {
        res.status(500).json({ error: 'حدث خطأ أثناء حذف المبيعات', details: err.message });
    }
});

// ==========================================
// مسار تصفير النظام (حذف جميع البيانات)
// ==========================================
app.delete('/api/reset', async (req, res) => {
    try {
        // مصفوفة بأسماء جميع المجموعات (Collections)
        const collections = ['expenses', 'batches', 'medications', 'sales'];
        
        // المرور على كل مجموعة وحذف جميع مستنداتها
        for (const col of collections) {
            const snapshot = await db.collection(col).get();
            // استخدام Batch لعمليات الحذف المتعددة السريعة
            const batch = db.batch();
            snapshot.docs.forEach((doc) => {
                batch.delete(doc.ref);
            });
            // تنفيذ الحذف لهذه المجموعة
            await batch.commit();
        }

        res.status(200).json({ message: 'تم تصفير النظام وحذف كافة البيانات بنجاح!' });
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
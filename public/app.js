// ==========================================
// الإعدادات الأولية والمشتركة
// ==========================================

// تعيين تاريخ اليوم تلقائياً للحقول
document.getElementById('exp-date').valueAsDate = new Date();
document.getElementById('bat-date').valueAsDate = new Date();
document.getElementById('med-date').valueAsDate = new Date();
document.getElementById('sale-date').valueAsDate = new Date();

// الروابط الثابتة لواجهات برمجة التطبيقات (API Endpoints)
const EXPENSES_API = '/api/expenses';
const BATCHES_API = '/api/batches';
const MEDICATIONS_API = '/api/medications';
const SALES_API = '/api/sales';

// متغيرات عامة لتخزين البيانات محلياً لتسهيل العمليات الحسابية
let globalExpenses = [];
let globalBatches = [];
let globalMedications = [];
let globalSales = [];

// متغيرات لتخزين كائنات الرسم البياني (Chart instances) لتحديثها لاحقاً
let categoryChartInstance = null;
let monthlyChartInstance = null;

// ==========================================
// 1. نظام الإشعارات والنوافذ المنبثقة (Custom Alerts)
// ==========================================

// دالة عرض إشعار سريع (Toast)
function showToast(type, title, message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    
    // تحديد الألوان حسب النوع
    let colorClass = 'bg-gray-800';
    let icon = '<i class="fa-solid fa-bell"></i>';
    if (type === 'success') { colorClass = 'bg-emerald-600'; icon = '<i class="fa-solid fa-circle-check"></i>'; }
    if (type === 'error') { colorClass = 'bg-red-600'; icon = '<i class="fa-solid fa-circle-xmark"></i>'; }

    toast.className = `flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-white toast-slide-in ${colorClass}`;
    toast.innerHTML = `
        <div class="text-xl">${icon}</div>
        <div>
            <h4 class="font-bold text-sm">${title}</h4>
            <p class="text-xs opacity-90">${message}</p>
        </div>
    `;

    container.appendChild(toast);

    // إخفاء الإشعار بعد 3 ثوانٍ
    setTimeout(() => {
        toast.classList.replace('toast-slide-in', 'toast-fade-out');
        setTimeout(() => toast.remove(), 400); // إزالة العنصر بعد انتهاء الحركة
    }, 3000);
}

// دالة تأكيد مخصصة (Custom Confirm) بديلة عن window.confirm
function showConfirm(title, message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        document.getElementById('confirm-title').innerText = title;
        document.getElementById('confirm-msg').innerText = message;
        modal.classList.remove('hidden');

        const btnOk = document.getElementById('btn-confirm-ok');
        const btnCancel = document.getElementById('btn-confirm-cancel');

        // وظيفة الإغلاق
        const close = (result) => {
            modal.classList.add('hidden');
            // تنظيف المستمعات
            btnOk.replaceWith(btnOk.cloneNode(true));
            btnCancel.replaceWith(btnCancel.cloneNode(true));
            resolve(result);
        };

        btnOk.onclick = () => close(true);
        btnCancel.onclick = () => close(false);
    });
}

// ==========================================
// 2. التنقل بين الأقسام (Tab Switching)
// ==========================================
function switchTab(tabId) {
    // إخفاء جميع الأقسام
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.add('hidden-tab');
    });
    // إزالة التفعيل من جميع الأزرار
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('bg-white', 'text-green-800', 'shadow-md', 'active');
        btn.classList.add('text-green-100');
    });
    // إظهار القسم المطلوب وتفعيل زره
    document.getElementById(`tab-${tabId}`).classList.remove('hidden-tab');
    const activeBtn = document.getElementById(`btn-${tabId}`);
    activeBtn.classList.remove('text-green-100');
    activeBtn.classList.add('bg-white', 'text-green-800', 'shadow-md', 'active');
}

// ==========================================
// 3. قسم لوحة القيادة الشاملة (Main Dashboard & Analytics)
// ==========================================

function updateDashboard() {
    // بناء خط زمني لجميع الحركات (مشتريات، مصروفات، مبيعات) لحساب التكلفة التراكمية بدقة (Moving Average Cost)
    const events = [];
    
    globalBatches.forEach(b => events.push({ type: 'batch', date: new Date(b.date), count: Number(b.count), amount: Number(b.price) }));
    globalExpenses.forEach(e => events.push({ type: 'expense', date: new Date(e.date), amount: Number(e.amount) }));
    globalSales.forEach(s => events.push({ type: 'sale', date: new Date(s.date), count: Number(s.count), price: Number(s.price), costAtSaleTime: Number(s.costAtSaleTime) }));

    // ترتيب الأحداث من الأقدم للأحدث
    events.sort((a, b) => a.date.getTime() - b.date.getTime());

    let currentSheep = 0;
    let currentTotalCost = 0;
    let totalSalesRev = 0;
    let totalCostOfSales = 0;
    let totalExpensesAllTime = 0;

    events.forEach(ev => {
        if (ev.type === 'batch') {
            currentSheep += ev.count;
            currentTotalCost += ev.amount;
        } else if (ev.type === 'expense') {
            currentTotalCost += ev.amount;
            totalExpensesAllTime += ev.amount;
        } else if (ev.type === 'sale') {
            // إضافة إيرادات البيع
            totalSalesRev += ev.price;
            
            // حساب تكلفة الأغنام المباعة (متوسط التكلفة للرأس × العدد المباع)
            let avgCostAtThisMoment = currentSheep > 0 ? (currentTotalCost / currentSheep) : 0;
            // نستخدم التكلفة المحفوظة وقت البيع لضمان دقة السجلات السابقة، أو نحسبها إذا لم تكن موجودة
            let costOfThisSale = ev.count * (ev.costAtSaleTime || avgCostAtThisMoment);
            
            totalCostOfSales += costOfThisSale;
            
            // خصم العدد والتكلفة من الرصيد الحالي
            currentSheep -= ev.count;
            currentTotalCost -= costOfThisSale;

            // تصفير التكلفة إذا نفدت الأغنام (هذا يمنع تداخل تكاليف الدفعات القديمة مع الجديدة)
            if (currentSheep <= 0) {
                currentSheep = 0;
                currentTotalCost = 0;
            }
        }
    });

    // متوسط تكلفة الرأس الواحد للرصيد الحالي
    const currentAvgCost = currentSheep > 0 ? (currentTotalCost / currentSheep) : 0;

    // صافي الأرباح الكلية
    const netProfit = totalSalesRev - totalCostOfSales;

    // تحديث الأرقام في واجهة لوحة القيادة
    document.getElementById('dash-total-sheep').innerText = currentSheep;
    document.getElementById('dash-avg-cost').innerText = currentAvgCost.toFixed(2);
    document.getElementById('dash-total-exp').innerText = totalExpensesAllTime.toLocaleString();
    
    // إظهار الأرباح (مع تحذير باللون الأحمر في حال الخسارة)
    const profitEl = document.getElementById('dash-total-profit');
    if (netProfit < 0) {
        profitEl.innerHTML = `<span class="text-red-600 font-black">${netProfit.toLocaleString()}</span> <span class="text-sm font-bold text-red-500 bg-red-100 px-2 py-1 rounded-lg ml-2"><i class="fa-solid fa-triangle-exclamation"></i> خسارة</span>`;
    } else {
        profitEl.innerHTML = `<span class="text-emerald-700 font-black">${netProfit.toLocaleString()}</span> <span class="text-lg text-emerald-600 font-normal">د.ل</span>`;
    }

    // تحديث الرسوم البيانية
    renderCharts();
}

function renderCharts() {
    if (globalExpenses.length === 0) return;

    const categories = {};
    const monthlyData = {};

    globalExpenses.forEach(exp => {
        categories[exp.category] = (categories[exp.category] || 0) + Number(exp.amount);
        const date = new Date(exp.date);
        const monthYear = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        monthlyData[monthYear] = (monthlyData[monthYear] || 0) + Number(exp.amount);
    });

    const ctxCat = document.getElementById('categoryChart').getContext('2d');
    if (categoryChartInstance) categoryChartInstance.destroy();
    categoryChartInstance = new Chart(ctxCat, {
        type: 'doughnut',
        data: {
            labels: Object.keys(categories),
            datasets: [{
                data: Object.values(categories),
                backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'],
                borderWidth: 0
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    const sortedMonths = Object.keys(monthlyData).sort();
    const monthValues = sortedMonths.map(m => monthlyData[m]);

    const ctxMon = document.getElementById('monthlyChart').getContext('2d');
    if (monthlyChartInstance) monthlyChartInstance.destroy();
    monthlyChartInstance = new Chart(ctxMon, {
        type: 'bar',
        data: {
            labels: sortedMonths,
            datasets: [{
                label: 'المصروفات الشهرية (د.ل)',
                data: monthValues,
                backgroundColor: '#10b981',
                borderRadius: 8
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

// ==========================================
// 4. قسم المصروفات (Expenses Logic)
// ==========================================

async function fetchExpenses() {
    try {
        const response = await fetch(EXPENSES_API);
        globalExpenses = await response.json();
        renderExpensesTable();
        updateDashboard();
    } catch (error) {
        showToast('error', 'خطأ', 'فشل في جلب المصروفات.');
    }
}

function renderExpensesTable() {
    const list = document.getElementById('expenses-list');
    list.innerHTML = '';
    if (globalExpenses.length === 0) {
        list.innerHTML = `<tr><td colspan="5" class="text-center p-6 text-gray-500">لا توجد مصروفات مسجلة بعد.</td></tr>`;
        return;
    }
    globalExpenses.forEach(exp => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50 transition duration-150';
        row.innerHTML = `
            <td class="p-4 text-sm text-gray-600 font-bold" dir="ltr">${new Date(exp.date).toLocaleDateString('en-CA')}</td>
            <td class="p-4 font-bold text-gray-800">${exp.title} <br> <span class="text-xs text-gray-400 font-normal">${exp.notes || ''}</span></td>
            <td class="p-4 text-sm text-gray-700">${exp.category}</td>
            <td class="p-4 font-bold text-green-600">${Number(exp.amount).toLocaleString()}</td>
            <td class="p-4 text-center">
                <button onclick="deleteExpense('${exp.id}')" class="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1 rounded-lg transition-colors">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        `;
        list.appendChild(row);
    });
}

document.getElementById('expense-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newExp = {
        title: document.getElementById('exp-title').value,
        amount: document.getElementById('exp-amount').value,
        category: document.getElementById('exp-category').value,
        date: document.getElementById('exp-date').value,
        notes: document.getElementById('exp-notes').value
    };
    try {
        const res = await fetch(EXPENSES_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newExp)
        });
        if (res.ok) {
            document.getElementById('expense-form').reset();
            document.getElementById('exp-date').valueAsDate = new Date();
            showToast('success', 'نجاح', 'تمت إضافة المصروف بنجاح!');
            fetchExpenses();
        }
    } catch (err) {
        showToast('error', 'خطأ', 'فشل في حفظ المصروف.');
    }
});

async function deleteExpense(id) {
    const isConfirmed = await showConfirm('حذف المصروف', 'هل أنت متأكد من رغبتك في حذف هذا المصروف؟');
    if (!isConfirmed) return;

    try {
        const res = await fetch(`${EXPENSES_API}/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('success', 'تم الحذف', 'تم حذف المصروف بنجاح.');
            fetchExpenses();
        }
    } catch (err) {
        showToast('error', 'خطأ', 'فشل في عملية الحذف.');
    }
}

// ==========================================
// 5. قسم دفعات الأغنام (Batches Logic)
// ==========================================

async function fetchBatches() {
    try {
        const response = await fetch(BATCHES_API);
        globalBatches = await response.json();
        renderBatchesTable();
        updateDashboard();
    } catch (error) {
        showToast('error', 'خطأ', 'فشل في جلب الدفعات.');
    }
}

function renderBatchesTable() {
    const list = document.getElementById('batches-list');
    list.innerHTML = '';
    if (globalBatches.length === 0) {
        list.innerHTML = `<tr><td colspan="6" class="text-center p-6 text-gray-500">لا توجد دفعات مشتراة حتى الآن.</td></tr>`;
        return;
    }
    globalBatches.forEach(batch => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50 transition duration-150';
        row.innerHTML = `
            <td class="p-4 text-sm text-gray-600 font-bold" dir="ltr">${new Date(batch.date).toLocaleDateString('en-CA')}</td>
            <td class="p-4 font-bold text-gray-800">${batch.count} رأس</td>
            <td class="p-4 text-sm text-gray-700">${batch.seller || 'غير محدد'}</td>
            <td class="p-4 font-bold text-indigo-600">${Number(batch.price).toLocaleString()} د.ل</td>
            <td class="p-4 text-sm text-gray-500">${(batch.price / batch.count).toFixed(2)} د.ل/رأس</td>
            <td class="p-4 text-center">
                <button onclick="deleteBatch('${batch.id}')" class="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1 rounded-lg transition-colors">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        `;
        list.appendChild(row);
    });
}

document.getElementById('batch-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newBatch = {
        count: document.getElementById('bat-count').value,
        price: document.getElementById('bat-price').value,
        seller: document.getElementById('bat-seller').value,
        date: document.getElementById('bat-date').value
    };
    try {
        const res = await fetch(BATCHES_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newBatch)
        });
        if (res.ok) {
            document.getElementById('batch-form').reset();
            document.getElementById('bat-date').valueAsDate = new Date();
            showToast('success', 'نجاح', 'تم تسجيل الدفعة الجديدة!');
            fetchBatches();
        }
    } catch (err) {
        showToast('error', 'خطأ', 'فشل في حفظ الدفعة.');
    }
});

async function deleteBatch(id) {
    const isConfirmed = await showConfirm('إلغاء دفعة', 'هل تريد حذف هذه الدفعة المشتراة؟');
    if (!isConfirmed) return;
    try {
        const res = await fetch(`${BATCHES_API}/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('success', 'تم الحذف', 'تم الحذف بنجاح.');
            fetchBatches();
        }
    } catch (err) {
        showToast('error', 'خطأ', 'فشل في عملية الحذف.');
    }
}

// ==========================================
// 6. المبيعات والأرباح (Sales Logic)
// ==========================================

async function fetchSales() {
    try {
        const response = await fetch(SALES_API);
        globalSales = await response.json();
        renderSalesTable();
        updateDashboard();
    } catch (error) {
        showToast('error', 'خطأ', 'فشل في جلب سجل المبيعات.');
    }
}

function renderSalesTable() {
    const list = document.getElementById('sales-list');
    list.innerHTML = '';
    if (globalSales.length === 0) {
        list.innerHTML = `<tr><td colspan="7" class="text-center p-6 text-gray-500">لا توجد مبيعات مسجلة حتى الآن.</td></tr>`;
        return;
    }
    globalSales.forEach(sale => {
        const count = Number(sale.count);
        const price = Number(sale.price);
        const costAtSaleTime = Number(sale.costAtSaleTime);
        const profit = price - (count * costAtSaleTime);

        // تلوين الربح (أخضر للربح، أحمر للخسارة)
        let profitHtml = '';
        if (profit < 0) {
            profitHtml = `<span class="text-red-500 font-black">${profit.toLocaleString()}</span> <span class="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-md"><i class="fa-solid fa-triangle-exclamation"></i> خسارة</span>`;
        } else {
            profitHtml = `<span class="text-emerald-600 font-black">${profit.toLocaleString()}</span>`;
        }

        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50 transition duration-150';
        row.innerHTML = `
            <td class="p-4 text-sm text-gray-600 font-bold" dir="ltr">${new Date(sale.date).toLocaleDateString('en-CA')}</td>
            <td class="p-4 font-bold text-gray-800">${sale.buyer || 'غير محدد'} <br> <span class="text-xs text-gray-400 font-normal">${sale.notes || ''}</span></td>
            <td class="p-4 text-sm font-bold text-gray-700">${count} رأس</td>
            <td class="p-4 font-bold text-gray-800">${price.toLocaleString()} د.ل</td>
            <td class="p-4 text-sm text-gray-500">${(price / count).toFixed(2)} د.ل</td>
            <td class="p-4" dir="ltr">${profitHtml}</td>
            <td class="p-4 text-center">
                <button onclick="deleteSale('${sale.id}')" class="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1 rounded-lg transition-colors">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        `;
        list.appendChild(row);
    });
}

document.getElementById('sale-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // بناء خط زمني مصغر لمعرفة متوسط التكلفة "الحالي" بدقة لحظة البيع
    const events = [];
    globalBatches.forEach(b => events.push({ type: 'batch', date: new Date(b.date), count: Number(b.count), amount: Number(b.price) }));
    globalExpenses.forEach(e => events.push({ type: 'expense', date: new Date(e.date), amount: Number(e.amount) }));
    globalSales.forEach(s => events.push({ type: 'sale', date: new Date(s.date), count: Number(s.count), price: Number(s.price), costAtSaleTime: Number(s.costAtSaleTime) }));
    events.sort((a, b) => a.date.getTime() - b.date.getTime());

    let currentSheep = 0;
    let currentTotalCost = 0;

    events.forEach(ev => {
        if (ev.type === 'batch') {
            currentSheep += ev.count;
            currentTotalCost += ev.amount;
        } else if (ev.type === 'expense') {
            currentTotalCost += ev.amount;
        } else if (ev.type === 'sale') {
            let avgCost = currentSheep > 0 ? (currentTotalCost / currentSheep) : 0;
            let costOfSale = ev.count * (ev.costAtSaleTime || avgCost);
            currentSheep -= ev.count;
            currentTotalCost -= costOfSale;
            if (currentSheep <= 0) { currentSheep = 0; currentTotalCost = 0; }
        }
    });

    const currentAvgCost = currentSheep > 0 ? (currentTotalCost / currentSheep) : 0;

    const newSale = {
        count: document.getElementById('sale-count').value,
        price: document.getElementById('sale-price').value,
        buyer: document.getElementById('sale-buyer').value,
        date: document.getElementById('sale-date').value,
        notes: document.getElementById('sale-notes').value,
        costAtSaleTime: currentAvgCost // حفظ التكلفة في وقت البيع
    };

    try {
        const res = await fetch(SALES_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newSale)
        });
        if (res.ok) {
            document.getElementById('sale-form').reset();
            document.getElementById('sale-date').valueAsDate = new Date();
            showToast('success', 'مبروك', 'تمت إضافة البيعة والأرباح بنجاح!');
            fetchSales(); // سيقوم أيضاً بتحديث لوحة القيادة
        }
    } catch (err) {
        showToast('error', 'خطأ', 'فشل في حفظ البيعة.');
    }
});

async function deleteSale(id) {
    const isConfirmed = await showConfirm('حذف مبيعة', 'هل تريد بالفعل حذف سجل هذه المبيعة؟ سيتم إرجاع الأغنام إلى الرصيد وتعديل الأرباح.');
    if (!isConfirmed) return;
    try {
        const res = await fetch(`${SALES_API}/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('success', 'تم الحذف', 'تم الحذف وتحديث الأرصدة بنجاح.');
            fetchSales();
        }
    } catch (err) {
        showToast('error', 'خطأ', 'فشل في عملية الحذف.');
    }
}


// ==========================================
// 7. قسم الأدوية والتطعيمات (Medications Logic)
// ==========================================

async function fetchMedications() {
    try {
        const response = await fetch(MEDICATIONS_API);
        globalMedications = await response.json();
        renderMedicationsTable();
        renderReminders();
    } catch (error) {
        showToast('error', 'خطأ', 'فشل في جلب الأدوية.');
    }
}

function renderMedicationsTable() {
    const list = document.getElementById('medications-list');
    list.innerHTML = '';
    if (globalMedications.length === 0) {
        list.innerHTML = `<tr><td colspan="5" class="text-center p-6 text-gray-500">لا توجد أدوية مجدولة.</td></tr>`;
        return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    globalMedications.forEach(med => {
        const medDate = new Date(med.date);
        const formattedDate = new Date(med.date).toLocaleDateString('en-CA');
        const medDateOnly = new Date(med.date);
        medDateOnly.setHours(0,0,0,0);

        let statusHtml = '';
        let actionBtn = '';

        // إذا كان الدواء تم الانتهاء منه مسبقاً
        if (med.isCompleted) {
            statusHtml = `<span class="px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800"><i class="fa-solid fa-check-double"></i> مُنجز</span>`;
            actionBtn = `<button disabled class="text-gray-400 bg-gray-50 px-3 py-1 rounded-lg cursor-not-allowed"><i class="fa-solid fa-check"></i> تم</button>`;
        } else {
            // إذا لم يتم الانتهاء منه، نقارن التاريخ
            if (medDateOnly < today) {
                statusHtml = `<span class="px-3 py-1 rounded-full text-xs font-bold bg-gray-200 text-gray-700"><i class="fa-solid fa-clock-rotate-left"></i> متأخر (غير منجز)</span>`;
            } else if (medDateOnly.getTime() === today.getTime()) {
                statusHtml = `<span class="px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 animate-pulse"><i class="fa-solid fa-bell"></i> مستحق اليوم</span>`;
            } else {
                statusHtml = `<span class="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800"><i class="fa-solid fa-clock"></i> قادم</span>`;
            }
            
            actionBtn = `<button onclick="markMedicationDone('${med.id}')" class="text-white bg-green-500 hover:bg-green-600 px-3 py-1 rounded-lg transition-colors shadow-sm ml-2">
                            <i class="fa-solid fa-check"></i> إتمام
                         </button>`;
        }

        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50 transition duration-150';
        row.innerHTML = `
            <td class="p-4 text-sm text-gray-600 font-bold" dir="ltr">${formattedDate}</td>
            <td class="p-4">${statusHtml}</td>
            <td class="p-4 font-bold text-gray-800">${med.name} <br> <span class="text-xs text-gray-400 font-normal">${med.notes || ''}</span></td>
            <td class="p-4 text-sm text-gray-700">${med.type}</td>
            <td class="p-4 text-center">
                <div class="flex justify-center items-center gap-1">
                    ${actionBtn}
                    <button onclick="deleteMedication('${med.id}')" class="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1 rounded-lg transition-colors">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        list.appendChild(row);
    });
}

function renderReminders() {
    const remindersContainer = document.getElementById('medication-reminders');
    remindersContainer.innerHTML = '';
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // تصفية الأدوية الغير منجزة والتي استحقت اليوم أو متأخرة
    const urgentMeds = globalMedications.filter(med => {
        if (med.isCompleted) return false;
        const medDate = new Date(med.date);
        medDate.setHours(0, 0, 0, 0);
        return medDate.getTime() <= today.getTime();
    });

    if (urgentMeds.length > 0) {
        remindersContainer.classList.remove('hidden');
        const alertBox = document.createElement('div');
        alertBox.className = 'bg-rose-50 border-r-4 border-rose-500 p-4 rounded-xl shadow-sm flex items-start gap-4 mb-8';
        const icon = `<div class="text-rose-500 text-2xl mt-1 animate-bounce"><i class="fa-solid fa-bell"></i></div>`;
        let contentHtml = `<div><h3 class="font-bold text-rose-800 text-lg mb-1">تنبيه: أدوية وتطعيمات مستحقة بانتظارك!</h3><ul class="list-disc list-inside text-rose-700 text-sm space-y-1">`;
        urgentMeds.forEach(med => {
            contentHtml += `<li><strong>${med.name}</strong> (${med.type}) - ${med.notes || ''}</li>`;
        });
        contentHtml += `</ul></div>`;
        alertBox.innerHTML = icon + contentHtml;
        remindersContainer.appendChild(alertBox);
    } else {
        remindersContainer.classList.add('hidden');
    }
}

document.getElementById('med-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newMed = {
        name: document.getElementById('med-name').value,
        type: document.getElementById('med-type').value,
        date: document.getElementById('med-date').value,
        notes: document.getElementById('med-notes').value,
        isCompleted: false // الدواء غير منجز افتراضياً
    };
    try {
        const res = await fetch(MEDICATIONS_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newMed)
        });
        if (res.ok) {
            document.getElementById('med-form').reset();
            document.getElementById('med-date').valueAsDate = new Date();
            showToast('success', 'نجاح', 'تم جدولة الدواء بنجاح!');
            fetchMedications();
        }
    } catch (err) {
        showToast('error', 'خطأ', 'فشل في الإضافة.');
    }
});

// دالة تحديث حالة الدواء لمنجز
async function markMedicationDone(id) {
    const isConfirmed = await showConfirm('إتمام التطعيم', 'هل أنت متأكد من إعطاء هذه الجرعة؟');
    if (!isConfirmed) return;

    try {
        const res = await fetch(`${MEDICATIONS_API}/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isCompleted: true })
        });
        if (res.ok) {
            showToast('success', 'عمل ممتاز', 'تم تحديث حالة الدواء بنجاح.');
            fetchMedications();
        }
    } catch (err) {
        showToast('error', 'خطأ', 'فشل في التحديث.');
    }
}

async function deleteMedication(id) {
    const isConfirmed = await showConfirm('حذف الموعد', 'هل أنت متأكد من حذف هذا الموعد الطبي؟');
    if (!isConfirmed) return;
    try {
        const res = await fetch(`${MEDICATIONS_API}/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('success', 'تم الحذف', 'تم حذف الموعد الطبي بنجاح.');
            fetchMedications();
        }
    } catch (err) {
        showToast('error', 'خطأ', 'فشل الحذف.');
    }
}

// ==========================================
// 8. تصفير النظام (Reset System)
// ==========================================

async function resetSystem() {
    const isConfirmed = await showConfirm(
        'تحذير خطير جداً ⚠️', 
        'هل أنت متأكد من رغبتك في تصفير النظام؟\nسيتم مسح جميع المشتريات، المبيعات، المصروفات، وجداول الأدوية بشكل نهائي ولا يمكن استرجاعها!'
    );
    
    if (!isConfirmed) return;

    try {
        const res = await fetch('/api/reset', { method: 'DELETE' });
        if (res.ok) {
            showToast('success', 'تم التصفير', 'تم حذف كافة بيانات المزرعة بنجاح. ستبدأ بموسم جديد نظيف.');
            // تفريغ البيانات المحلية
            globalBatches = [];
            globalExpenses = [];
            globalSales = [];
            globalMedications = [];
            // إعادة رسم الواجهة فارغة
            renderBatchesTable();
            renderExpensesTable();
            renderSalesTable();
            renderMedicationsTable();
            updateDashboard();
        } else {
            showToast('error', 'خطأ', 'فشل في تصفير النظام.');
        }
    } catch (err) {
        showToast('error', 'خطأ', 'حدث خطأ غير متوقع أثناء التصفير.');
    }
}

// ==========================================
// التهيئة عند تحميل الصفحة (Initialization)
// ==========================================

// تشغيل جلب البيانات بالترتيب
async function initializeData() {
    await fetchBatches();     // نحتاج الدفعات أولاً لمعرفة التكلفة
    await fetchExpenses();    // نحتاج المصروفات ثانياً لإكمال حساب التكلفة
    await fetchSales();       // الآن يمكننا حساب المبيعات بشكل صحيح
    await fetchMedications(); // جلب الأدوية
}

initializeData();
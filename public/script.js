let isLoading = false;
let lastRequest = null;
let lastActivity = null;
let lastTitle = 'activity';

/* ---------- بيانات المعدّ (تُحفظ في متصفح المعلم فقط) ---------- */

const CREDIT_KEY = 'oman-activity-credit-v1';
let credit = { prefix: 'إعداد الأستاذ:', name: '', photo: '' };

function loadCredit() {
    try {
        const saved = JSON.parse(localStorage.getItem(CREDIT_KEY) || 'null');
        if (saved && typeof saved === 'object') {
            credit.prefix = typeof saved.prefix === 'string' ? saved.prefix : credit.prefix;
            credit.name = typeof saved.name === 'string' ? saved.name.slice(0, 60) : '';
            credit.photo = (typeof saved.photo === 'string' && /^data:image\/(jpeg|png);base64,/.test(saved.photo)) ? saved.photo : '';
        }
    } catch (_) { /* التخزين غير متاح: نكمل بدون حفظ */ }
}

function saveCredit() {
    try { localStorage.setItem(CREDIT_KEY, JSON.stringify(credit)); } catch (_) { /* ignore */ }
}

function updateCreditPreview() {
    const box = document.getElementById('creditPreview');
    if (credit.photo) {
        box.innerHTML = `<img src="${credit.photo}" alt="" class="w-full h-full object-cover">`;
    } else {
        box.textContent = 'صورة';
    }
}

function creditChanged() {
    saveCredit();
    updateCreditPreview();
    if (lastActivity) showActivity(lastActivity, false);
}

function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('تعذر قراءة الصورة')); };
        img.src = url;
    });
}

// قص الصورة إلى مربع صغير (240px) حتى تبقى خفيفة وتُحفظ بسهولة
async function squarePhotoFromFile(file, size = 240) {
    const img = await loadImageFromFile(file);
    const s = Math.min(img.width, img.height);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.85);
}

// تصغير الرسومات المولدة لتخفيف الحجم
function shrinkDataUrl(dataUrl, max = 360) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const k = Math.min(1, max / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * k);
            canvas.height = Math.round(img.height * k);
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.9));
        };
        img.onerror = () => reject(new Error('تعذر قراءة الرسم'));
        img.src = dataUrl;
    });
}

/* ---------- التهيئة ---------- */

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('requestForm').addEventListener('submit', (e) => {
        e.preventDefault();
        submitRequest(false);
    });
    document.getElementById('refreshBtn').addEventListener('click', () => submitRequest(true));
    document.getElementById('illustrateBtn').addEventListener('click', illustrate);
    document.getElementById('printBtn').addEventListener('click', () => window.print());
    document.getElementById('downloadBtn').addEventListener('click', downloadWorksheetImage);

    // تلميح المادة للصفين 11 و12
    const grade = document.getElementById('grade');
    const subject = document.getElementById('subject');
    const hint = document.getElementById('subjectHint');
    const updateHint = () => {
        const senior = /الحادي عشر|الثاني عشر/.test(grade.value);
        hint.classList.toggle('hidden', !(senior && !subject.value));
    };
    grade.addEventListener('change', updateHint);
    subject.addEventListener('change', updateHint);
    updateHint();

    // بيانات المعدّ
    loadCredit();
    const prefixEl = document.getElementById('creditPrefix');
    const nameEl = document.getElementById('creditName');
    prefixEl.value = credit.prefix;
    if (prefixEl.value !== credit.prefix) prefixEl.selectedIndex = 0;
    nameEl.value = credit.name;
    updateCreditPreview();

    prefixEl.addEventListener('change', () => { credit.prefix = prefixEl.value; creditChanged(); });
    nameEl.addEventListener('input', () => { credit.name = nameEl.value.trim().slice(0, 60); creditChanged(); });

    document.getElementById('creditPhoto').addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) {
            setStatus('اختر صورة صالحة (حتى 10 ميجابايت).', 'error');
            return;
        }
        try {
            credit.photo = await squarePhotoFromFile(file);
            creditChanged();
        } catch (err) {
            setStatus(err.message, 'error');
        }
    });

    document.getElementById('creditClear').addEventListener('click', () => {
        credit.name = '';
        credit.photo = '';
        nameEl.value = '';
        creditChanged();
    });
});

/* ---------- الطلب ---------- */

function readForm() {
    const checked = document.querySelector('input[name="type"]:checked');
    return {
        grade: document.getElementById('grade').value,
        subject: document.getElementById('subject').value,
        lesson: document.getElementById('lesson').value.trim(),
        section: document.getElementById('section').value.trim(),
        type: checked ? checked.value : 'auto',
        text: document.getElementById('bookText').value.trim()
    };
}

function setStatus(message, kind) {
    const box = document.getElementById('statusBox');
    if (!message) { box.classList.add('hidden'); return; }
    const styles = {
        loading: 'bg-sky-50 text-sky-800 border border-sky-200',
        error: 'bg-rose-50 text-rose-800 border border-rose-200',
        ok: 'bg-emerald-50 text-emerald-800 border border-emerald-200'
    };
    box.className = `text-xs font-bold rounded-2xl px-3 py-2.5 leading-relaxed ${styles[kind] || styles.ok}`;
    box.textContent = message;
}

function setBusy(busy) {
    isLoading = busy;
    ['sendBtn', 'refreshBtn', 'illustrateBtn'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = busy;
    });
}

async function submitRequest(refresh) {
    if (isLoading) return;

    const req = (refresh && lastRequest) ? { ...lastRequest } : readForm();
    if (!req.lesson) {
        setStatus('اكتب اسم الدرس أولاً.', 'error');
        document.getElementById('lesson').focus();
        return;
    }
    lastRequest = req;

    setBusy(true);
    setStatus('جاري تجهيز النشاط... ⏳ قد يستغرق ذلك بضع ثوانٍ', 'loading');

    try {
        const response = await fetch('/api/generate-activity', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...req, refresh: refresh === true })
        });

        let data = {};
        try { data = await response.json(); } catch (_) { /* ignore */ }
        if (!response.ok || data.error) throw new Error(data.error || 'تعذر الاتصال بالخادم');

        showActivity(data, true);
        setStatus(`تم إنشاء نشاط «${data.typeName}» 🇴🇲`, 'ok');
    } catch (err) {
        console.error(err);
        setStatus(err.message, 'error');
    } finally {
        setBusy(false);
    }
}

/* ---------- الرسومات بالذكاء الاصطناعي ---------- */

async function illustrate() {
    if (isLoading || !lastActivity) return;
    const a = lastActivity;
    const prompts = (a.illustrationPrompts && a.illustrationPrompts.length)
        ? a.illustrationPrompts
        : [`${a.section || a.lesson}, Oman, educational`];

    setBusy(true);
    setStatus('جاري رسم الصور... 🎨 قد يستغرق ذلك نصف دقيقة', 'loading');

    try {
        const response = await fetch('/api/generate-illustrations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompts })
        });

        let data = {};
        try { data = await response.json(); } catch (_) { /* ignore */ }
        if (!response.ok || data.error) throw new Error(data.error || 'تعذر توليد الرسومات');

        a.illustrations = await Promise.all(
            data.images.map(u => (u ? shrinkDataUrl(u).catch(() => null) : null))
        );
        showActivity(a, false);
        setStatus('تمت إضافة الرسومات 🎨', 'ok');
    } catch (err) {
        console.error(err);
        setStatus(err.message, 'error');
    } finally {
        setBusy(false);
    }
}

/* ---------- أدوات مساعدة ---------- */

function esc(v) {
    return String(v ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function dot(n, bg) {
    return `<span class="${bg} text-white w-7 h-7 rounded-full inline-flex items-center justify-center text-xs font-black shrink-0">${n}</span>`;
}

const line = (h = 'h-6') => `<div class="flex-1 border-b-2 border-dotted border-slate-400 ${h}"></div>`;

function numberedLines(count, bg) {
    return Array.from({ length: count }, (_, i) =>
        `<div class="flex items-center gap-2 py-2">${dot(i + 1, bg)}${line()}</div>`).join('');
}

function tag(text, cls) {
    return `<span class="absolute -top-4 right-4 ${cls} text-white font-black text-sm px-5 py-1.5 rounded-2xl shadow">${text}</span>`;
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/* ---------- الغلاف المشترك ---------- */

function iconSlot(a, i) {
    const url = a.illustrations && a.illustrations[i];
    if (typeof url === 'string' && /^data:image\//.test(url)) {
        return `<img src="${url}" alt="" class="w-20 h-20 md:w-28 md:h-28 object-contain rounded-2xl shrink-0">`;
    }
    return `<div class="text-4xl md:text-6xl shrink-0 select-none" aria-hidden="true">${esc(i === 0 ? a.iconsStart : a.iconsEnd)}</div>`;
}

function creditFooter() {
    if (!credit.name && !credit.photo) return '';
    const label = credit.name ? `${credit.prefix} ${credit.name}` : '';
    return `
        <div class="flex items-center justify-between gap-3 pt-3 border-t-2 border-dashed border-slate-200">
            <div class="flex items-center gap-3">
                ${credit.photo ? `<img src="${credit.photo}" alt="" class="w-14 h-14 rounded-full object-cover border-2 border-teal-500 shadow">` : ''}
                ${label ? `<p class="text-sm font-black text-slate-700">${esc(label)}</p>` : ''}
            </div>
            <p class="text-[11px] font-bold text-slate-400">مساعد الأنشطة الذكي 🇴🇲</p>
        </div>`;
}

function shell(a, inner) {
    const meta = [a.grade, a.subject, a.lesson, a.section].filter(Boolean).join(' • ');
    return `
    <div id="worksheetPaper" class="ws-paper bg-white rounded-3xl p-5 md:p-6 space-y-5 text-slate-800" dir="rtl">
        <div class="flex items-center justify-between gap-3">
            ${iconSlot(a, 0)}
            <div class="flex-1 text-center bg-sky-50 border-4 border-sky-400 rounded-[2.5rem] px-5 py-4">
                <span class="inline-block bg-sky-600 text-white text-[11px] font-black px-3 py-0.5 rounded-full mb-1.5">${esc(a.typeName)}</span>
                <h2 class="text-xl md:text-3xl font-black text-sky-950 leading-snug">${esc(a.title)}</h2>
                ${meta ? `<p class="text-xs font-bold text-sky-700 mt-1">${esc(meta)}</p>` : ''}
            </div>
            ${iconSlot(a, 1)}
        </div>

        ${(a.objective || a.time) ? `
        <div class="flex flex-wrap items-center gap-2 text-xs font-bold">
            ${a.objective ? `<div class="flex-1 min-w-[200px] bg-emerald-50 border border-emerald-300 rounded-2xl px-3 py-2"><span class="font-black text-emerald-800">🎯 الهدف: </span>${esc(a.objective)}</div>` : ''}
            ${a.time ? `<div class="bg-amber-50 border border-amber-300 rounded-2xl px-3 py-2"><span class="font-black text-amber-800">⏱️ المدة: </span>${esc(a.time)}</div>` : ''}
        </div>` : ''}

        ${inner}

        ${a.teacherRole ? `
        <div class="relative border-2 border-teal-400 bg-teal-50/60 rounded-3xl px-4 pt-7 pb-4">
            ${tag('👨‍🏫 دور المعلم', 'bg-teal-600')}
            <p class="text-xs font-medium leading-relaxed">${esc(a.teacherRole)}</p>
        </div>` : ''}

        ${creditFooter()}
    </div>`;
}

/* ---------- 1) فكر – زاوج – شارك ---------- */

function renderTps(b) {
    const passage = b.passage.map(p => `<p class="mb-2 last:mb-0">${esc(p)}</p>`).join('');

    const pairRows = Array.from({ length: b.pairRows }, (_, i) => `
        <div class="grid grid-cols-2 border-t border-sky-200">
            <div class="flex items-center gap-2 p-2 border-l border-sky-200">${dot(i + 1, 'bg-sky-600')}${line()}</div>
            <div class="p-2 flex items-center">${line()}</div>
        </div>`).join('');

    const questions = b.questions.map((q, i) => `
        <li class="flex items-start gap-2 py-1.5">${dot(i + 1, 'bg-violet-600')}<span class="leading-relaxed">${esc(q)}</span></li>`).join('');

    return `
        <div class="relative border-2 border-indigo-400 bg-indigo-50/40 rounded-3xl px-5 pt-7 pb-4">
            <span class="absolute -top-4 left-1/2 -translate-x-1/2 bg-indigo-600 text-white font-black text-sm px-8 py-1.5 rounded-2xl shadow">النص</span>
            <div class="text-sm leading-loose font-medium text-slate-900">${passage}</div>
        </div>

        <div class="mx-auto max-w-md text-center bg-amber-300 border-2 border-amber-500 rounded-3xl px-4 py-2.5 shadow-sm">
            <div class="text-lg md:text-xl font-black text-slate-900">💡 فكر – زاوج – شارك</div>
            <div class="text-xs font-bold text-slate-800">في مجموعات استنتاجات حول النص</div>
        </div>

        <div class="ws-g3">
            <div class="relative border-2 border-emerald-500 bg-emerald-50/50 rounded-3xl px-4 pt-7 pb-4">
                ${tag('أولاً: فكر 🧠', 'bg-emerald-600')}
                <p class="text-xs font-bold leading-relaxed mb-2">${esc(b.thinkInstruction)}</p>
                <p class="text-xs font-black text-emerald-800 mb-1">اكتب ${b.thinkCount} استنتاجات على الأقل.</p>
                <div class="bg-white border border-emerald-300 rounded-2xl px-3 py-1">${numberedLines(b.thinkCount, 'bg-emerald-600')}</div>
            </div>

            <div class="relative border-2 border-sky-500 bg-sky-50/50 rounded-3xl px-4 pt-7 pb-4">
                ${tag('ثانياً: زاوج 👥', 'bg-sky-600')}
                <p class="text-xs font-bold leading-relaxed mb-2">${esc(b.pairInstruction)}</p>
                <div class="bg-white border border-sky-300 rounded-2xl overflow-hidden">
                    <div class="grid grid-cols-2 bg-sky-600 text-white text-xs font-black text-center">
                        <div class="py-2 border-l border-sky-300">الاستنتاج</div>
                        <div class="py-2">الدليل من النص</div>
                    </div>
                    ${pairRows}
                </div>
            </div>

            <div class="relative border-2 border-violet-500 bg-violet-50/50 rounded-3xl px-4 pt-7 pb-4">
                ${tag('ثالثاً: شارك 🗣️', 'bg-violet-600')}
                <p class="text-xs font-bold leading-relaxed mb-2">${esc(b.shareInstruction)}</p>
                ${questions ? `<div class="bg-white border border-violet-300 rounded-2xl px-3 py-2">
                    <p class="text-xs font-black text-violet-800 mb-1">أسئلة موجهة للمجموعات:</p>
                    <ol class="text-xs font-medium">${questions}</ol></div>` : ''}
            </div>
        </div>

        ${b.challenge ? `
        <div class="relative border-2 border-rose-400 bg-rose-50/60 rounded-3xl px-4 pt-7 pb-4">
            ${tag('🎯 مهمة التحدي', 'bg-rose-500')}
            <p class="text-xs font-bold leading-relaxed mb-3">${esc(b.challenge)}</p>
            <div class="bg-white border border-rose-300 rounded-2xl px-3 py-2">
                ${b.challengeStarter ? `<p class="text-xs text-rose-600 font-black mb-1">${esc(b.challengeStarter)}</p>` : ''}
                <div class="flex">${line()}</div>
            </div>
        </div>` : ''}`;
}

/* ---------- 2) العصف الذهني ---------- */

function renderBrainstorm(b) {
    const rules = b.rules.map(r => `<span class="bg-white border border-amber-300 text-amber-900 text-xs font-bold rounded-full px-3 py-1.5">✅ ${esc(r)}</span>`).join('');
    const guiding = b.guidingQuestions.map((q, i) => `
        <li class="flex items-start gap-2 py-1">${dot(i + 1, 'bg-sky-600')}<span class="leading-relaxed">${esc(q)}</span></li>`).join('');
    const slots = Array.from({ length: b.ideaSlots }, (_, i) => `
        <div class="border-2 border-dashed border-amber-400 bg-amber-50/40 rounded-2xl min-h-[84px] p-2">
            ${dot(i + 1, 'bg-amber-500')}
        </div>`).join('');

    return `
        <div class="text-center">
            <div class="inline-block max-w-2xl bg-amber-100 border-4 border-amber-400 rounded-[2.5rem] px-6 py-5 shadow-sm">
                <p class="text-xs font-black text-amber-800 mb-1">⚡ سؤال العصف الذهني</p>
                <p class="text-lg md:text-xl font-black text-slate-900 leading-relaxed">${esc(b.question)}</p>
            </div>
        </div>

        ${rules ? `<div class="flex flex-wrap justify-center gap-2">${rules}</div>` : ''}

        ${guiding ? `
        <div class="relative border-2 border-sky-400 bg-sky-50/50 rounded-3xl px-4 pt-7 pb-3">
            ${tag('💭 أسئلة تحفّز أفكارك', 'bg-sky-600')}
            <ul class="text-xs font-medium">${guiding}</ul>
        </div>` : ''}

        <div class="relative border-2 border-amber-400 bg-white rounded-3xl px-4 pt-7 pb-4">
            ${tag('🧠 أفكار المجموعة', 'bg-amber-500')}
            <div class="ws-ideas">${slots}</div>
        </div>

        <div class="relative border-2 border-emerald-400 bg-emerald-50/50 rounded-3xl px-4 pt-7 pb-4">
            ${tag('⭐ أفضل الأفكار', 'bg-emerald-600')}
            <p class="text-xs font-bold leading-relaxed mb-2">${esc(b.summaryPrompt)}</p>
            <div class="bg-white border border-emerald-300 rounded-2xl px-3 py-1">${numberedLines(3, 'bg-emerald-600')}</div>
        </div>`;
}

/* ---------- 3) الخريطة الذهنية ---------- */

const MM_COLORS = ['emerald', 'sky', 'violet', 'rose', 'amber', 'teal'];
const MM_HEX = ['#059669', '#0284c7', '#7c3aed', '#e11d48', '#d97706', '#0d9488'];
// مركز كل خلية كنسبة مئوية (العمود الأول يمين الصفحة لأن الاتجاه RTL)
const MM_POS = [[83.3, 16.7], [16.7, 16.7], [16.7, 83.3], [83.3, 83.3], [83.3, 50], [16.7, 50]];

function renderMindmap(b) {
    const lines = b.branches.map((_, i) =>
        `<line x1="50" y1="50" x2="${MM_POS[i][0]}" y2="${MM_POS[i][1]}" stroke="${MM_HEX[i]}" stroke-width="4" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`).join('');

    const branches = b.branches.map((br, i) => {
        const c = MM_COLORS[i];
        const hints = (br.hints.length ? br.hints : ['اكتب هنا']).map(h => `
            <div class="mb-1.5">
                <p class="text-[11px] text-slate-500 font-semibold leading-tight">${esc(h)}</p>
                <div class="border-b-2 border-dotted border-slate-400 h-4"></div>
            </div>`).join('');
        return `
        <div class="mm-p${i + 1} border-2 border-${c}-400 bg-${c}-50 rounded-2xl overflow-hidden shadow-sm">
            <div class="bg-${c}-600 text-white text-xs font-black text-center px-2 py-1.5">${esc(br.title)}</div>
            <div class="p-2">${hints}</div>
        </div>`;
    }).join('');

    return `
        <p class="text-sm font-bold text-slate-700">${esc(b.instruction)}</p>

        <div class="mm-wrap">
            <svg class="mm-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>
            <div class="mm-center bg-amber-300 border-4 border-amber-500 rounded-[2rem] px-5 py-4 text-center shadow-md max-w-[220px]">
                <span class="block text-[11px] font-black text-amber-900">🕸️ الموضوع</span>
                <span class="block text-base md:text-lg font-black text-slate-900 leading-snug">${esc(b.center)}</span>
            </div>
            ${branches}
        </div>

        ${b.reflection ? `
        <div class="relative border-2 border-rose-400 bg-rose-50/60 rounded-3xl px-4 pt-7 pb-4">
            ${tag('🔗 اربط الأفكار', 'bg-rose-500')}
            <p class="text-xs font-bold leading-relaxed mb-2">${esc(b.reflection)}</p>
            <div class="bg-white border border-rose-300 rounded-2xl px-3 py-1">${numberedLines(2, 'bg-rose-500')}</div>
        </div>` : ''}`;
}

/* ---------- 4) تصنيف المعلومات ---------- */

const CLS_COLORS = ['emerald', 'sky', 'violet', 'rose'];

function renderClassify(b) {
    const n = b.categories.length;
    const bank = shuffle(b.categories.flatMap(c => c.items))
        .map(it => `<span class="bg-amber-100 border border-amber-400 text-slate-900 text-xs font-bold rounded-xl px-3 py-1.5">${esc(it)}</span>`).join('');
    const maxItems = Math.max(...b.categories.map(c => c.items.length));

    const cols = b.categories.map((c, i) => {
        const col = CLS_COLORS[i % 4];
        const rows = Array.from({ length: maxItems }, () =>
            `<div class="flex items-center py-1.5">${line()}</div>`).join('');
        return `
        <div class="border-2 border-${col}-400 bg-white rounded-2xl overflow-hidden">
            <div class="bg-${col}-600 text-white text-sm font-black text-center px-2 py-2">${esc(c.name)}</div>
            <div class="px-3 py-1">${rows}</div>
        </div>`;
    }).join('');

    return `
        <p class="text-sm font-bold text-slate-700">${esc(b.instruction)}</p>

        <div class="relative border-2 border-amber-400 bg-amber-50/50 rounded-3xl px-4 pt-7 pb-4">
            ${tag('🧺 بنك المعلومات', 'bg-amber-500')}
            <div class="flex flex-wrap gap-2">${bank}</div>
        </div>

        <div class="ws-cats" style="--n:${n}">${cols}</div>

        ${b.reflection ? `
        <div class="relative border-2 border-rose-400 bg-rose-50/60 rounded-3xl px-4 pt-7 pb-4">
            ${tag('🎯 فكّر وبرّر', 'bg-rose-500')}
            <p class="text-xs font-bold leading-relaxed mb-2">${esc(b.reflection)}</p>
            <div class="bg-white border border-rose-300 rounded-2xl px-3 py-1">${numberedLines(2, 'bg-rose-500')}</div>
        </div>` : ''}`;
}

function classifyAnswerKey(b) {
    const items = b.categories.map(c => `
        <div><p class="font-black text-teal-800">${esc(c.name)}</p>
        <ul class="list-disc pr-5">${c.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>`).join('');
    return `
    <details class="no-print mt-4 bg-slate-50 border border-slate-200 rounded-2xl p-3">
        <summary class="cursor-pointer text-xs font-black text-slate-700">🔑 نموذج الإجابة للمعلم (لا يظهر في الطباعة)</summary>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 text-xs font-medium">${items}</div>
    </details>`;
}

/* ---------- 5) التعلم التعاوني ---------- */

function renderCooperative(b) {
    const roleColors = ['emerald', 'sky', 'violet', 'rose', 'amber'];
    const roles = b.roles.map((r, i) => {
        const c = roleColors[i % 5];
        return `
        <div class="border-2 border-${c}-400 bg-${c}-50 rounded-2xl overflow-hidden">
            <div class="bg-${c}-600 text-white text-xs font-black text-center px-2 py-1.5">👤 ${esc(r.role)}</div>
            <p class="text-xs font-medium leading-relaxed p-2.5">${esc(r.duty)}</p>
        </div>`;
    }).join('');

    const steps = b.steps.map((s, i) => `
        <div class="flex items-start gap-3 bg-white border border-sky-200 rounded-2xl px-3 py-2.5">
            ${dot(i + 1, 'bg-sky-600')}
            <div class="text-xs leading-relaxed"><span class="font-black text-sky-900 block">${esc(s.title)}</span><span class="font-medium">${esc(s.detail)}</span></div>
        </div>`).join('');

    const criteria = b.criteria.map(c => `
        <div class="grid grid-cols-[1fr_64px_64px_64px] border-t border-teal-200 text-xs">
            <div class="p-2 font-medium leading-relaxed border-l border-teal-200">${esc(c)}</div>
            <div class="border-l border-teal-200 flex items-center justify-center"><span class="w-4 h-4 border-2 border-slate-400 rounded"></span></div>
            <div class="border-l border-teal-200 flex items-center justify-center"><span class="w-4 h-4 border-2 border-slate-400 rounded"></span></div>
            <div class="flex items-center justify-center"><span class="w-4 h-4 border-2 border-slate-400 rounded"></span></div>
        </div>`).join('');

    return `
        <div class="bg-amber-100 border-4 border-amber-400 rounded-3xl px-5 py-4 text-center shadow-sm">
            <p class="text-xs font-black text-amber-800 mb-1">🤝 مهمة المجموعة</p>
            <p class="text-base md:text-lg font-black text-slate-900 leading-relaxed">${esc(b.mission)}</p>
        </div>

        <div class="relative border-2 border-violet-400 bg-violet-50/40 rounded-3xl px-4 pt-7 pb-4">
            ${tag('👥 أدوار أعضاء المجموعة', 'bg-violet-600')}
            <div class="ws-roles" style="--n:${Math.min(b.roles.length, 5)}">${roles}</div>
        </div>

        <div class="relative border-2 border-sky-400 bg-sky-50/40 rounded-3xl px-4 pt-7 pb-4">
            ${tag('🛠️ خطوات العمل', 'bg-sky-600')}
            <div class="ws-g2">${steps}</div>
        </div>

        ${b.product ? `
        <div class="relative border-2 border-emerald-400 bg-emerald-50/50 rounded-3xl px-4 pt-7 pb-4">
            ${tag('📌 ناتج المجموعة', 'bg-emerald-600')}
            <p class="text-xs font-bold leading-relaxed mb-2">${esc(b.product)}</p>
            <div class="bg-white border border-emerald-300 rounded-2xl px-3 py-1">${numberedLines(3, 'bg-emerald-600')}</div>
        </div>` : ''}

        ${criteria ? `
        <div class="relative border-2 border-teal-400 bg-white rounded-3xl px-3 pt-7 pb-3">
            ${tag('⭐ تقويم عمل المجموعة', 'bg-teal-600')}
            <div class="border border-teal-200 rounded-2xl overflow-hidden">
                <div class="grid grid-cols-[1fr_64px_64px_64px] bg-teal-600 text-white text-[11px] font-black text-center">
                    <div class="py-2 border-l border-teal-300">المعيار</div>
                    <div class="py-2 border-l border-teal-300">يحتاج دعماً</div>
                    <div class="py-2 border-l border-teal-300">جيد</div>
                    <div class="py-2">ممتاز</div>
                </div>
                ${criteria}
            </div>
        </div>` : ''}`;
}

/* ---------- العرض ---------- */

function showActivity(a, scroll) {
    const renderers = {
        tps: renderTps,
        brainstorm: renderBrainstorm,
        mindmap: renderMindmap,
        classify: renderClassify,
        cooperative: renderCooperative
    };
    const render = renderers[a.type] || renderTps;

    lastActivity = a;
    lastTitle = a.title || 'activity';

    document.getElementById('emptyState').classList.add('hidden');
    document.getElementById('activityContent').classList.remove('hidden');

    const worksheet = document.getElementById('worksheet');
    worksheet.innerHTML = shell(a, render(a.body)) + (a.type === 'classify' ? classifyAnswerKey(a.body) : '');
    if (scroll) worksheet.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------- حفظ كصورة (بعرض أفقي ثابت) ---------- */

async function downloadWorksheetImage() {
    const paper = document.getElementById('worksheetPaper');
    const btn = document.getElementById('downloadBtn');
    if (!paper) return;

    if (typeof html2canvas === 'undefined') {
        alert('تعذر تحميل أداة الحفظ كصورة. استخدم زر الطباعة ثم اختر "حفظ كملف PDF".');
        return;
    }

    const original = btn.textContent;
    btn.textContent = 'جاري التجهيز... ⏳';
    btn.disabled = true;

    // نسخة خارج الشاشة بعرض 1400px لتخرج الصورة بشكل أفقي ثابت مهما كان حجم الشاشة
    const wrap = document.createElement('div');
    wrap.id = 'exportWrap';
    wrap.style.cssText = 'position:fixed;left:-20000px;top:0;width:1400px;background:#fff;';
    const clone = paper.cloneNode(true);
    clone.removeAttribute('id');
    clone.style.width = '1400px';
    wrap.appendChild(clone);
    document.body.appendChild(wrap);

    try {
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
        const canvas = await html2canvas(clone, {
            scale: 2,
            backgroundColor: '#ffffff',
            useCORS: true,
            windowWidth: 1400,
            scrollX: 0,
            scrollY: 0,
            onclone: (doc) => {
                const w = doc.getElementById('exportWrap');
                if (w) { w.style.position = 'absolute'; w.style.left = '0'; w.style.top = '0'; }
            }
        });
        const link = document.createElement('a');
        link.download = `${lastTitle.replace(/[\\/:*?"<>|]/g, '').trim() || 'activity'}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    } catch (err) {
        console.error(err);
        alert('تعذر حفظ الصورة. استخدم زر الطباعة ثم اختر "حفظ كملف PDF".');
    } finally {
        wrap.remove();
        btn.textContent = original;
        btn.disabled = false;
    }
}

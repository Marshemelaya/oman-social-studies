document.addEventListener('DOMContentLoaded', () => {
    const sendBtn = document.getElementById('sendBtn');
    const userInput = document.getElementById('userInput');

    if (sendBtn && userInput) {
        sendBtn.addEventListener('click', handleUserMessage);
        userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleUserMessage();
        });
    }

    const printBtn = document.getElementById('printBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    if (printBtn) printBtn.addEventListener('click', () => window.print());
    if (downloadBtn) downloadBtn.addEventListener('click', downloadWorksheetImage);
});

let isLoading = false;
let lastTitle = 'worksheet';

function handleUserMessage() {
    if (isLoading) return;
    const userInput = document.getElementById('userInput');
    const text = userInput.value.trim();
    if (!text) return;

    appendMessage(escapeHtml(text), 'user');
    userInput.value = '';

    callServerAI(text);
}

function appendMessage(html, sender) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return null;

    const msgDiv = document.createElement('div');

    if (sender === 'user') {
        msgDiv.className = "flex items-start justify-end gap-2.5";
        msgDiv.innerHTML = `
            <div class="bg-teal-600 text-white p-3.5 rounded-2xl rounded-tl-none max-w-[85%] leading-relaxed font-medium shadow-sm">${html}</div>
            <div class="bg-slate-700 text-white w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 font-bold text-xs shadow-sm">أنت</div>
        `;
    } else {
        msgDiv.className = "flex items-start gap-2.5";
        msgDiv.innerHTML = `
            <div class="bg-teal-600 text-white w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 font-black text-sm shadow-md">🤖</div>
            <div class="bg-teal-50 p-4 rounded-2xl rounded-tr-none text-teal-950 max-w-[85%] leading-relaxed border border-teal-100 font-medium">${html}</div>
        `;
    }

    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return msgDiv;
}

async function callServerAI(query) {
    isLoading = true;
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) sendBtn.disabled = true;

    const loadingMsg = appendMessage("جاري تجهيز ورقة العمل... ⏳ قد يستغرق ذلك بضع ثوانٍ", 'assistant');

    try {
        const response = await fetch('/api/generate-activity', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });

        let data = {};
        try { data = await response.json(); } catch (_) { /* ignore */ }

        if (!response.ok || data.error) {
            throw new Error(data.error || 'تعذر الاتصال بالخادم');
        }

        if (loadingMsg) loadingMsg.remove();
        appendMessage(`تم إعداد ورقة العمل: <b class="text-teal-800">"${escapeHtml(data.title)}"</b> 🇴🇲 تفقد اللوحة المجاورة!`, 'assistant');
        renderActivityCard(data);

    } catch (error) {
        console.error(error);
        if (loadingMsg) loadingMsg.remove();
        appendMessage(escapeHtml(error.message), 'assistant');
    } finally {
        isLoading = false;
        if (sendBtn) sendBtn.disabled = false;
    }
}

/* ---------- ورقة العمل ---------- */

function esc(v) {
    return String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function numDot(n, colorClass) {
    return `<span class="${colorClass} text-white w-7 h-7 rounded-full inline-flex items-center justify-center text-xs font-black shrink-0">${n}</span>`;
}

function buildWorksheet(a) {
    const passage = a.passage
        .map(p => `<p class="mb-2 last:mb-0">${esc(p)}</p>`)
        .join('');

    const thinkLines = Array.from({ length: a.think.count }, (_, i) => `
        <div class="flex items-center gap-2 py-2">
            ${numDot(i + 1, 'bg-emerald-600')}
            <div class="flex-1 border-b-2 border-dotted border-slate-400 h-6"></div>
        </div>`).join('');

    const pairRows = Array.from({ length: a.pair.rows }, (_, i) => `
        <div class="grid grid-cols-2 border-t border-sky-200">
            <div class="flex items-center gap-2 p-2 border-l border-sky-200">
                ${numDot(i + 1, 'bg-sky-600')}
                <div class="flex-1 border-b-2 border-dotted border-slate-400 h-6"></div>
            </div>
            <div class="p-2 flex items-center">
                <div class="flex-1 border-b-2 border-dotted border-slate-400 h-6"></div>
            </div>
        </div>`).join('');

    const questions = a.share.questions
        .map((q, i) => `
        <li class="flex items-start gap-2 py-1.5">
            ${numDot(i + 1, 'bg-violet-600')}
            <span class="leading-relaxed">${esc(q)}</span>
        </li>`).join('');

    const challengeText = a.challenge.instruction
        ? `<p class="font-bold leading-relaxed mb-3">${esc(a.challenge.instruction)}</p>` : '';
    const starter = a.challenge.starter
        ? `<p class="text-rose-600 font-black mb-1">${esc(a.challenge.starter)}</p>` : '';

    return `
    <div id="worksheetPaper" class="ws-paper bg-white rounded-3xl p-5 md:p-6 space-y-5 text-slate-800" dir="rtl">

        <!-- العنوان -->
        <div class="flex items-center justify-between gap-3">
            <div class="text-4xl md:text-6xl shrink-0 select-none" aria-hidden="true">${esc(a.iconsStart)}</div>
            <div class="flex-1 text-center bg-sky-50 border-4 border-sky-400 rounded-[2.5rem] px-5 py-4">
                <h2 class="text-xl md:text-3xl font-black text-sky-950 leading-snug">${esc(a.title)}</h2>
                ${(a.grade || a.branch) ? `<p class="text-xs font-bold text-sky-700 mt-1">${esc([a.grade, a.branch].filter(Boolean).join(' • '))}</p>` : ''}
            </div>
            <div class="text-4xl md:text-6xl shrink-0 select-none" aria-hidden="true">${esc(a.iconsEnd)}</div>
        </div>

        <!-- النص -->
        <div class="relative border-2 border-indigo-400 bg-indigo-50/40 rounded-3xl px-5 pt-7 pb-4">
            <span class="absolute -top-4 left-1/2 -translate-x-1/2 bg-indigo-600 text-white font-black text-sm px-8 py-1.5 rounded-2xl shadow">النص</span>
            <div class="text-sm leading-loose font-medium text-slate-900">${passage}</div>
        </div>

        <!-- شريط فكر زاوج شارك -->
        <div class="mx-auto max-w-md text-center bg-amber-300 border-2 border-amber-500 rounded-3xl px-4 py-2.5 shadow-sm">
            <div class="text-lg md:text-xl font-black text-slate-900">💡 فكر – زاوج – شارك</div>
            <div class="text-xs font-bold text-slate-800">في مجموعات استنتاجات حول النص</div>
        </div>

        <!-- المراحل الثلاث -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">

            <div class="relative border-2 border-emerald-500 bg-emerald-50/50 rounded-3xl px-4 pt-7 pb-4">
                <span class="absolute -top-4 right-4 bg-emerald-600 text-white font-black text-sm px-5 py-1.5 rounded-2xl shadow">أولاً: فكر 🧠</span>
                <p class="text-xs font-bold leading-relaxed mb-2">${esc(a.think.instruction)}</p>
                <p class="text-xs font-black text-emerald-800 mb-1">اكتب ${a.think.count} استنتاجات على الأقل.</p>
                <div class="bg-white border border-emerald-300 rounded-2xl px-3 py-1">${thinkLines}</div>
            </div>

            <div class="relative border-2 border-sky-500 bg-sky-50/50 rounded-3xl px-4 pt-7 pb-4">
                <span class="absolute -top-4 right-4 bg-sky-600 text-white font-black text-sm px-5 py-1.5 rounded-2xl shadow">ثانياً: زاوج 👥</span>
                <p class="text-xs font-bold leading-relaxed mb-2">${esc(a.pair.instruction)}</p>
                <div class="bg-white border border-sky-300 rounded-2xl overflow-hidden">
                    <div class="grid grid-cols-2 bg-sky-600 text-white text-xs font-black text-center">
                        <div class="py-2 border-l border-sky-300">الاستنتاج</div>
                        <div class="py-2">الدليل من النص</div>
                    </div>
                    ${pairRows}
                </div>
            </div>

            <div class="relative border-2 border-violet-500 bg-violet-50/50 rounded-3xl px-4 pt-7 pb-4">
                <span class="absolute -top-4 right-4 bg-violet-600 text-white font-black text-sm px-5 py-1.5 rounded-2xl shadow">ثالثاً: شارك 🗣️</span>
                <p class="text-xs font-bold leading-relaxed mb-2">${esc(a.share.instruction)}</p>
                ${questions ? `
                <div class="bg-white border border-violet-300 rounded-2xl px-3 py-2">
                    <p class="text-xs font-black text-violet-800 mb-1">أسئلة موجهة للمجموعات:</p>
                    <ol class="text-xs font-medium">${questions}</ol>
                </div>` : ''}
            </div>
        </div>

        <!-- التحدي ودور المعلم -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <div class="relative border-2 border-rose-400 bg-rose-50/60 rounded-3xl px-4 pt-7 pb-4">
                <span class="absolute -top-4 right-4 bg-rose-500 text-white font-black text-sm px-5 py-1.5 rounded-2xl shadow">🎯 مهمة التحدي</span>
                <div class="text-xs">${challengeText}
                    <div class="bg-white border border-rose-300 rounded-2xl px-3 py-2">
                        ${starter}
                        <div class="border-b-2 border-dotted border-slate-400 h-6"></div>
                    </div>
                </div>
            </div>
            ${a.teacherRole ? `
            <div class="relative border-2 border-teal-400 bg-teal-50/60 rounded-3xl px-4 pt-7 pb-4">
                <span class="absolute -top-4 right-4 bg-teal-600 text-white font-black text-sm px-5 py-1.5 rounded-2xl shadow">👨‍🏫 دور المعلم</span>
                <p class="text-xs font-medium leading-relaxed">${esc(a.teacherRole)}</p>
            </div>` : ''}
        </div>

    </div>`;
}

function renderActivityCard(act) {
    const emptyState = document.getElementById('emptyState');
    const activityContent = document.getElementById('activityContent');
    const worksheet = document.getElementById('worksheet');

    if (emptyState) emptyState.classList.add('hidden');
    if (activityContent) activityContent.classList.remove('hidden');

    lastTitle = act.title || 'worksheet';
    worksheet.innerHTML = buildWorksheet(act);
    worksheet.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------- حفظ كصورة ---------- */

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

    try {
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
        const canvas = await html2canvas(paper, {
            scale: 2,
            backgroundColor: '#ffffff',
            useCORS: true
        });
        const link = document.createElement('a');
        link.download = `${lastTitle.replace(/[\\/:*?"<>|]/g, '').trim() || 'worksheet'}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    } catch (err) {
        console.error(err);
        alert('تعذر حفظ الصورة. استخدم زر الطباعة ثم اختر "حفظ كملف PDF".');
    } finally {
        btn.textContent = original;
        btn.disabled = false;
    }
}

function escapeHtml(string) {
    return esc(string);
}

document.addEventListener('DOMContentLoaded', () => {
    const sendBtn = document.getElementById('sendBtn');
    const userInput = document.getElementById('userInput');

    if (sendBtn && userInput) {
        sendBtn.addEventListener('click', handleUserMessage);
        userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleUserMessage();
        });
    }
});

function handleUserMessage() {
    const userInput = document.getElementById('userInput');
    const text = userInput.value.trim();
    if (!text) return;

    appendMessage(text, 'user');
    userInput.value = '';

    callServerAI(text);
}

function appendMessage(text, sender) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;

    const msgDiv = document.createElement('div');
    
    if (sender === 'user') {
        msgDiv.className = "flex items-start justify-end gap-2.5";
        msgDiv.innerHTML = `
            <div class="bg-teal-600 text-white p-3.5 rounded-2xl rounded-tl-none max-w-[85%] leading-relaxed font-medium shadow-sm">${escapeHtml(text)}</div>
            <div class="bg-slate-700 text-white w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 font-bold text-xs shadow-sm">أنت</div>
        `;
    } else {
        msgDiv.className = "flex items-start gap-2.5";
        msgDiv.innerHTML = `
            <div class="bg-teal-600 text-white w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 font-black text-sm shadow-md">🤖</div>
            <div class="bg-teal-50 p-4 rounded-2xl rounded-tr-none text-teal-950 max-w-[85%] leading-relaxed border border-teal-100 font-medium">${text}</div>
        `;
    }
    
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// الاتصال بالخادم المحلي الوسيط بدلاً من الاتصال المباشر
async function callServerAI(query) {
    appendMessage("جاري مراجعة المنهج العماني وتجهيز المشروع عبر الخادم... ⏳", 'assistant');

    try {
        const response = await fetch('/api/generate-activity', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: query })
        });

        const activityData = await response.json();

        if (!response.ok || activityData.error) {
            throw new Error(activityData.error || "خطأ في الخادم");
        }

        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages && chatMessages.lastChild) {
            chatMessages.removeChild(chatMessages.lastChild);
        }

        appendMessage(`تم بنجاح إعداد ورقة المشروع لـ: <b class="text-teal-800">"${activityData.title}"</b> 🇴🇲 تفقد اللوحة المجاورة!`, 'assistant');
        renderActivityCard(activityData);

    } catch (error) {
        console.error(error);
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages && chatMessages.lastChild) {
            chatMessages.removeChild(chatMessages.lastChild);
        }
        // عرض الخطأ الحقيقي القادم من السيرفر في المحادثة مباشرة
        appendMessage(`حدث خطأ: ${escapeHtml(error.message)}`, 'assistant');
    }
}

function renderActivityCard(act) {
    const emptyState = document.getElementById('emptyState');
    const activityContent = document.getElementById('activityContent');

    if (emptyState) emptyState.classList.add('hidden');
    if (activityContent) activityContent.classList.remove('hidden');

    document.getElementById('cardBadge').innerText = `${act.grade} • ${act.branch}`;
    document.getElementById('cardTitle').innerText = act.title;
    
    document.getElementById('cardCharacter').innerText = act.character || "🌟";
    document.getElementById('characterTitle').innerText = act.characterTitle || "قائد النشاط";
    document.getElementById('characterHint').innerText = act.characterHint || "مبتكر الأنشطة";
    
    document.getElementById('cardImage').src = act.image;
    document.getElementById('imageCaption').innerText = act.imageCaption;
    document.getElementById('cardDescription').innerText = act.description;

    const stepsContainer = document.getElementById('cardProjectSteps');
    stepsContainer.innerHTML = '';
    act.detailedSteps.forEach(stepObj => {
        const div = document.createElement('div');
        div.className = "bg-teal-50/70 p-3.5 rounded-xl border border-teal-100 text-xs";
        div.innerHTML = `
            <span class="font-black text-teal-900 block mb-1">📍 ${stepObj.stage}</span>
            <span class="text-slate-700 leading-relaxed font-medium">${stepObj.detail}</span>
        `;
        stepsContainer.appendChild(div);
    });

    document.getElementById('cardStudentRole').innerText = act.studentRole;
    document.getElementById('cardAssessment').innerText = act.assessment;
}function escapeHtml(string) {
    return string.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
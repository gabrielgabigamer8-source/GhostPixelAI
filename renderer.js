import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, onSnapshot, addDoc, serverTimestamp, query, orderBy, doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- CONFIGURAÇÃO ---
// Substitui pelos teus dados reais se não estiveres a usar o ambiente simulado
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'ghost-pixel-ia';

let user = null;
let currentProjectId = localStorage.getItem('ghost_pid');
let userApiKey = localStorage.getItem('ghost_key') || '';

// --- ELEMENTOS DO DASHBOARD (Baseados na tua imagem) ---
const projectList = document.querySelector('.flex-1.overflow-y-auto'); // Onde ficam os projetos
const newProjectBtn = document.querySelector('.border-dashed'); // O botão "+ NOVO PROJETO"
const chatWindow = document.getElementById('chat-window') || document.querySelector('main > div:nth-child(2)');
const userInput = document.querySelector('textarea'); 
const sendBtn = document.querySelector('button svg')?.parentElement;

// --- INICIALIZAÇÃO ---
async function startApp() {
    await signInAnonymously(auth);
    onAuthStateChanged(auth, (u) => {
        if (u) {
            user = u;
            syncProjects();
        }
    });
}

// --- FUNÇÃO PARA CRIAR PROJETO ---
async function createNewProject(name) {
    if (!user) return;
    const ref = collection(db, 'artifacts', appId, 'users', user.uid, 'projects');
    const d = await addDoc(ref, { name, timestamp: serverTimestamp() });
    selectProject(d.id);
}

// --- FUNÇÃO PARA RENOMEAR PROJETO ---
async function renameProject(id, newName) {
    const ref = doc(db, 'artifacts', appId, 'users', user.uid, 'projects', id);
    await updateDoc(ref, { name: newName });
}

function selectProject(id) {
    currentProjectId = id;
    localStorage.setItem('ghost_pid', id);
    loadMessages(id);
}

// --- SINCRONIZAÇÃO DA SIDEBAR ---
function syncProjects() {
    const ref = collection(db, 'artifacts', appId, 'users', user.uid, 'projects');
    const q = query(ref, orderBy('timestamp', 'desc'));

    onSnapshot(q, (snap) => {
        if (!projectList) return;
        projectList.innerHTML = '';
        const projects = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        projects.forEach(p => {
            const container = document.createElement('div');
            container.className = `relative group mb-2 p-4 rounded-xl cursor-pointer transition-all ${p.id === currentProjectId ? 'bg-black text-white' : 'hover:bg-gray-100'}`;
            container.innerHTML = `<span class="truncate block pr-8">${p.name}</span>`;
            
            container.onclick = () => selectProject(p.id);

            // Botão de Editar (Lápis)
            const editBtn = document.createElement('button');
            editBtn.className = 'absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 text-gray-400';
            editBtn.innerHTML = '✎';
            editBtn.onclick = (e) => {
                e.stopPropagation();
                const n = prompt("Novo nome:", p.name);
                if (n) renameProject(p.id, n);
            };

            container.appendChild(editBtn);
            projectList.appendChild(container);
        });
    });
}

// --- CARREGAR MENSAGENS ---
function loadMessages(pid) {
    if (!chatWindow || !pid) return;
    const ref = collection(db, 'artifacts', appId, 'users', user.uid, 'projects', pid, 'messages');
    const q = query(ref, orderBy('timestamp', 'asc'));

    onSnapshot(q, (snap) => {
        chatWindow.innerHTML = '';
        snap.docs.forEach(d => {
            const m = d.data();
            const div = document.createElement('div');
            div.className = `flex mb-4 ${m.role === 'user' ? 'justify-end' : 'justify-start'} message-fade`;
            div.innerHTML = `<div class="p-4 rounded-2xl max-w-[80%] ${m.role === 'user' ? 'bg-black text-white' : 'bg-gray-100'}">${m.content}</div>`;
            chatWindow.appendChild(div);
        });
        chatWindow.scrollTo(0, chatWindow.scrollHeight);
    });
}

// --- EVENTOS DE CLIQUE ---
if (newProjectBtn) {
    newProjectBtn.onclick = () => {
        const name = prompt("Nome do Novo Projeto:");
        if (name) createNewProject(name);
    };
}

if (sendBtn) {
    sendBtn.onclick = async () => {
        const text = userInput.value.trim();
        if (!text || !currentProjectId) return;
        userInput.value = '';
        const ref = collection(db, 'artifacts', appId, 'users', user.uid, 'projects', currentProjectId, 'messages');
        await addDoc(ref, { role: 'user', content: text, timestamp: serverTimestamp() });
        // Aqui chamarias a API do Gemini com o fetch
    };
}

startApp();

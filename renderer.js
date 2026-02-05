import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    signInAnonymously, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    onSnapshot, 
    addDoc, 
    serverTimestamp, 
    query, 
    orderBy, 
    doc, 
    updateDoc 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/** * CONFIGURAÇÃO DE PRODUÇÃO
 * IMPORTANTE: Substitui os valores abaixo pelos teus dados REAIS do Firebase Console.
 * Se deixares os valores genéricos, a app ficará preta ou dará erro de autenticação.
 */
const firebaseConfig = {
    apiKey: "A_TUA_API_KEY_AQUI",
    authDomain: "O_TEU_PROJETO.firebaseapp.com",
    projectId: "O_TEU_ID_PROJETO",
    storageBucket: "O_TEU_PROJETO.appspot.com",
    messagingSenderId: "000000000000",
    appId: "1:000000000000:web:abcdefg"
};

const appId = 'ghost-pixel-ia-prod';

// Estado da Aplicação
let currentUser = null;
let currentProjectId = localStorage.getItem('ghost_pid');
let geminiApiKey = localStorage.getItem('ghost_gemini_key') || '';

// Seleção de Elementos com Verificação (Prevenção de Ecrã Preto)
const projectList = document.querySelector('.flex-1.overflow-y-auto');
const newProjectBtn = document.querySelector('button.border-dashed');
const chatWindow = document.getElementById('chat-window');
const userInput = document.querySelector('textarea');
const sendBtn = document.querySelector('button svg')?.parentElement;
const loadingIndicator = document.getElementById('loading-ui');

/**
 * INICIALIZAÇÃO E AUTENTICAÇÃO
 */
async function initApp() {
    console.log("A iniciar Ghost Pixel...");
    try {
        // Inicialização dos Serviços dentro do try/catch para evitar crash total
        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        const db = getFirestore(app);

        await signInAnonymously(auth);
        
        onAuthStateChanged(auth, (user) => {
            if (user) {
                console.log("Autenticado como:", user.uid);
                currentUser = user;
                observeProjects(db);
            }
        });
    } catch (error) {
        console.error("ERRO CRÍTICO NO FIREBASE:", error);
        document.body.innerHTML += `<div style="color:white; background:red; padding:20px; position:fixed; top:0; z-index:9999;">Erro de Configuração Firebase: ${error.message}</div>`;
    }
}

/**
 * GESTÃO DE WORKSPACES/PROJETOS
 */
function observeProjects(db) {
    if (!currentUser) return;
    
    const projectsRef = collection(db, 'artifacts', appId, 'users', currentUser.uid, 'projects');
    const q = query(projectsRef, orderBy('timestamp', 'desc'));

    onSnapshot(q, (snapshot) => {
        if (!projectList) return;
        projectList.innerHTML = '';
        
        const projects = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        if (projects.length === 0) {
            createProject(db, "Meu Workspace");
            return;
        }

        projects.forEach(project => renderProjectItem(db, project));

        if (!currentProjectId || !projects.find(p => p.id === currentProjectId)) {
            switchProject(db, projects[0].id);
        } else {
            loadChatHistory(db, currentProjectId);
        }
    }, (error) => {
        console.error("Erro ao ler projetos:", error);
    });
}

async function createProject(db, name) {
    const ref = collection(db, 'artifacts', appId, 'users', currentUser.uid, 'projects');
    const newDoc = await addDoc(ref, { name, timestamp: serverTimestamp() });
    switchProject(db, newDoc.id);
}

function switchProject(db, id) {
    currentProjectId = id;
    localStorage.setItem('ghost_pid', id);
    loadChatHistory(db, id);
    // Forçar re-render para atualizar classe ativa
    observeProjects(db); 
}

function renderProjectItem(db, project) {
    const isActive = project.id === currentProjectId;
    const container = document.createElement('div');
    container.className = `relative group mb-2 p-4 rounded-xl cursor-pointer transition-all border ${isActive ? 'bg-black text-white border-black' : 'hover:bg-gray-100 border-transparent text-gray-700'}`;
    
    container.innerHTML = `<span class="truncate block pr-8 font-medium">${project.name}</span>`;
    container.onclick = () => switchProject(db, project.id);

    const editBtn = document.createElement('button');
    editBtn.className = 'absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gray-400 hover:text-blue-500';
    editBtn.innerHTML = '✎';
    editBtn.onclick = (e) => {
        e.stopPropagation();
        const n = prompt("Renomear Workspace:", project.name);
        if (n && n.trim()) {
            const ref = doc(db, 'artifacts', appId, 'users', currentUser.uid, 'projects', project.id);
            updateDoc(ref, { name: n.trim() });
        }
    };

    container.appendChild(editBtn);
    projectList.appendChild(container);
}

/**
 * LÓGICA DE MENSAGENS E INTEGRAÇÃO IA
 */
function loadChatHistory(db, projectId) {
    if (!chatWindow || !projectId || !currentUser) return;

    const ref = collection(db, 'artifacts', appId, 'users', currentUser.uid, 'projects', projectId, 'messages');
    const q = query(ref, orderBy('timestamp', 'asc'));

    onSnapshot(q, (snapshot) => {
        chatWindow.innerHTML = '';
        snapshot.docs.forEach(d => {
            const msg = d.data();
            appendMessageToUI(msg.role, msg.content);
        });
        chatWindow.scrollTo({ top: chatWindow.scrollHeight, behavior: 'smooth' });
    }, (error) => {
        console.error("Erro ao carregar mensagens:", error);
    });
}

function appendMessageToUI(role, content) {
    if (!chatWindow) return;
    const wrapper = document.createElement('div');
    wrapper.className = `flex w-full mb-6 animate-in fade-in slide-in-from-bottom-2 ${role === 'user' ? 'justify-end' : 'justify-start'}`;
    
    const bubble = document.createElement('div');
    bubble.className = `p-4 rounded-2xl max-w-[75%] shadow-sm ${role === 'user' ? 'bg-black text-white' : 'bg-gray-100 text-black border border-gray-200'}`;
    bubble.innerText = content;
    
    wrapper.appendChild(bubble);
    chatWindow.appendChild(wrapper);
}

async function handleChatSubmission() {
    const message = userInput?.value.trim();
    if (!message || !currentProjectId) return;
    
    if (!geminiApiKey) {
        const key = prompt("Insere a tua Gemini API Key:");
        if (!key) return;
        geminiApiKey = key;
        localStorage.setItem('ghost_gemini_key', key);
    }

    userInput.value = '';
    // Re-obter DB para a função
    const db = getFirestore();
    const ref = collection(db, 'artifacts', appId, 'users', currentUser.uid, 'projects', currentProjectId, 'messages');

    try {
        await addDoc(ref, { role: 'user', content: message, timestamp: serverTimestamp() });

        if (loadingIndicator) loadingIndicator.classList.remove('hidden');
        
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${geminiApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: message }] }] })
        });

        const data = await response.json();
        const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Erro: Verifica a tua API Key.";

        await addDoc(ref, { role: 'ai', content: aiText, timestamp: serverTimestamp() });

    } catch (error) {
        console.error("Erro no chat:", error);
    } finally {
        if (loadingIndicator) loadingIndicator.classList.add('hidden');
    }
}

// Event Listeners
if (newProjectBtn) {
    newProjectBtn.onclick = () => {
        const name = prompt("Nome do Novo Workspace:");
        if (name && name.trim()) createProject(getFirestore(), name.trim());
    };
}

if (sendBtn) sendBtn.onclick = handleChatSubmission;

if (userInput) {
    userInput.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleChatSubmission();
        }
    };
}

// Iniciar Aplicação
initApp();

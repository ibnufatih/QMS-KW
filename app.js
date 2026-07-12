// State Management
let masterData = [];
let statusBilik = [
    { No_Bilik: "Bilik 1", Status: "Tutup", Nama_Doktor_Bertugas: "", Masa_Dibuka: "" },
    { No_Bilik: "Bilik 2", Status: "Tutup", Nama_Doktor_Bertugas: "", Masa_Dibuka: "" },
    { No_Bilik: "Bilik 3", Status: "Tutup", Nama_Doktor_Bertugas: "", Masa_Dibuka: "" }
];

let selectedTriagePatientId = null;
let currentDbTab = 'master';

// Chart instances
let chartPurpose = null;
let chartDoctor = null;
let chartBmi = null;
let chartDept = null;

// Audio context or sound simulator
function playChime() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Double chime
        const playTone = (time, freq, duration) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            
            osc.frequency.setValueAtTime(freq, time);
            gain.gain.setValueAtTime(0.3, time);
            gain.gain.exponentialRampToValueAtTime(0.01, time + duration);
            
            osc.start(time);
            osc.stop(time + duration);
        };
        
        const now = audioCtx.currentTime;
        playTone(now, 523.25, 0.4); // C5
        playTone(now + 0.15, 659.25, 0.6); // E5
    } catch (e) {
        console.log("Audio not supported or blocked: ", e);
    }
}

// Speak text using Web Speech API
function speakText(text) {
    if ('speechSynthesis' in window) {
        // Cancel any current speaking
        window.speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ms-MY'; // Malay language
        utterance.rate = 0.85; // Slightly slower for clarity
        
        // Find Malay voice if available, else default
        const voices = window.speechSynthesis.getVoices();
        const malayVoice = voices.find(v => v.lang.includes('MS') || v.lang.includes('MY') || v.name.toLowerCase().includes('indonesian') || v.lang.includes('id-ID'));
        if (malayVoice) {
            utterance.voice = malayVoice;
        }
        
        window.speechSynthesis.speak(utterance);
    }
}

// Initialize Application
document.addEventListener("DOMContentLoaded", () => {
    loadLocalStorage();
    
    // Auto-populate with sample data if empty to make analytics look complete
    if (masterData.length === 0) {
        populateSampleData();
    }
    
    // Periodically update clock
    setInterval(updateClock, 1000);
    updateClock();
    
    // Draw sheets and dashboard
    renderTriageWaiting();
    renderDoctorPanels();
    renderTvDisplay();
    renderDatabaseTables();
    initCharts();

    // Show role selector or auto-login based on URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const roleParam = urlParams.get('role');
    if (roleParam === 'patient' || roleParam === 'tv') {
        selectRole(roleParam);
    } else {
        logoutRole();
    }
});

// State for login
let loginPendingRole = null;
let loginPendingDoctorRoom = null;

// Helper to parse dates from strings
function parseCustomDate(str) {
    if (!str) return new Date();
    // Format is either "DD/MM/YYYY, HH:MM:SS" or "DD/MM/YYYY HH:MM:SS" or "YYYY-MM-DDTHH:MM:SS"
    if (str.includes("/")) {
        const parts = str.split(" ");
        const dateParts = parts[0].split("/");
        // Handle optional comma
        const cleanDateParts = dateParts[0].includes(",") ? dateParts[0].split(",") : dateParts;
        const timeStr = parts.length > 1 ? parts[1] : (parts[0].includes(",") ? parts[0] : "00:00:00");
        const timeParts = timeStr.split(":");
        return new Date(cleanDateParts[2], cleanDateParts[1] - 1, cleanDateParts[0], timeParts[0] || 0, timeParts[1] || 0, timeParts[2] || 0);
    }
    return new Date(str);
}

// Calculate wait time in text format
function getWaitTimeStr(timestampStr) {
    if (!timestampStr) return "-";
    const start = parseCustomDate(timestampStr);
    const end = new Date();
    const diffMs = end - start;
    if (diffMs < 0) return "0 min";
    
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) {
        return `${diffMins} min`;
    } else {
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        return `${hours} jam ${mins} min`;
    }
}

// Role Management Logic
function selectRole(role) {
    const header = document.getElementById("main-header");
    const navTabs = document.getElementById("admin-nav-tabs");
    const roleLabel = document.getElementById("portal-role-label");
    const exitBtn = document.getElementById("btn-exit-role");

    // Hide doctor submenu & login box
    document.getElementById("doctor-room-select-sub").style.display = "none";
    document.getElementById("login-box").style.display = "none";

    // Public roles (no password)
    if (role === 'patient') {
        document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
        header.style.display = "none";
        exitBtn.style.display = "block";
        document.getElementById("panel-patient").classList.add("active");
        return;
    }

    if (role === 'tv') {
        document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
        header.style.display = "none";
        exitBtn.style.display = "block";
        document.getElementById("panel-tv").classList.add("active");
        renderTvDisplay();
        return;
    }

    // Doctor submenu trigger
    if (role === 'doctor-select') {
        document.getElementById("doctor-room-select-sub").style.display = "block";
        return;
    }

    // Restricted roles prompt login
    showLoginBox(role);
}

function selectDoctorRoom(roomId) {
    loginPendingDoctorRoom = roomId;
    showLoginBox('doctor');
}

function showLoginBox(role) {
    loginPendingRole = role;
    document.getElementById("doctor-room-select-sub").style.display = "none";
    document.getElementById("login-box").style.display = "block";
    
    let roleName = "Admin";
    if (role === 'triage') roleName = "Staf Kaunter Triage";
    if (role === 'doctor') roleName = `Doktor Bilik ${loginPendingDoctorRoom}`;
    
    document.getElementById("login-title").innerText = `Log Masuk - ${roleName}`;
    document.getElementById("login-id").value = "";
    document.getElementById("login-pw").value = "";
    document.getElementById("login-id").focus();
}

function cancelLogin() {
    document.getElementById("login-box").style.display = "none";
    loginPendingRole = null;
    loginPendingDoctorRoom = null;
}

function handleLogin(e) {
    e.preventDefault();
    const id = document.getElementById("login-id").value.trim();
    const pw = document.getElementById("login-pw").value.trim();

    // Check credentials
    let valid = false;
    if (loginPendingRole === 'admin' && id === 'admin' && pw === 'admin123') {
        valid = true;
    } else if (loginPendingRole === 'triage' && id === 'triage' && pw === 'triage123') {
        valid = true;
    } else if (loginPendingRole === 'doctor' && id === 'doktor' && pw === 'doktor123') {
        valid = true;
    }

    if (!valid) {
        alert("ID atau Kata Laluan tidak sah.");
        return;
    }

    // Clear login box
    document.getElementById("login-box").style.display = "none";

    // Navigate to respective panel
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    const header = document.getElementById("main-header");
    const navTabs = document.getElementById("admin-nav-tabs");
    const roleLabel = document.getElementById("portal-role-label");
    const exitBtn = document.getElementById("btn-exit-role");

    // Reset doctor card visibility
    document.getElementById("room-card-1").style.display = "block";
    document.getElementById("room-card-2").style.display = "block";
    document.getElementById("room-card-3").style.display = "block";

    if (loginPendingRole === 'admin') {
        header.style.display = "flex";
        navTabs.style.display = "flex";
        roleLabel.innerText = "Admin";
        exitBtn.style.display = "none";
        switchPanel('patient');
    } else if (loginPendingRole === 'triage') {
        header.style.display = "flex";
        navTabs.style.display = "none";
        roleLabel.innerText = "Kaunter Triage";
        exitBtn.style.display = "none";
        document.getElementById("panel-triage").classList.add("active");
        renderTriageWaiting();
    } else if (loginPendingRole === 'doctor') {
        header.style.display = "flex";
        navTabs.style.display = "none";
        roleLabel.innerText = `Doktor - Bilik ${loginPendingDoctorRoom}`;
        exitBtn.style.display = "none";

        // Show only the selected doctor room card
        document.getElementById("room-card-1").style.display = loginPendingDoctorRoom === 1 ? "block" : "none";
        document.getElementById("room-card-2").style.display = loginPendingDoctorRoom === 2 ? "block" : "none";
        document.getElementById("room-card-3").style.display = loginPendingDoctorRoom === 3 ? "block" : "none";

        document.getElementById("panel-doctor").classList.add("active");
        renderDoctorPanels();
    }

    loginPendingRole = null;
}

function logoutRole() {
    // Hide main header
    document.getElementById("main-header").style.display = "none";
    document.getElementById("btn-exit-role").style.display = "none";
    document.getElementById("doctor-room-select-sub").style.display = "none";
    document.getElementById("login-box").style.display = "none";

    // Hide all panels, show role selector
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    document.getElementById("panel-role-selector").classList.add("active");
}

// Load and Save Local Storage
function loadLocalStorage() {
    const savedMaster = localStorage.getItem("kw_master_data");
    const savedBilik = localStorage.getItem("kw_status_bilik");
    if (savedMaster) masterData = JSON.parse(savedMaster);
    if (savedBilik) statusBilik = JSON.parse(savedBilik);
}

function saveLocalStorage() {
    localStorage.setItem("kw_master_data", JSON.stringify(masterData));
    localStorage.setItem("kw_status_bilik", JSON.stringify(statusBilik));
}

// Clear Database Helper
function clearDatabase() {
    if (confirm("Adakah anda pasti mahu memadam semua rekod database?")) {
        masterData = [];
        statusBilik = [
            { No_Bilik: "Bilik 1", Status: "Tutup", Nama_Doktor_Bertugas: "", Masa_Dibuka: "" },
            { No_Bilik: "Bilik 2", Status: "Tutup", Nama_Doktor_Bertugas: "", Masa_Dibuka: "" },
            { No_Bilik: "Bilik 3", Status: "Tutup", Nama_Doktor_Bertugas: "", Masa_Dibuka: "" }
        ];
        saveLocalStorage();
        renderTriageWaiting();
        renderDoctorPanels();
        renderTvDisplay();
        renderDatabaseTables();
        initCharts();
        selectedTriagePatientId = null;
        document.getElementById("triage-details-card").style.display = "none";
        document.getElementById("triage-placeholder").style.display = "flex";
    }
}

// Populate sample data for Looker Studio simulation
function populateSampleData() {
    const now = new Date();
    const depts = ["Jabatan Kecemasan", "Pentadbiran", "Jabatan Kejuruteraan", "Sumber Manusia", "Jabatan Pergigian"];
    const jobs = ["Jururawat", "Pembantu Perubatan", "Pegawai Tadbir", "Pemandu Ambulans", "Doktor Pakar"];
    const diagnoses = ["Hypertension", "Acute GASTROENTERITIS", "Upper Respiratory Tract Infection (URTI)", "Tension Headache", "Acute Pharyngitis"];
    
    const samplePatients = [
        { name: "MUHAMMAD HAFIZ BIN ROSLI", ic: "880512045591", kkm: "Ya", job: "Jururawat U29", dept: "Kecemasan" },
        { name: "SITI AISHAH BINTI ABDULLAH", ic: "921104105822", kkm: "Ya", job: "Pembantu Tadbir", dept: "Pentadbiran" },
        { name: "CHIN KAN SENG", ic: "750220086395", kkm: "Tidak", job: "Peniaga", dept: "-" },
        { name: "MOHD SHAHRIZAL BIN MD IDRIS", ic: "850915145719", kkm: "Ya", job: "Pemandu Ambulans", dept: "Pengangkutan" },
        { name: "SARASWATHY A/P RAMAN", ic: "800318025988", kkm: "Tidak", job: "Guru", dept: "-" },
        { name: "NURUL HIDAYAH BINTI MASRON", ic: "950711015822", kkm: "Ya", job: "Jururawat U32", dept: "Wad Melor" },
        { name: "ALEXANDER ANAK NYAMBONG", ic: "901201136691", kkm: "Tidak", job: "Juruteknik", dept: "-" }
    ];

    samplePatients.forEach((p, idx) => {
        const qNum = `A-${101 + idx}`;
        const patientTime = new Date(now.getTime() - (7 - idx) * 3600 * 1000); // spread over last hours
        const weight = 60 + Math.random() * 30;
        const height = 155 + Math.random() * 25;
        const bmi = (weight / ((height/100) * (height/100))).toFixed(1);
        const sys = 110 + Math.floor(Math.random() * 25);
        const dia = 70 + Math.floor(Math.random() * 15);
        
        const roomNum = `Bilik ${(idx % 3) + 1}`;
        const drName = ["Dr. Azmil", "Dr. Sarah", "Dr. Wong"][idx % 3];
        const status = idx < 5 ? (idx % 2 === 0 ? "Discharge Home" : "Refer") : "Menunggu Dr";
        
        masterData.push({
            Timestamp: patientTime.toLocaleString('ms-MY'),
            Nombor_Giliran: qNum,
            Nama_Penuh: p.name,
            No_IC: p.ic,
            Kakitangan_KKM: p.kkm,
            Pekerjaan: p.job,
            Jabatan: p.dept,
            Jenis_Kes: idx % 2 === 0 ? "Baru" : "Ulangan",
            Tujuan_Kehadiran: ["ME", "MS", "IM", "OD"][idx % 4],
            Berat_Badan_kg: weight.toFixed(1),
            Tinggi_cm: Math.round(height),
            BMI: bmi,
            Tekanan_Darah: `${sys}/${dia}`,
            Kadar_Nadi: 65 + Math.floor(Math.random() * 25),
            Suhu_Badan: (36.2 + Math.random() * 1.5).toFixed(1),
            Markah_Sakit: Math.floor(Math.random() * 6),
            Kadar_Pernafasan: 12 + Math.floor(Math.random() * 8),
            SpO2: 95 + Math.floor(Math.random() * 5),
            Chief_Complaint: "Demam dan batuk berterusan",
            No_Bilik_Doktor: roomNum,
            Nama_Doktor: drName,
            Masa_Dipanggil: new Date(patientTime.getTime() + 15 * 60 * 1000).toLocaleString('ms-MY'),
            Diagnosis: status.includes("Discharge") || status === "Refer" ? diagnoses[idx % 5] : "",
            Cuti_Sakit_Hari: status.includes("Discharge") || status === "Refer" ? (idx % 3 === 0 ? 2 : 0) : 0,
            Tempat_Rujukan: status === "Refer" ? "Klinik Pakar Hospital Besar" : "",
            Masa_Triage_Selesai: patientTime.toLocaleString('ms-MY'),
            Status_Giliran: status
        });
    });

    // Populate active rooms
    statusBilik[0] = { No_Bilik: "Bilik 1", Status: "Aktif", Nama_Doktor_Bertugas: "Dr. Azmil", Masa_Dibuka: now.toLocaleString('ms-MY') };
    statusBilik[1] = { No_Bilik: "Bilik 2", Status: "Aktif", Nama_Doktor_Bertugas: "Dr. Sarah", Masa_Dibuka: now.toLocaleString('ms-MY') };
    statusBilik[2] = { No_Bilik: "Bilik 3", Status: "Aktif", Nama_Doktor_Bertugas: "Dr. Wong", Masa_Dibuka: now.toLocaleString('ms-MY') };

    saveLocalStorage();
}

// Navigation Tab switcher
function switchPanel(panelId) {
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
    
    document.getElementById(`panel-${panelId}`).classList.add("active");
    // Find matching nav tab button
    const btn = Array.from(document.querySelectorAll(".nav-tab")).find(b => b.getAttribute("onclick").includes(panelId));
    if (btn) btn.classList.add("active");

    if (panelId === 'analytics') {
        setTimeout(initCharts, 100);
    }
}

// Patient BYOD Registration
function registerPatient(e) {
    e.preventDefault();
    const name = document.getElementById("reg-name").value.trim().toUpperCase();
    const ic = document.getElementById("reg-ic").value.trim();
    const kkm = document.getElementById("reg-kkm").value;
    const job = document.getElementById("reg-job").value.trim();
    const dept = document.getElementById("reg-dept").value.trim();
    
    // Generate sequential queue number starting from A-101
    let nextNum = 101;
    if (masterData.length > 0) {
        const lastNumStr = masterData[masterData.length - 1].Nombor_Giliran; // e.g. A-107
        const match = lastNumStr.match(/A-(\d+)/);
        if (match) {
            nextNum = parseInt(match[1]) + 1;
        }
    }
    const queueNum = `A-${nextNum}`;

    const newRecord = {
        Timestamp: new Date().toLocaleString('ms-MY'),
        Nombor_Giliran: queueNum,
        Nama_Penuh: name,
        No_IC: ic,
        Kakitangan_KKM: kkm,
        Pekerjaan: job,
        Jabatan: dept,
        Jenis_Kes: "",
        Tujuan_Kehadiran: "",
        Berat_Badan_kg: "",
        Tinggi_cm: "",
        BMI: "",
        Tekanan_Darah: "",
        Kadar_Nadi: "",
        Suhu_Badan: "",
        Markah_Sakit: "",
        Kadar_Pernafasan: "",
        SpO2: "",
        Chief_Complaint: "",
        No_Bilik_Doktor: "",
        Nama_Doktor: "",
        Masa_Dipanggil: "",
        Diagnosis: "",
        Cuti_Sakit_Hari: 0,
        Tempat_Rujukan: "",
        Status_Giliran: "Menunggu Triage"
    };

    masterData.push(newRecord);
    saveLocalStorage();

    // Show Success View
    document.getElementById("patient-registration-form").style.display = "none";
    document.getElementById("registration-success-view").style.display = "block";
    document.getElementById("patient-queue-num").innerText = queueNum;
    document.getElementById("patient-display-name").innerText = name;

    // Refresh UI panels
    renderTriageWaiting();
    renderDatabaseTables();
}

function resetPatientForm() {
    document.getElementById("patient-registration-form").reset();
    document.getElementById("patient-registration-form").style.display = "block";
    document.getElementById("registration-success-view").style.display = "none";
}

// Triage Functions
function renderTriageWaiting() {
    // 1. Patients waiting for Triage
    const listContainer = document.getElementById("triage-waiting-list");
    const waitingPatients = masterData.filter(p => p.Status_Giliran === "Menunggu Triage");
    document.getElementById("count-triage-waiting").innerText = waitingPatients.length;

    listContainer.innerHTML = "";
    if (waitingPatients.length === 0) {
        listContainer.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); padding: 1rem 0;">
                <i data-lucide="inbox" style="width: 20px; height: 20px; margin-bottom: 0.25rem;"></i>
                <p style="font-size: 0.8rem;">Tiada pesakit menunggu triage</p>
            </div>
        `;
    } else {
        waitingPatients.forEach(p => {
            const item = document.createElement("div");
            item.className = `patient-item ${selectedTriagePatientId === p.Nombor_Giliran ? 'selected' : ''}`;
            item.onclick = () => selectTriagePatient(p.Nombor_Giliran);
            
            item.innerHTML = `
                <div>
                    <strong style="color: white; font-size: 0.85rem;">${p.Nama_Penuh}</strong>
                    <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 0.15rem;">
                        IC: ${p.No_IC} | KKM: ${p.Kakitangan_KKM}
                    </div>
                    <div style="font-size: 0.7rem; color: var(--warning); margin-top: 0.15rem; display: flex; align-items: center; gap: 0.25rem;">
                        <i data-lucide="clock" style="width: 12px; height: 12px;"></i> Tunggu: ${getWaitTimeStr(p.Timestamp)}
                    </div>
                </div>
                <span class="badge badge-blue">${p.Nombor_Giliran}</span>
            `;
            listContainer.appendChild(item);
        });
    }

    // 2. Patients waiting for Doctor Call (assigned to rooms)
    const drListContainer = document.getElementById("triage-dr-waiting-list");
    const drWaitingPatients = masterData.filter(p => p.Status_Giliran === "Menunggu Dr" || p.Status_Giliran === "Dipanggil");
    document.getElementById("count-dr-waiting-total").innerText = drWaitingPatients.length;

    drListContainer.innerHTML = "";
    if (drWaitingPatients.length === 0) {
        drListContainer.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); padding: 1rem 0;">
                <i data-lucide="activity" style="width: 20px; height: 20px; margin-bottom: 0.25rem;"></i>
                <p style="font-size: 0.8rem;">Tiada pesakit menunggu panggilan</p>
            </div>
        `;
    } else {
        drWaitingPatients.forEach(p => {
            const item = document.createElement("div");
            item.className = "patient-item";
            item.style.cursor = "default";
            
            const badgeClass = p.Status_Giliran === "Dipanggil" ? "badge-purple" : "badge-orange";
            const roomLabel = p.No_Bilik_Doktor || "Belum diagih";
            
            item.innerHTML = `
                <div>
                    <strong style="color: white; font-size: 0.85rem;">${p.Nama_Penuh}</strong>
                    <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 0.15rem;">
                        Diagih ke: <span style="color: #60a5fa; font-weight: 600;">${roomLabel}</span> (${p.Nama_Doktor || '-'})
                    </div>
                    <div style="font-size: 0.7rem; color: var(--warning); margin-top: 0.15rem; display: flex; align-items: center; gap: 0.25rem;">
                        <i data-lucide="clock" style="width: 12px; height: 12px;"></i> Tunggu: ${getWaitTimeStr(p.Masa_Triage_Selesai)}
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.25rem;">
                    <span class="badge badge-blue">${p.Nombor_Giliran}</span>
                    <span class="badge ${badgeClass}" style="font-size: 0.65rem;">${p.Status_Giliran}</span>
                </div>
            `;
            drListContainer.appendChild(item);
        });
    }
    
    lucide.createIcons();
}

function parseIC(icStr) {
    if (!icStr || icStr.length !== 12) {
        return { age: 30, gender: "Lelaki", isPediatric: false }; // fallback default
    }
    
    // YYMMDD
    const yy = parseInt(icStr.substring(0, 2));
    const currentYear = 2026;
    const currentYY = 26; // last two digits of 2026
    
    let birthYear = 1900 + yy;
    if (yy <= currentYY) {
        birthYear = 2000 + yy;
    }
    
    const age = currentYear - birthYear;
    const isPediatric = age <= 12;
    
    const lastDigit = parseInt(icStr.charAt(11));
    const gender = (lastDigit % 2 === 1) ? "Lelaki" : "Perempuan";
    
    return { age, gender, isPediatric };
}

function evaluateVitals() {
    if (!selectedTriagePatientId) return;
    const patient = masterData.find(p => p.Nombor_Giliran === selectedTriagePatientId);
    if (!patient) return;
    
    const { age, gender, isPediatric } = parseIC(patient.No_IC);
    
    // Get current form inputs
    const bpVal = document.getElementById("triage-bp").value.trim();
    const pulseVal = parseInt(document.getElementById("triage-pulse").value) || 0;
    const tempVal = parseFloat(document.getElementById("triage-temp").value) || 0;
    const respVal = parseInt(document.getElementById("triage-resp").value) || 0;
    const spo2Val = parseInt(document.getElementById("triage-spo2").value) || 0;
    const painVal = parseInt(document.getElementById("triage-pain").value) || 0;

    let score = 0; // Triage scoring for severity
    let isRedTrigger = false;
    let isYellowTrigger = false;

    // 1. Blood Pressure (BP)
    const alertBp = document.getElementById("alert-bp");
    alertBp.innerText = "";
    if (bpVal.includes("/")) {
        const parts = bpVal.split("/");
        const sys = parseInt(parts[0]) || 0;
        const dia = parseInt(parts[1]) || 0;
        if (sys > 0 && dia > 0) {
            if (sys >= 180 || dia >= 110) {
                alertBp.innerText = "AMARAN: Krisis Hipertensi (Sangat Tinggi!)";
                isRedTrigger = true;
            } else if (sys >= 140 || dia >= 90) {
                alertBp.innerText = "Tinggi: Hipertensi Tahap 1/2";
                isYellowTrigger = true;
                score += 2;
            } else if (sys < 90 || dia < 60) {
                alertBp.innerText = "Rendah: Hipotensi";
                score += 1;
            }
        }
    }

    // 2. Heart Rate (Pulse)
    const alertPulse = document.getElementById("alert-pulse");
    alertPulse.innerText = "";
    if (pulseVal > 0) {
        if (isPediatric) {
            if (pulseVal > 140 || pulseVal < 60) {
                alertPulse.innerText = "Abnormal Kanak-kanak: Kadar Nadi Bahaya!";
                isRedTrigger = true;
            } else if (pulseVal > 120 || pulseVal < 80) {
                alertPulse.innerText = "Sederhana Abnormal (Kanak-kanak)";
                score += 1;
            }
        } else {
            if (pulseVal > 120 || pulseVal < 50) {
                alertPulse.innerText = "Abnormal Dewasa: Kadar Nadi Bahaya!";
                isRedTrigger = true;
            } else if (pulseVal > 100 || pulseVal < 60) {
                alertPulse.innerText = "Sederhana Abnormal (Dewasa)";
                score += 1;
            }
        }
    }

    // 3. Suhu Badan (Temp)
    const alertTemp = document.getElementById("alert-temp");
    alertTemp.innerText = "";
    if (tempVal > 0) {
        if (tempVal >= 39.5) {
            alertTemp.innerText = "AMARAN: Demam Sangat Tinggi!";
            isRedTrigger = true;
        } else if (tempVal >= 37.8) {
            alertTemp.innerText = "Tinggi: Demam / Fever";
            score += 2;
        } else if (tempVal < 35.0) {
            alertTemp.innerText = "AMARAN: Hipotermia!";
            isRedTrigger = true;
        }
    }

    // 4. Respiratory Rate (Resp)
    const alertResp = document.getElementById("alert-resp");
    alertResp.innerText = "";
    if (respVal > 0) {
        if (isPediatric) {
            if (respVal > 40 || respVal < 15) {
                alertResp.innerText = "Abnormal Kanak-kanak: Pernafasan Bahaya!";
                isRedTrigger = true;
            } else if (respVal > 30 || respVal < 18) {
                alertResp.innerText = "Sederhana Abnormal (Kanak-kanak)";
                score += 1;
            }
        } else {
            if (respVal > 25 || respVal < 10) {
                alertResp.innerText = "Abnormal Dewasa: Pernafasan Bahaya!";
                isRedTrigger = true;
            } else if (respVal > 20 || respVal < 12) {
                alertResp.innerText = "Sederhana Abnormal (Dewasa)";
                score += 1;
            }
        }
    }

    // 5. SpO2
    const alertSpo2 = document.getElementById("alert-spo2");
    alertSpo2.innerText = "";
    if (spo2Val > 0) {
        if (spo2Val < 90) {
            alertSpo2.innerText = "AMARAN: Hipoksia Teruk (Bahaya!)";
            isRedTrigger = true;
        } else if (spo2Val < 95) {
            alertSpo2.innerText = "Rendah: Kurang Oksigen";
            score += 2;
        }
    }

    // Determine Zone Display
    const zoneDisplay = document.getElementById("triage-zone-display");
    if (isRedTrigger || score >= 4) {
        zoneDisplay.className = "bmi-indicator bmi-obese";
        zoneDisplay.innerText = "ZON MERAH (KRITIKAL / KECEMASAN)";
    } else if (isYellowTrigger || score >= 2) {
        zoneDisplay.className = "bmi-indicator bmi-overweight";
        zoneDisplay.innerText = "ZON KUNING (SEMI-KRITIKAL)";
    } else {
        zoneDisplay.className = "bmi-indicator bmi-normal";
        zoneDisplay.innerText = "ZON HIJAU (BIASA / KES RINGAN)";
    }
}

function selectTriagePatient(qNum) {
    selectedTriagePatientId = qNum;
    renderTriageWaiting();

    const patient = masterData.find(p => p.Nombor_Giliran === qNum);
    document.getElementById("triage-placeholder").style.display = "none";
    document.getElementById("triage-details-card").style.display = "block";
    document.getElementById("triage-patient-title").innerText = `${patient.Nama_Penuh} (${patient.Nombor_Giliran})`;

    // Parse age and gender from IC
    const { age, gender } = parseIC(patient.No_IC);
    document.getElementById("triage-patient-age").innerText = `${age} Tahun`;
    document.getElementById("triage-patient-gender").innerText = gender;

    // Reset triage form
    document.getElementById("triage-form").reset();
    document.getElementById("bmi-display").className = "bmi-indicator bmi-normal";
    document.getElementById("bmi-display").innerText = "Sila masukkan Berat & Tinggi";
    
    // Clear alert spans
    document.getElementById("alert-bp").innerText = "";
    document.getElementById("alert-pulse").innerText = "";
    document.getElementById("alert-temp").innerText = "";
    document.getElementById("alert-resp").innerText = "";
    document.getElementById("alert-spo2").innerText = "";

    // Reset zone display
    const zoneDisplay = document.getElementById("triage-zone-display");
    zoneDisplay.className = "bmi-indicator bmi-normal";
    zoneDisplay.innerText = "ZON HIJAU (BIASA / KES RINGAN)";
}

function calculateBMI() {
    const weight = parseFloat(document.getElementById("triage-weight").value);
    const height = parseFloat(document.getElementById("triage-height").value);
    const bmiIndicator = document.getElementById("bmi-display");

    if (weight > 0 && height > 0) {
        const bmi = (weight / ((height / 100) * (height / 100))).toFixed(1);
        let category = "Normal";
        let className = "bmi-normal";

        if (bmi < 18.5) {
            category = "Underweight";
            className = "bmi-obese"; // red warning
        } else if (bmi >= 18.5 && bmi < 25) {
            category = "Normal Weight";
            className = "bmi-normal"; // green
        } else if (bmi >= 25 && bmi < 30) {
            category = "Overweight";
            className = "bmi-overweight"; // orange
        } else {
            category = "Obese";
            className = "bmi-obese"; // red
        }

        bmiIndicator.className = `bmi-indicator ${className}`;
        bmiIndicator.innerText = `BMI: ${bmi} (${category})`;
        return bmi;
    } else {
        bmiIndicator.className = "bmi-indicator bmi-normal";
        bmiIndicator.innerText = "Sila masukkan Berat & Tinggi";
        return "";
    }
}

function submitTriage(e) {
    e.preventDefault();
    if (!selectedTriagePatientId) return;

    const patient = masterData.find(p => p.Nombor_Giliran === selectedTriagePatientId);
    
    // Save vital signs
    patient.Jenis_Kes = document.getElementById("triage-case-type").value;
    patient.Tujuan_Kehadiran = document.getElementById("triage-purpose").value;
    patient.Berat_Badan_kg = parseFloat(document.getElementById("triage-weight").value).toFixed(1);
    patient.Tinggi_cm = parseInt(document.getElementById("triage-height").value);
    patient.BMI = calculateBMI() || "";
    patient.Tekanan_Darah = document.getElementById("triage-bp").value;
    patient.Kadar_Nadi = parseInt(document.getElementById("triage-pulse").value);
    patient.Suhu_Badan = parseFloat(document.getElementById("triage-temp").value).toFixed(1);
    patient.Markah_Sakit = parseInt(document.getElementById("triage-pain").value);
    patient.Kadar_Pernafasan = parseInt(document.getElementById("triage-resp").value);
    patient.SpO2 = parseInt(document.getElementById("triage-spo2").value);
    patient.Chief_Complaint = document.getElementById("triage-complaint").value;

    // RUN ROUND-ROBIN ALLOCATION
    const activeRooms = statusBilik.filter(r => r.Status === "Aktif");
    if (activeRooms.length === 0) {
        alert("Ralat: Tiada Bilik Doktor yang berstatus AKTIF. Sila buka sekurang-kurangnya satu Bilik Doktor.");
        return;
    }

    // Check last patient allocation in masterData to see which active room was assigned
    let targetRoom = activeRooms[0]; // fallback
    const previouslyAssigned = masterData
        .filter(p => p.No_Bilik_Doktor && activeRooms.some(r => r.No_Bilik === p.No_Bilik_Doktor))
        .pop();

    if (previouslyAssigned) {
        const lastRoomIdx = activeRooms.findIndex(r => r.No_Bilik === previouslyAssigned.No_Bilik_Doktor);
        if (lastRoomIdx !== -1) {
            // Pick next room in active list index
            const nextIdx = (lastRoomIdx + 1) % activeRooms.length;
            targetRoom = activeRooms[nextIdx];
        }
    }

    // Set Room details on patient
    patient.No_Bilik_Doktor = targetRoom.No_Bilik;
    patient.Nama_Doktor = targetRoom.Nama_Doktor_Bertugas;
    patient.Status_Giliran = "Menunggu Dr";

    patient.Masa_Triage_Selesai = new Date().toLocaleString('ms-MY');
    saveLocalStorage();

    // Reset UI state
    selectedTriagePatientId = null;
    document.getElementById("triage-details-card").style.display = "none";
    document.getElementById("triage-placeholder").style.display = "flex";

    // Refresh views
    renderTriageWaiting();
    renderDoctorPanels();
    renderTvDisplay();
    renderDatabaseTables();
}

// Doctor's Room Actions
function openRoom(roomId) {
    const drName = document.getElementById(`dr-name-${roomId}`).value.trim();
    if (!drName) {
        alert("Sila masukkan nama doktor terlebih dahulu.");
        return;
    }

    statusBilik[roomId - 1] = {
        No_Bilik: `Bilik ${roomId}`,
        Status: "Aktif",
        Nama_Doktor_Bertugas: drName,
        Masa_Dibuka: new Date().toLocaleString('ms-MY')
    };

    saveLocalStorage();
    renderDoctorPanels();
    renderTvDisplay();
    renderDatabaseTables();
}

function closeRoom(roomId) {
    statusBilik[roomId - 1].Status = "Tutup";
    statusBilik[roomId - 1].Nama_Doktor_Bertugas = "";
    statusBilik[roomId - 1].Masa_Dibuka = "";

    saveLocalStorage();
    renderDoctorPanels();
    renderTvDisplay();
    renderDatabaseTables();
}

function renderDoctorPanels() {
    for (let roomId = 1; roomId <= 3; roomId++) {
        const room = statusBilik[roomId - 1];
        const statusBadge = document.getElementById(`room-status-badge-${roomId}`);
        const loginSection = document.getElementById(`room-login-${roomId}`);
        const activeSection = document.getElementById(`room-active-${roomId}`);
        
        if (room.Status === "Aktif") {
            statusBadge.className = "badge badge-green";
            statusBadge.innerText = "AKTIF";
            loginSection.style.display = "none";
            activeSection.style.display = "block";
            
            document.getElementById(`dr-active-name-${roomId}`).innerText = room.Nama_Doktor_Bertugas;
            
            // Populate room waiting list
            const roomWaitingList = document.getElementById(`dr-waiting-list-${roomId}`);
            const patientsForRoom = masterData.filter(p => p.No_Bilik_Doktor === `Bilik ${roomId}` && p.Status_Giliran === "Menunggu Dr");
            
            roomWaitingList.innerHTML = "";
            if (patientsForRoom.length === 0) {
                roomWaitingList.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 1rem 0;">Tiada pesakit</div>`;
            } else {
                patientsForRoom.forEach(p => {
                    const item = document.createElement("div");
                    item.className = "patient-item";
                    item.style.padding = "0.5rem 0.75rem";
                    item.onclick = () => selectPatientForTreatment(roomId, p.Nombor_Giliran);
                    item.innerHTML = `
                        <div style="font-size: 0.8rem;">
                            <strong>${p.Nama_Penuh}</strong>
                        </div>
                        <span class="badge badge-blue">${p.Nombor_Giliran}</span>
                    `;
                    roomWaitingList.appendChild(item);
                });
            }

            // Populate treated cases history list
            renderTreatedList(roomId);
        } else {
            statusBadge.className = "badge badge-red";
            statusBadge.innerText = "TUTUP";
            loginSection.style.display = "block";
            activeSection.style.display = "none";
        }
    }
}

function renderTreatedList(roomId) {
    const listEl = document.getElementById(`dr-treated-list-${roomId}`);
    if (!listEl) return;
    
    const treated = masterData.filter(p => p.No_Bilik_Doktor === `Bilik ${roomId}` && (p.Status_Giliran === "Discharge Home" || p.Status_Giliran === "Refer"));
    
    listEl.innerHTML = "";
    if (treated.length === 0) {
        listEl.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.75rem; padding: 0.5rem 0;">Tiada kes dirawat hari ini</div>`;
    } else {
        // Reverse so latest is on top
        [...treated].reverse().forEach(p => {
            const item = document.createElement("div");
            item.className = "patient-item";
            item.style.cursor = "default";
            item.style.padding = "0.4rem 0.6rem";
            item.style.marginBottom = "0.4rem";
            item.style.background = "rgba(15, 23, 42, 0.3)";
            
            const badgeClass = p.Status_Giliran === "Refer" ? "badge-orange" : "badge-green";
            const referText = p.Status_Giliran === "Refer" ? ` (Ke: ${p.Tempat_Rujukan})` : "";
            
            item.innerHTML = `
                <div style="flex: 1; min-width: 0;">
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.25rem;">
                        <span style="font-weight: 700; color: white; font-size: 0.8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 130px;">${p.Nama_Penuh}</span>
                        <span class="badge ${badgeClass}" style="font-size: 0.6rem; padding: 0.1rem 0.4rem;">${p.Status_Giliran}</span>
                    </div>
                    <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 0.15rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        <strong>Dx:</strong> ${p.Diagnosis || "-"}${referText}
                    </div>
                </div>
            `;
            listEl.appendChild(item);
        });
    }
}

function selectPatientForTreatment(roomId, qNum) {
    const patient = masterData.find(p => p.Nombor_Giliran === qNum);
    
    document.getElementById(`active-treatment-placeholder-${roomId}`).style.display = "none";
    document.getElementById(`active-treatment-${roomId}`).style.display = "block";
    
    document.getElementById(`active-patient-name-${roomId}`).innerText = `${patient.Nombor_Giliran} (${patient.Nama_Penuh})`;
    document.getElementById(`active-purpose-${roomId}`).innerText = patient.Tujuan_Kehadiran || "-";
    document.getElementById(`active-bmi-${roomId}`).innerText = patient.BMI || "-";
    document.getElementById(`active-vital-${roomId}`).innerText = `BP: ${patient.Tekanan_Darah} | HR: ${patient.Kadar_Nadi} | Temp: ${patient.Suhu_Badan}°C`;
    document.getElementById(`active-complaint-${roomId}`).innerText = patient.Chief_Complaint || "-";
    
    // Store current patient number in panel dataset
    document.getElementById(`active-treatment-${roomId}`).dataset.qnum = qNum;
}

function callPatient(roomId, isRecall = false) {
    const treatmentPanel = document.getElementById(`active-treatment-${roomId}`);
    const qNum = treatmentPanel.dataset.qnum;
    const patient = masterData.find(p => p.Nombor_Giliran === qNum);
    
    if (!patient) return;

    if (!isRecall) {
        patient.Status_Giliran = "Dipanggil";
        patient.Masa_Dipanggil = new Date().toLocaleString('ms-MY');
    }

    saveLocalStorage();
    renderTvDisplay();
    renderDatabaseTables();
    renderTriageWaiting();

    // Visual chime trigger and speech synthesis voice output
    playChime();
    setTimeout(() => {
        speakText(`Nombor Giliran, ${patient.Nombor_Giliran.split('-').join(' ')}, sila masuk ke Bilik ${roomId}`);
    }, 800);
}

function toggleReferralInput(roomId) {
    const container = document.getElementById(`refer-input-container-${roomId}`);
    container.style.display = container.style.display === "none" ? "block" : "none";
}

function dischargePatient(roomId, disposition) {
    const treatmentPanel = document.getElementById(`active-treatment-${roomId}`);
    const qNum = treatmentPanel.dataset.qnum;
    const patient = masterData.find(p => p.Nombor_Giliran === qNum);

    if (!patient) return;

    patient.Diagnosis = document.getElementById(`dr-diagnosis-${roomId}`).value.trim() || "-";
    patient.Cuti_Sakit_Hari = parseInt(document.getElementById(`dr-mc-${roomId}`).value) || 0;
    patient.Status_Giliran = disposition;

    if (disposition === 'Refer') {
        const target = document.getElementById(`dr-refer-target-${roomId}`).value.trim();
        if (!target) {
            alert("Sila isi destinasi rujukan.");
            return;
        }
        patient.Tempat_Rujukan = target;
    } else {
        patient.Tempat_Rujukan = "";
    }

    saveLocalStorage();

    // Reset Doctor room state
    treatmentPanel.style.display = "none";
    document.getElementById(`active-treatment-placeholder-${roomId}`).style.display = "block";
    document.getElementById(`dr-diagnosis-${roomId}`).value = "";
    document.getElementById(`dr-mc-${roomId}`).value = "0";
    document.getElementById(`refer-input-container-${roomId}`).style.display = "none";
    if (document.getElementById(`dr-refer-target-${roomId}`)) {
        document.getElementById(`dr-refer-target-${roomId}`).value = "";
    }

    // Refresh UI
    renderDoctorPanels();
    renderTvDisplay();
    renderDatabaseTables();
    renderTriageWaiting();
    initCharts();
}

// TV Waiting Display Screen
function updateClock() {
    const clockEl = document.getElementById("tv-clock");
    if (clockEl) {
        clockEl.innerText = new Date().toLocaleTimeString('ms-MY');
    }
}

function renderTvDisplay() {
    // Current called patient
    const calledPatients = masterData.filter(p => p.Status_Giliran === "Dipanggil");
    const tvNum = document.getElementById("tv-num");
    const tvRoom = document.getElementById("tv-room");
    const tvName = document.getElementById("tv-patient-name");
    const tvCaller = document.getElementById("tv-caller");

    if (calledPatients.length > 0) {
        // Pick the latest called
        const latest = calledPatients[calledPatients.length - 1];
        tvNum.innerText = latest.Nombor_Giliran;
        tvRoom.innerText = latest.No_Bilik_Doktor.toUpperCase();
        tvName.innerText = latest.Nama_Penuh;
        tvCaller.classList.add("tv-calling-active");
    } else {
        tvNum.innerText = "--";
        tvRoom.innerText = "SILA TUNGGU SEBENTAR";
        tvName.innerText = "--";
        tvCaller.classList.remove("tv-calling-active");
    }

    // Update Room statuses on TV
    for (let r = 1; r <= 3; r++) {
        const room = statusBilik[r - 1];
        const statusEl = document.getElementById(`tv-waiting-status-${r}`);
        const drEl = document.getElementById(`tv-dr-${r}`);
        
        if (room.Status === "Aktif") {
            drEl.innerText = room.Nama_Doktor_Bertugas.toUpperCase();
            
            // Check if there is someone currently inside
            const inside = masterData.find(p => p.No_Bilik_Doktor === `Bilik ${r}` && p.Status_Giliran === "Dipanggil");
            if (inside) {
                statusEl.innerText = inside.Nombor_Giliran;
                statusEl.style.color = "#34d399"; // green for inside
            } else {
                // Get next patient in line
                const next = masterData.find(p => p.No_Bilik_Doktor === `Bilik ${r}` && p.Status_Giliran === "Menunggu Dr");
                statusEl.innerText = next ? next.Nombor_Giliran : "TIADA";
                statusEl.style.color = "#94a3b8";
            }
        } else {
            drEl.innerText = "TUTUP";
            statusEl.innerText = "--";
            statusEl.style.color = "#ef4444";
        }
    }

    // Update Bottom Ticker
    const ticker = document.getElementById("tv-ticker");
    const waitingList = masterData.filter(p => p.Status_Giliran === "Menunggu Triage");
    if (waitingList.length > 0) {
        ticker.innerText = `Menunggu Triage: ${waitingList.map(p => p.Nombor_Giliran).join(", ")} | Sila pastikan anda bersedia di ruang menunggu utama.`;
    } else {
        ticker.innerText = "Selamat Datang ke Klinik Warga. Sila daftar masuk kehadiran anda dengan mengimbas kod QR di kaunter pendaftaran.";
    }
}

// Google Sheets Log Views
function switchDbTab(tab) {
    currentDbTab = tab;
    document.getElementById("db-tab-master").classList.toggle("active", tab === 'master');
    document.getElementById("db-tab-rooms").classList.toggle("active", tab === 'rooms');
    document.getElementById("db-view-master").style.display = tab === 'master' ? 'block' : 'none';
    document.getElementById("db-view-rooms").style.display = tab === 'rooms' ? 'block' : 'none';
}

function renderDatabaseTables() {
    const masterBody = document.getElementById("db-master-body");
    masterBody.innerHTML = "";
    
    // Sort reverse so latest entries appear on top like a spreadsheet feed
    [...masterData].reverse().forEach(p => {
        const tr = document.createElement("tr");
        let statusClass = "badge-blue";
        if (p.Status_Giliran.includes("Discharge")) statusClass = "badge-green";
        if (p.Status_Giliran === "Refer") statusClass = "badge-orange";
        if (p.Status_Giliran === "Dipanggil") statusClass = "badge-purple";

        tr.innerHTML = `
            <td>${p.Timestamp || "-"}</td>
            <td><strong>${p.Nombor_Giliran}</strong></td>
            <td>${p.Nama_Penuh}</td>
            <td>${p.No_IC}</td>
            <td>${p.Kakitangan_KKM}</td>
            <td>${p.Pekerjaan}</td>
            <td>${p.Jabatan}</td>
            <td>${p.Jenis_Kes || "-"}</td>
            <td>${p.Tujuan_Kehadiran || "-"}</td>
            <td>${p.BMI || "-"}</td>
            <td>${p.Tekanan_Darah ? `${p.Tekanan_Darah} (${p.Kadar_Nadi}bpm, ${p.Suhu_Badan}°C)` : "-"}</td>
            <td>${p.No_Bilik_Doktor || "-"}</td>
            <td>${p.Nama_Doktor || "-"}</td>
            <td>${p.Masa_Dipanggil || "-"}</td>
            <td>${p.Diagnosis || "-"}</td>
            <td>${p.Cuti_Sakit_Hari} hari</td>
            <td>${p.Tempat_Rujukan || "-"}</td>
            <td><span class="badge ${statusClass}">${p.Status_Giliran}</span></td>
        `;
        masterBody.appendChild(tr);
    });

    const roomsBody = document.getElementById("db-rooms-body");
    roomsBody.innerHTML = "";
    statusBilik.forEach(r => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>${r.No_Bilik}</strong></td>
            <td><span class="badge ${r.Status === 'Aktif' ? 'badge-green' : 'badge-red'}">${r.Status}</span></td>
            <td>${r.Nama_Doktor_Bertugas || "-"}</td>
            <td>${r.Masa_Dibuka || "-"}</td>
        `;
        roomsBody.appendChild(tr);
    });
}

// Chart.js Looker Analytics Generator
function initCharts() {
    // Collect Data metrics
    const total = masterData.length;
    const discharged = masterData.filter(p => p.Status_Giliran === "Discharge Home").length;
    const referred = masterData.filter(p => p.Status_Giliran === "Refer").length;
    
    document.getElementById("stat-total-patients").innerText = total;
    document.getElementById("stat-discharge-rate").innerText = total > 0 ? Math.round((discharged / total) * 100) + "%" : "0%";
    document.getElementById("stat-refer-rate").innerText = total > 0 ? Math.round((referred / total) * 100) + "%" : "0%";
    
    // Average treatment duration (Discharge minus Dipanggil)
    let totalSec = 0;
    let treatedCount = 0;
    masterData.forEach(p => {
        if (p.Masa_Dipanggil && p.Timestamp && (p.Status_Giliran.includes("Discharge") || p.Status_Giliran === "Refer")) {
            // Parse custom Malaysian date format: "DD/MM/YYYY HH:MM:SS" or just parse natively if convertible
            // Let's assume standard local timestamps for clean delta calculation
            const parseDate = (str) => {
                const parts = str.split(", ");
                if (parts.length === 2) {
                    const dateParts = parts[0].split("/");
                    const timeParts = parts[1].split(":");
                    return new Date(dateParts[2], dateParts[1] - 1, dateParts[0], timeParts[0], timeParts[1]);
                }
                return new Date(str);
            };
            try {
                const start = parseDate(p.Masa_Dipanggil);
                const end = new Date(p.Timestamp); // rough approximation
                const diff = (end - start) / 1000;
                if (diff > 0 && diff < 86400) {
                    totalSec += diff;
                    treatedCount++;
                }
            } catch (err) {}
        }
    });
    
    document.getElementById("stat-avg-time").innerText = treatedCount > 0 ? Math.round(totalSec / treatedCount / 60) + " min" : "12 min";

    // Chart 1: Purpose & Case Type Breakdown
    const purposes = { ME: 0, MS: 0, IM: 0, OD: 0 };
    masterData.forEach(p => {
        if (p.Tujuan_Kehadiran in purposes) purposes[p.Tujuan_Kehadiran]++;
    });

    if (chartPurpose) chartPurpose.destroy();
    chartPurpose = new Chart(document.getElementById("chart-purpose"), {
        type: 'pie',
        data: {
            labels: ['Medical Exam (ME)', 'Surveillance (MS)', 'Immunisation (IM)', 'Occupational Disease (OD)'],
            datasets: [{
                data: [purposes.ME, purposes.MS, purposes.IM, purposes.OD],
                backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8' } } }
        }
    });

    // Chart 2: Doctor Workload
    const drs = {};
    masterData.forEach(p => {
        if (p.Nama_Doktor) {
            drs[p.Nama_Doktor] = (drs[p.Nama_Doktor] || 0) + 1;
        }
    });
    
    if (chartDoctor) chartDoctor.destroy();
    chartDoctor = new Chart(document.getElementById("chart-doctor"), {
        type: 'bar',
        data: {
            labels: Object.keys(drs).length > 0 ? Object.keys(drs) : ['Dr. Azmil', 'Dr. Sarah', 'Dr. Wong'],
            datasets: [{
                label: 'Jumlah Pesakit Rawatan',
                data: Object.keys(drs).length > 0 ? Object.values(drs) : [0, 0, 0],
                backgroundColor: 'rgba(139, 92, 246, 0.6)',
                borderColor: '#8b5cf6',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', stepSize: 1 } },
                x: { ticks: { color: '#94a3b8' } }
            },
            plugins: { legend: { display: false } }
        }
    });

    // Chart 3: Patient BMI Distribution
    let normal = 0, overweight = 0, obese = 0;
    masterData.forEach(p => {
        if (p.BMI) {
            const bmi = parseFloat(p.BMI);
            if (bmi < 25) normal++;
            else if (bmi >= 25 && bmi < 30) overweight++;
            else obese++;
        }
    });

    if (chartBmi) chartBmi.destroy();
    chartBmi = new Chart(document.getElementById("chart-bmi"), {
        type: 'doughnut',
        data: {
            labels: ['Normal (<25)', 'Overweight (25-30)', 'Obese (>30)'],
            datasets: [{
                data: [normal, overweight, obese],
                backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8' } } }
        }
    });

    // Chart 4: Department distribution
    const depts = {};
    masterData.forEach(p => {
        if (p.Jabatan && p.Jabatan !== "-") {
            depts[p.Jabatan] = (depts[p.Jabatan] || 0) + 1;
        }
    });

    if (chartDept) chartDept.destroy();
    chartDept = new Chart(document.getElementById("chart-dept"), {
        type: 'bar',
        data: {
            labels: Object.keys(depts).length > 0 ? Object.keys(depts) : ['Tiada Data'],
            datasets: [{
                label: 'Pesakit mengikut Jabatan',
                data: Object.keys(depts).length > 0 ? Object.values(depts) : [0],
                backgroundColor: 'rgba(59, 130, 246, 0.6)',
                borderColor: '#3b82f6',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', stepSize: 1 } },
                x: { ticks: { color: '#94a3b8' } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

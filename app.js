class TimerEngine {
    constructor() {
        this.remaining = 0; this.duration = 0; this.lastTick = 0;
        this.isRunning = false; this.isOvertime = false; this.speedFactor = 1.0;
        this.onTick = null;
    }
    setDuration(s) { this.duration = s * 1000; this.remaining = this.duration; this.isOvertime = false; }
    start() { if (this.isRunning) return; this.isRunning = true; this.lastTick = performance.now(); this.tick(); }
    pause() { this.isRunning = false; }
    stop() { this.isRunning = false; this.isOvertime = false; }
    tick() {
        if (!this.isRunning) return;
        const now = performance.now();
        const delta = (now - this.lastTick) * this.speedFactor;
        this.lastTick = now;
        this.remaining -= delta;
        if (this.remaining <= 0 && !this.isOvertime) this.isOvertime = true;
        if (this.onTick) this.onTick(this.remaining);
        requestAnimationFrame(() => this.tick());
    }
}

class App {
    constructor() {
        this.engine = new TimerEngine();
        this.cues = JSON.parse(localStorage.getItem('cuetimer_v7')) || [
            { id: 1, name: 'Intro', duration: '00:05:00', alert1: '00:01:00', alert2: '00:00:30', action: 'Overtime', speed: 100 },
            { id: 2, name: 'Keynote', duration: '00:45:00', alert1: '00:05:00', alert2: '00:01:00', action: 'Stop', speed: 100 }
        ];
        this.selectedCueId = this.cues[0].id;
        this.runningCueId = null;
        this.clockMode = false;
        this.clipboard = null;

        this.initUI();
        this.setupEventListeners();
        this.renderTable();
    }

    initUI() {
        this.mainDisplay = document.getElementById('mainDisplay');
        this.activeName = document.getElementById('activeCueName');
        this.activeAction = document.getElementById('activeEndAction');
        this.tbody = document.getElementById('cueTableBody');
        this.speedIn = document.getElementById('speedInput');
        this.ribbonCmds = document.getElementById('ribbon-commands');
        this.ribbonPlace = document.getElementById('ribbon-placeholder');
        this.engine.onTick = (rem) => this.updateAllDisplays(rem);
    }

    setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.nav-item').forEach(tab => {
            tab.onclick = () => {
                document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                if (tab.dataset.tab === 'commands') {
                    this.ribbonCmds.classList.remove('hidden');
                    this.ribbonPlace.classList.add('hidden');
                } else {
                    this.ribbonCmds.classList.add('hidden');
                    this.ribbonPlace.classList.remove('hidden');
                }
            };
        });

        const b = (id, f) => {
            const el = document.getElementById(id);
            if (el) el.onclick = f.bind(this);
            else console.warn('Missing element:', id);
        };
        
        b('btnStart', this.handleStart); 
        b('btnStop', this.handleStop);
        b('btnPause', () => this.engine.pause()); 
        b('btnRestart', () => { this.handleStop(); this.handleStart(); });
        b('btnUndo', () => console.log('Undo clicked'));

        b('btnAddMin', () => { this.engine.remaining += 60000; });
        b('btnSubMin', () => { this.engine.remaining -= 60000; });
        
        b('speedUp', () => this.adjustSpeed(1)); 
        b('speedDown', () => this.adjustSpeed(-1));
        if (this.speedIn) this.speedIn.onchange = () => this.adjustSpeed(0);

        b('btnClock', () => { this.clockMode = !this.clockMode; this.renderTable(); this.updateAllDisplays(this.engine.remaining); });
        b('btnPresentation', this.launchProjector);
        
        b('btnNew', this.handleNew); 
        b('btnDelete', this.handleDelete);
        b('btnCopy', () => { 
            const c = this.cues.find(x => x.id === this.selectedCueId);
            if (c) this.clipboard = {...c}; 
        });
        b('btnPaste', this.handlePaste);
    }

    handleStart(cueToStart = null) {
        const c = cueToStart || this.cues.find(x => x.id === this.selectedCueId);
        if (!c) return;
        this.selectedCueId = c.id;
        if (this.runningCueId !== c.id) {
            this.engine.stop();
            this.engine.setDuration(this.tToS(c.duration));
            this.engine.speedFactor = c.speed / 100;
        }
        this.runningCueId = c.id;
        this.engine.start();
        this.renderTable();
    }

    handleStop() { this.engine.stop(); this.runningCueId = null; this.renderTable(); this.updateAllDisplays(0); }
    handleDelete() {
        if (this.cues.length <= 1) return;
        this.cues = this.cues.filter(c => c.id !== this.selectedCueId);
        this.selectedCueId = this.cues[0].id;
        this.renderTable();
    }

    adjustSpeed(delta) {
        const c = this.cues.find(x => x.id === this.selectedCueId);
        if (!c) return;
        c.speed = delta === 0 ? parseInt(this.speedIn.value) || 100 : c.speed + delta;
        if (this.speedIn) this.speedIn.value = c.speed + '%';
        if (this.runningCueId === c.id) this.engine.speedFactor = c.speed / 100;
        this.renderTable();
    }

    handleNew() {
        const id = Date.now();
        this.cues.push({ id, name: 'New Cue', duration: '00:10:00', alert1: '00:01:00', alert2: '00:00:30', action: 'Overtime', speed: 100 });
        this.selectedCueId = id; this.renderTable();
    }

    handlePaste() {
        if (!this.clipboard) return;
        const copy = {...this.clipboard, id: Date.now()};
        this.cues.push(copy); this.selectedCueId = copy.id; this.renderTable();
    }

    renderTable() {
        if (!this.tbody) return;
        this.tbody.innerHTML = '';
        this.cues.forEach((c, i) => {
            const tr = document.createElement('tr');
            if (c.id === this.selectedCueId) {
                tr.classList.add('selected');
                if (this.speedIn) this.speedIn.value = c.speed + '%';
                this.activeName.innerText = c.name;
                this.activeAction.innerText = c.action;
            }
            if (c.id === this.runningCueId) tr.classList.add('running');
            const cnt = c.id === this.runningCueId ? this.formatTime(this.engine.remaining) : c.duration;
            
            tr.onclick = () => { this.selectedCueId = c.id; this.renderTable(); };
            
            tr.innerHTML = \`
                <td>\${i + 1}</td>
                <td data-f="name">\${c.name}</td>
                <td data-f="duration">\${c.duration}</td>
                <td>\${cnt}</td>
                <td data-f="speed">\${c.speed}%</td>
                <td data-f="alert1">\${c.alert1 || '--'}</td>
                <td data-f="alert2">\${c.alert2 || '--'}</td>
                <td data-f="action" style="color: #6366f1; font-weight: 600;">\${c.action}</td>
            \`;

            tr.querySelectorAll('[data-f]').forEach(td => {
                td.ondblclick = (e) => {
                    e.stopPropagation();
                    this.editCell(td, c, td.dataset.f);
                };
            });
            this.tbody.appendChild(tr);
        });
        localStorage.setItem('cuetimer_v7', JSON.stringify(this.cues));
    }

    editCell(td, c, f) {
        if (f === 'action') {
            const sel = document.createElement('select');
            sel.className = 'cell-input';
            ['Overtime', 'Stop', 'Hold', 'Repeat', 'Start Next'].forEach(o => {
                const opt = document.createElement('option'); opt.value = o; opt.innerText = o;
                if (o === c[f]) opt.selected = true;
                sel.appendChild(opt);
            });
            td.innerHTML = ''; td.appendChild(sel); sel.focus();
            sel.onchange = () => { c[f] = sel.value; this.renderTable(); };
            sel.onblur = () => this.renderTable();
            return;
        }

        const input = document.createElement('input');
        input.className = 'cell-input';
        input.value = c[f];
        td.innerHTML = ''; td.appendChild(input); input.focus();

        const save = () => {
            let v = input.value;
            if (f === 'duration' || f.includes('alert')) v = this.vT(v);
            if (f === 'speed') {
                v = parseInt(v) || 100;
                if (this.runningCueId === c.id) this.engine.speedFactor = v / 100;
            }
            if (f === 'duration' && this.runningCueId === c.id) {
                const oldS = this.tToS(c.duration); const newS = this.tToS(v);
                this.engine.duration = newS * 1000; this.engine.remaining += (newS - oldS) * 1000;
            }
            c[f] = v;
            this.renderTable();
        };
        input.onblur = save;
        input.onkeydown = (e) => { if (e.key === 'Enter') input.blur(); };
    }

    updateAllDisplays(rem) {
        const ts = this.clockMode ? new Date().toLocaleTimeString() : this.formatTime(rem);
        this.mainDisplay.innerText = ts;
        if (this.runningCueId) {
            const cell = document.getElementById('cnt-' + this.runningCueId); // Manual check not needed if we re-render efficiently
        }
        // Check for automation triggers
        if (this.runningCueId && rem <= 0) {
            const c = this.cues.find(x => x.id === this.runningCueId);
            if (c) {
                if (c.action === 'Stop') this.handleStop();
                else if (c.action === 'Hold') { this.engine.remaining = 0; this.engine.pause(); this.renderTable(); }
                else if (c.action === 'Repeat' && !this.engine.isOvertime) { this.handleStop(); this.handleStart(c); }
                else if (c.action === 'Start Next' && !this.engine.isOvertime) {
                    const idx = this.cues.findIndex(x => x.id === this.runningCueId);
                    if (idx < this.cues.length - 1) this.handleStart(this.cues[idx + 1]);
                    else this.handleStop();
                }
            }
        }
        this.updateExt(ts, rem < 0);
    }

    vT(s) { const n = s.replace(/[^0-9]/g, '').padStart(6, '0'); return \`\${n.slice(-6,-4)}:\${n.slice(-4,-2)}:\${n.slice(-2)}\`; }
    tToS(s) { const p = s.split(':').map(Number); return (p[0] * 3600) + (p[1] * 60) + p[2]; }
    formatTime(ms) {
        const s = Math.floor(Math.abs(ms) / 1000);
        return \`\${ms < 0 ? '-' : ''}\${Math.floor(s/3600).toString().padStart(2,'0')}:\${Math.floor((s%3600)/60).toString().padStart(2,'0')}:\${(s%60).toString().padStart(2,'0')}\`;
    }

    updateExt(ts, o) {
        if (this.proj && !this.proj.closed) this.proj.postMessage({ t: ts, o: o }, '*');
    }

    launchProjector() {
        this.proj = window.open('', 'Timer', 'width=800,height=600');
        if (this.proj) {
            this.proj.document.write(\`<html><body style="background:#000;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;font-family:Arial;overflow:hidden;"><div id="d" style="font-size:30vw;font-weight:bold;">00:00:00</div><script>window.onmessage=e=>{document.getElementById('d').innerText=e.data.t;document.getElementById('d').style.color=e.data.o?'#f00':'#fff';};<\/script></body></html>\`);
        }
    }
}

window.onload = () => { window.app = new App(); };

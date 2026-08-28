/* Chat riêng hai người. Không có server: hai browser nối tới broker MQTT
   công cộng qua WebSocket và tự nói với nhau. Nhờ vậy chạy được trên
   GitHub Pages (chỉ host file tĩnh, không chạy Node).

   Phần khoá, mã hoá và kết nối nằm ở Room (js/room.js) — dùng chung với Net
   (co-op) để chỉ chạy PBKDF2 một lần và chỉ mở một tập WebSocket.

   BẢO MẬT: xem chú thích đầu room.js. Tóm lại nội dung mã hoá AES-GCM, tên
   topic cũng suy từ mật khẩu, và mật khẩu không nằm trong code.

   XSS: tin do người khác gửi, mọi chỗ hiển thị PHẢI dùng textContent.
   Dùng innerHTML ở đây là mở cửa cho <img src=x onerror="..."> chạy JS
   trong browser, đọc được localStorage (gồm cả save game và mật khẩu). */
const Chat = {
  MAX_TEXT: 300,
  MAX_NAME: 24,
  SEND_GAP_MS: 700,
  HISTORY_MAX: 200,
  SEEN_MAX: 600,

  PASS_KEY: 'orangutan-idle/chat-pass',
  NAME_KEY: 'orangutan-idle/chat-name',
  LOG_KEY: 'orangutan-idle/chat-log',
  COOP_KEY: 'orangutan-idle/coop-on',

  els: {},
  myName: '',
  seen: new Set(),         // id đã vẽ, chống trùng khi tới từ nhiều broker
  _seenQ: [],              // hàng đợi FIFO để xoá bớt, tránh Set phình mãi
  _lastSend: 0,

  init() {
    this.els = {
      panel: document.getElementById('chat'),
      gate: document.getElementById('chat-gate'),
      pass: document.getElementById('gate-pass'),
      gname: document.getElementById('gate-name'),
      gerr: document.getElementById('gate-err'),
      body: document.getElementById('chat-body'),
      list: document.getElementById('chat-list'),
      form: document.getElementById('chat-form'),
      text: document.getElementById('chat-text'),
      send: document.getElementById('chat-send'),
      state: document.getElementById('chat-state'),
      count: document.getElementById('chat-count'),
      coop: document.getElementById('gate-coop-on'),
    };
    if (!this.els.panel) return;
    this.els.panel.removeAttribute('hidden');

    // đừng để phím tắt game ăn mất khi đang gõ
    for (const el of [this.els.pass, this.els.gname, this.els.text]) {
      el.addEventListener('keydown', (e) => e.stopPropagation());
    }

    this.els.gate.addEventListener('submit', (e) => {
      e.preventDefault();
      this.unlock();
    });

    this.els.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.send();
    });

    // Enter gửi, Shift+Enter xuống dòng
    this.els.text.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); }
    });
    this.els.text.addEventListener('input', () => this._updateCount());
    this._updateCount();

    // đã nhập lần trước thì vào thẳng, không hỏi lại
    const savedPass = localStorage.getItem(this.PASS_KEY);
    const savedName = localStorage.getItem(this.NAME_KEY);
    if (savedName) this.els.gname.value = savedName;
    if (this.els.coop) this.els.coop.checked = localStorage.getItem(this.COOP_KEY) === '1';
    if (savedPass) {
      this.els.pass.value = savedPass;
      this.unlock();
    }
  },

  /* ---------- Mở khoá ---------- */
  async unlock() {
    const pass = this.els.pass.value;
    const name = this.els.gname.value.trim().slice(0, this.MAX_NAME);
    if (pass.length < 4) {
      this.els.gerr.textContent = 'Mật khẩu ngắn quá, tối thiểu 4 ký tự';
      return;
    }

    this.els.gerr.textContent = '';
    this.myName = name || 'Ai đó';
    this._setState('Đang mở khoá...', 'wait');

    try {
      await Room.unlock(pass);
    } catch (err) {
      this.els.gerr.textContent = 'Không tạo được khoá. Trang phải mở qua http hoặc https.';
      this._setState('Lỗi khoá', 'bad');
      return;
    }

    localStorage.setItem(this.PASS_KEY, pass);
    localStorage.setItem(this.NAME_KEY, this.myName);
    // Net.wanted() đọc cờ này. Ghi trước khi Net.start() chạy ở main.js.
    if (this.els.coop) localStorage.setItem(this.COOP_KEY, this.els.coop.checked ? '1' : '0');

    this.els.gate.hidden = true;
    this.els.body.hidden = false;

    this._loadLog();

    /* Net.start() phải gọi TỪ ĐÂY, không chỉ ở main.js: lúc App.init() chạy
       thì chưa có khoá (người chơi chưa nhập, mà PBKDF2 cũng mất 0.5-2 giây),
       nên Net.start() ở đó luôn thoát sớm vì Room.ready còn false.

       Và phải gọi TRƯỚC Room.connect(): Net.start() đặt di chúc MQTT, mà di
       chúc chỉ có tác dụng nếu đặt trước khi mở kết nối. */
    await Net.start();

    this.connect();
  },

  /* ---------- Kết nối ---------- */
  /* Khoá và pool broker nằm ở Room, dùng chung với Net (co-op). */
  connect() {
    Room._onState = (live, total) => this._paintState(live, total);
    Room.sub('msg', (m) => this._onMsg(m));

    if (!Room.connect()) {
      this._setState('Chưa tải được thư viện mạng, kiểm tra internet', 'bad');
      return;
    }
    this._setState('Đang nối...', 'wait');
  },

  _paintState(live, total) {
    if (live === 0) this._setState('Mất kết nối, đang thử lại...', 'bad');
    else this._setState(`Đã nối · ${live}/${total} đường`, 'ok');
  },

  /* Room đã giải mã và bỏ rác giúp, chỉ còn việc vẽ. */
  _onMsg(m) {
    if (!m || typeof m.id !== 'string') return;

    const atBottom = this._atBottom();
    if (this._add(m)) {
      this._saveLog(m);
      if (atBottom) this._scrollDown();
    }
  },

  /* ---------- Gửi ---------- */
  async send() {
    const text = this.els.text.value.trim().slice(0, this.MAX_TEXT);
    if (!text || !Room.ready) return;

    const now = Date.now();
    if (now - this._lastSend < this.SEND_GAP_MS) return;

    if (!Room.live()) {
      this._setState('Chưa nối được, chưa gửi được', 'bad');
      return;
    }

    const msg = {
      id: Math.random().toString(36).slice(2, 10) + now.toString(36),
      name: this.myName,
      text,
      at: now,
    };

    this.els.send.disabled = true;
    try {
      await Room.pub('msg', msg);      // ra mọi broker đang sống
      this._lastSend = now;
      this.els.text.value = '';
      this._updateCount();

      this._add(msg);          // vẽ ngay, không chờ tin vòng lại
      this._saveLog(msg);
      this._scrollDown();
      this._paintState(Room.live(), Room.BROKERS.length);
    } catch (err) {
      this._setState('Không gửi được', 'bad');
    } finally {
      this.els.send.disabled = false;
      this.els.text.focus();
    }
  },

  /* ---------- Lịch sử trong máy ---------- */
  /* Lưu bản rõ vào localStorage: đã ở trên máy mình rồi, mã hoá lại cũng
     phải giữ khoá cạnh đó nên không thêm được gì. */
  _saveLog(m) {
    try {
      const log = JSON.parse(localStorage.getItem(this.LOG_KEY) || '[]');
      log.push(m);
      while (log.length > this.HISTORY_MAX) log.shift();
      localStorage.setItem(this.LOG_KEY, JSON.stringify(log));
    } catch (err) { /* hết chỗ thì thôi, không chặn chat */ }
  },

  _loadLog() {
    let log;
    try { log = JSON.parse(localStorage.getItem(this.LOG_KEY) || '[]'); } catch (err) { return; }
    if (!Array.isArray(log)) return;
    for (const m of log) this._add(m);
    this._scrollDown();
  },

  /* ---------- Vẽ tin ---------- */

  /* Dựng bằng createElement + textContent. Không innerHTML — xem đầu file.
     Trả về false nếu tin đã vẽ rồi (tới từ broker khác). */
  _add(m) {
    if (!m || typeof m.id !== 'string' || this.seen.has(m.id)) return false;

    // FIFO: Set không tự xoá, phiên chat dài sẽ phình mãi
    this.seen.add(m.id);
    this._seenQ.push(m.id);
    while (this._seenQ.length > this.SEEN_MAX) this.seen.delete(this._seenQ.shift());

    const row = document.createElement('div');
    row.className = 'chat-msg';

    const head = document.createElement('div');
    head.className = 'chat-head';

    const who = document.createElement('span');
    who.className = 'chat-who';
    who.textContent = m.name || 'Ai đó';        // an toàn: không parse HTML
    who.style.color = this._colorOf(m.name || '');

    const when = document.createElement('time');
    when.className = 'chat-time';
    const d = new Date(m.at || Date.now());
    when.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    when.dateTime = d.toISOString();

    head.append(who, when);

    const body = document.createElement('p');
    body.className = 'chat-text';
    body.textContent = m.text || '';            // an toàn

    row.append(head, body);
    this.els.list.append(row);

    while (this.els.list.children.length > 120) this.els.list.firstChild.remove();
    return true;
  },

  /* Màu ổn định theo tên, để cùng một người luôn cùng màu */
  _colorOf(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
    return `hsl(${h} 70% 72%)`;
  },

  _atBottom() {
    const el = this.els.list;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  },

  _scrollDown() {
    const el = this.els.list;
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  },

  _updateCount() {
    const n = this.els.text.value.length;
    this.els.count.textContent = `${n}/${this.MAX_TEXT}`;
    this.els.count.classList.toggle('over', n > this.MAX_TEXT * 0.9);
  },

  _setState(msg, kind) {
    if (!this.els.state) return;
    this.els.state.textContent = msg;
    this.els.state.dataset.kind = kind || '';
  },
};

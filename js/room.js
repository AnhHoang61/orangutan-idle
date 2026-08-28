/* Phòng riêng qua MQTT: dẫn xuất khoá, mã hoá, và pool broker dùng chung.

   Tách khỏi chat.js vì cả Chat và Net (co-op) đều cần cùng một khoá và cùng
   một tập kết nối. Hai lý do phải dùng chung chứ không mỗi bên một bản:

   1. PBKDF2 600k vòng mất 0.5–2 giây. Chạy hai lần là bắt người chơi chờ đôi.
   2. Một MQTT client subscribe được nhiều topic. Mỗi bên tự nối là 6 WebSocket
      tới 3 broker, mà broker công cộng (hivemq) có giới hạn số kết nối.

   BẢO MẬT: khoá AES và tên topic cùng ra từ MỘT lần PBKDF2. Nhờ vậy dò tên
   topic tốn đúng bằng dò khoá — nếu hash topic riêng bằng SHA-256 thì người
   ngoài brute-force được topic rất nhanh rồi ngồi nghe lưu lượng, dù không
   đọc nổi nội dung. Mật khẩu KHÔNG nằm trong code: repo là public. */
const Room = {
  /* Đổi NS là đổi tên topic -> mật khẩu cũ mất tác dụng. Giữ nguyên giá trị
     lịch sử của chat để người đang dùng không bị rơi phòng. */
  NS: 'orangutan-idle/chat/v1',

  /* Nối cả ba broker cùng lúc thay vì chọn một: mạng này chặn cổng 8084,
     mạng kia chặn 8884. Hai máy chỉ cần trùng ĐÚNG MỘT broker là nói được
     với nhau. Tin tới qua nhiều đường được lọc trùng ở tầng trên. */
  BROKERS: [
    'wss://broker.emqx.io:8084/mqtt',
    'wss://broker.hivemq.com:8884/mqtt',
    'wss://broker-cn.emqx.io:8084/mqtt',
  ],

  CONNECT_TIMEOUT: 12000,
  RETRY_MS: 15000,

  key: null,                // CryptoKey AES-GCM
  base: null,               // tiền tố topic, đã gồm NS
  clients: [],
  _subs: new Map(),         // leaf -> handler(obj)
  _will: null,              // {leaf, blob} đặt trước connect()
  _onState: null,           // callback cho UI báo trạng thái

  /* ---------- Dẫn xuất khoá ---------- */

  /* Một lần PBKDF2 ra 64 byte: 32 đầu làm khoá AES, 16 tiếp làm tên topic. */
  async unlock(pass) {
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey(
      'raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);

    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: enc.encode(this.NS), iterations: 600000, hash: 'SHA-256' },
      base, 512);

    const buf = new Uint8Array(bits);
    this.key = await crypto.subtle.importKey(
      'raw', buf.slice(0, 32), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);

    const topic = Array.from(buf.slice(32, 48))
      .map((b) => b.toString(16).padStart(2, '0')).join('');

    this.base = `${this.NS}/${topic}`;
    return this.base;
  },

  get ready() { return !!this.key; },

  /* ---------- Mã hoá ---------- */
  async encrypt(obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode(JSON.stringify(obj));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.key, data);
    return { v: 1, iv: this._b64(iv), ct: this._b64(new Uint8Array(ct)) };
  },

  async decrypt(env) {
    if (!env || env.v !== 1 || !env.iv || !env.ct) return null;
    const iv = this._unb64(env.iv);
    const ct = this._unb64(env.ct);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, this.key, ct);
    return JSON.parse(new TextDecoder().decode(plain));
  },

  _b64(u8) { return btoa(String.fromCharCode(...u8)); },
  _unb64(s) { return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); },

  /* ---------- Đăng ký nhận tin ---------- */

  /* Gọi được cả trước và sau connect(). Sau connect thì subscribe ngay trên
     các client đang sống. */
  sub(leaf, fn) {
    this._subs.set(leaf, fn);
    for (const c of this.clients) if (c && c.connected) c.subscribe(`${this.base}/${leaf}`, { qos: 1 });
  },

  /* Di chúc (Last Will): broker tự phát hộ khi máy này rớt không kịp chào.
     Payload phải mã hoá sẵn vì mqtt.connect() cần chuỗi ngay, không chờ await
     được. Đặt trước khi gọi connect(). */
  async setWill(leaf, obj) {
    this._will = { leaf, blob: JSON.stringify(await this.encrypt(obj)) };
  },

  /* ---------- Kết nối ---------- */
  connect() {
    if (typeof mqtt === 'undefined') return false;    // CDN bị chặn
    if (this.clients.length) return true;             // đã nối rồi

    for (const url of this.BROKERS) {
      const opt = {
        clientId: 'oi_' + Math.random().toString(36).slice(2, 12),
        connectTimeout: this.CONNECT_TIMEOUT,
        reconnectPeriod: this.RETRY_MS,
        clean: true,
      };
      if (this._will) {
        opt.will = { topic: `${this.base}/${this._will.leaf}`, payload: this._will.blob, qos: 1 };
      }

      const c = mqtt.connect(url, opt);

      /* Subscribe lại ở MỌI lần connect, không chỉ lần đầu: clean:true nên
         broker quên subscription cũ sau khi mạng chớp, tin sẽ im lặng không
         tới mà chẳng báo lỗi gì. */
      c.on('connect', () => {
        for (const leaf of this._subs.keys()) c.subscribe(`${this.base}/${leaf}`, { qos: 1 });
        this._paint();
      });
      c.on('message', (topic, payload) => this._route(topic, payload));
      c.on('close', () => this._paint());
      c.on('error', () => { /* broker này chết, còn broker khác */ });

      this.clients.push(c);
    }
    return true;
  },

  live() { return this.clients.filter((c) => c && c.connected).length; },

  primary() { return this.clients.find((c) => c && c.connected) || null; },

  _paint() { if (this._onState) this._onState(this.live(), this.BROKERS.length); },

  async _route(topic, payload) {
    const leaf = topic.slice(this.base.length + 1);
    const fn = this._subs.get(leaf);
    if (!fn) return;

    let obj;
    try {
      obj = await this.decrypt(JSON.parse(payload.toString()));
    } catch (err) {
      return;         // sai khoá, hoặc rác của người khác dùng chung broker
    }
    if (obj) fn(obj);
  },

  /* ---------- Gửi ---------- */

  /* Ra MỌI broker đang sống: máy kia có thể chỉ vào được một cái. Dùng cho
     tin hiếm mà không được mất (chào, giành quyền, ý định, thông báo). */
  async pub(leaf, obj, opts) {
    if (!this.key) return;
    const wire = JSON.stringify(await this.encrypt(obj));
    for (const c of this.clients) {
      if (c && c.connected) c.publish(`${this.base}/${leaf}`, wire, { qos: 1, ...opts });
    }
  },

  /* Chỉ broker đầu tiên đang sống, QoS 0. Dùng cho snapshot phát liên tục:
     nhân ba lên hạ tầng công cộng miễn phí là 3 lần lưu lượng mà chẳng lợi
     gì, vì snapshot idempotent — mất một cái thì cái sau tự chữa. */
  async pubOne(leaf, obj) {
    const c = this.primary();
    if (!c || !this.key) return;
    c.publish(`${this.base}/${leaf}`, JSON.stringify(await this.encrypt(obj)), { qos: 0 });
  },

  /* Xoá tin retained: gửi payload rỗng. Dùng khi host rời phòng. */
  clearRetained(leaf) {
    for (const c of this.clients) {
      if (c && c.connected) c.publish(`${this.base}/${leaf}`, '', { qos: 1, retain: true });
    }
  },
};

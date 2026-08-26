/* Thời tiết thật, lấy từ Open-Meteo (miễn phí, không cần API key).

   Vị trí: xin quyền geolocation của trình duyệt. Anh từ chối hoặc lỗi thì
   lùi về Hà Nội. Geolocation chỉ chạy trên HTTPS hoặc localhost.

   Dữ liệu gửi ra ngoài: toạ độ (làm tròn 2 chữ số ~1km) tới open-meteo.com.
   Không gửi gì khác. */
const Weather = {
  FALLBACK: { lat: 21.03, lon: 105.85, place: 'Hà Nội' },
  REFRESH_MS: 10 * 60 * 1000,

  /* Trạng thái hiện tại; game đọc trực tiếp mấy field này */
  kind: 'clear',        // clear | cloudy | overcast | fog | drizzle | rain | shower | snow | storm
  temp: null,
  feels: null,          // "cảm giác như", cao hơn temp khi độ ẩm cao
  precip: 0,            // mm mưa trong giờ hiện tại
  cloud: 0,             // 0..1 độ che phủ mây
  wind: 0,              // m/s
  isDay: true,
  place: null,
  status: 'idle',       // idle | locating | loading | ok | error
  denied: false,
  usedFallback: false,  // true = đang dùng toạ độ mặc định, không phải vị trí thật

  _timer: 0,
  _coords: null,

  /* Mã WMO của Open-Meteo -> loại thời tiết trong game.
     https://open-meteo.com/en/docs (bảng weathercode) */
  CODES: {
    0: 'clear', 1: 'clear', 2: 'cloudy', 3: 'overcast',
    45: 'fog', 48: 'fog',
    // 51-57 là mưa phùn (drizzle) — rất hay xuất hiện khi trời chỉ âm u,
    // nên để riêng thành 'drizzle' cho nhẹ, đừng quy về mưa thật
    51: 'drizzle', 53: 'drizzle', 55: 'drizzle', 56: 'drizzle', 57: 'drizzle',
    61: 'rain', 63: 'rain', 65: 'shower', 66: 'rain', 67: 'shower',
    71: 'snow', 73: 'snow', 75: 'snow', 77: 'snow',
    80: 'shower', 81: 'shower', 82: 'shower',
    85: 'snow', 86: 'snow',
    95: 'storm', 96: 'storm', 99: 'storm',
  },

  LABEL: {
    clear: 'Trời quang', cloudy: 'Ít mây', overcast: 'Nhiều mây',
    fog: 'Sương mù', drizzle: 'Mưa phùn', rain: 'Đang mưa', shower: 'Mưa rào',
    snow: 'Đang có tuyết', storm: 'Mưa dông',
  },

  ICON: {
    clear: '☀️', cloudy: '🌤️', overcast: '☁️', fog: '🌫️',
    drizzle: '🌦️', rain: '🌧️', shower: '🌧️', snow: '🌨️', storm: '⛈️',
  },

  get label() { return this.LABEL[this.kind] || this.kind; },
  get icon() {
    if (this.kind === 'clear' && !this.isDay) return '🌙';
    return this.ICON[this.kind] || '🌡️';
  },

  /* Có hạt nước rơi hay không; mưa phùn cũng tính (hạt nhỏ và thưa) */
  get isRaining() {
    return this.kind === 'drizzle' || this.kind === 'rain'
        || this.kind === 'shower' || this.kind === 'storm';
  },
  get isSnowing() { return this.kind === 'snow'; },

  /* Mưa/mây làm tối phòng thêm, cộng vào bóng tối của DayNight.
     Trả về 0..1, sẽ được Render cộng vào độ tối. */
  get gloom() {
    switch (this.kind) {
      case 'storm': return 0.42;
      case 'shower': return 0.32;
      case 'rain': return 0.26;
      case 'drizzle': return 0.18;
      case 'overcast': return 0.2;
      case 'fog': return 0.22;
      case 'snow': return 0.16;
      case 'cloudy': return 0.08;
      default: return 0;
    }
  },

  /* Tint phủ thêm theo thời tiết: mưa thì xám lam, tuyết thì trắng xanh */
  get tint() {
    switch (this.kind) {
      case 'storm': return [40, 52, 78, 0.2];
      case 'shower':
      case 'rain': return [58, 76, 104, 0.15];
      case 'drizzle': return [72, 88, 112, 0.1];
      case 'overcast': return [86, 92, 112, 0.1];
      case 'fog': return [150, 156, 172, 0.14];
      case 'snow': return [186, 206, 228, 0.12];
      default: return null;
    }
  },

  /* Trời có nắng để chiếu qua cửa sổ không */
  get sunFactor() {
    if (this.kind === 'drizzle') return 0.1;      // mưa phùn vẫn hé chút sáng
    if (this.isRaining || this.isSnowing || this.kind === 'fog') return 0;
    if (this.kind === 'overcast') return 0.12;
    if (this.kind === 'cloudy') return 0.55;
    return 1;
  },

  /* ---------- Lấy dữ liệu ---------- */

  init() {
    const cached = this._readCache();
    if (cached) this._apply(cached);

    this._locate()
      .then((c) => { this._coords = c; return this.fetch(); })
      .catch(() => { /* đã xử lý bên trong */ });
  },

  /* Xin quyền vị trí; thất bại thì dùng Hà Nội.

     `timeout` của getCurrentPosition chỉ chạy SAU khi người dùng bấm Allow —
     lúc popup còn treo thì nó không đếm. Nếu người dùng phớt popup thì không
     callback nào được gọi và cả chuỗi tra thời tiết đứng im. Nên phải tự hẹn
     giờ ở ngoài, hết hạn là đi tiếp với toạ độ mặc định. */
  _locate() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        this.denied = true;
        return resolve(this.FALLBACK);
      }
      this.status = 'locating';

      let settled = false;
      const finish = (c) => {
        if (settled) return;
        settled = true;
        resolve(c);
      };

      // không chờ mãi: 6 giây không có trả lời thì dùng mặc định
      setTimeout(() => {
        if (!settled) this.usedFallback = true;
        finish(this.FALLBACK);
      }, 6000);

      navigator.geolocation.getCurrentPosition(
        (pos) => finish({
          // làm tròn ~1km, không cần chính xác hơn để tra thời tiết
          lat: Math.round(pos.coords.latitude * 100) / 100,
          lon: Math.round(pos.coords.longitude * 100) / 100,
          place: null,
        }),
        () => {
          this.denied = true;
          this.usedFallback = true;
          finish(this.FALLBACK);
        },
        { timeout: 8000, maximumAge: 30 * 60 * 1000 },
      );
    });
  },

  async fetch() {
    const c = this._coords || this.FALLBACK;
    this.status = 'loading';
    const url = 'https://api.open-meteo.com/v1/forecast'
      + `?latitude=${c.lat}&longitude=${c.lon}`
      + '&current=temperature_2m,apparent_temperature,precipitation,'
      + 'weather_code,cloud_cover,wind_speed_10m,is_day'
      + '&wind_speed_unit=ms&timezone=auto';

    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const cur = j.current || {};

      const cloud = clamp((cur.cloud_cover || 0) / 100, 0, 1);
      const precip = +cur.precipitation || 0;
      let kind = this.CODES[cur.weather_code] || 'clear';

      // Open-Meteo hay trả mã 51-57 (mưa phùn) khi trời chỉ âm u, lượng mưa
      // gần 0. Không có nước rơi thật thì hiện theo độ che phủ mây mới khớp
      // với app thời tiết ngoài đời.
      if (kind === 'drizzle' && precip < 0.25) {
        kind = cloud > 0.8 ? 'overcast' : cloud > 0.4 ? 'cloudy' : 'clear';
      }

      const data = {
        kind,
        temp: typeof cur.temperature_2m === 'number' ? Math.round(cur.temperature_2m) : null,
        feels: typeof cur.apparent_temperature === 'number'
          ? Math.round(cur.apparent_temperature) : null,
        precip,
        cloud,
        wind: +cur.wind_speed_10m || 0,
        isDay: cur.is_day !== 0,
        place: c.place,
        at: Date.now(),
      };
      this._apply(data);
      this._writeCache(data);
      this.status = 'ok';
      return data;
    } catch (e) {
      // mất mạng hoặc API lỗi: giữ nguyên cache, game vẫn chơi được
      this.status = this.temp === null ? 'error' : 'ok';
      return null;
    }
  },

  _apply(d) {
    this.kind = d.kind;
    this.temp = d.temp;
    this.feels = d.feels ?? null;
    this.precip = d.precip || 0;
    this.cloud = d.cloud;
    this.wind = d.wind;
    this.isDay = d.isDay;
    if (d.place) this.place = d.place;
  },

  /* Chuỗi nhiệt độ hiện trên thanh trạng thái */
  get tempText() {
    return this.temp === null ? '' : `${this.temp}°`;
  },

  /* Cache để mở game lại không phải chờ mạng */
  _readCache() {
    try {
      const raw = localStorage.getItem('orangutan-idle/weather');
      if (!raw) return null;
      const d = JSON.parse(raw);
      // quá 2 tiếng thì coi như cũ, không dùng
      return (d && Date.now() - d.at < 2 * 3600 * 1000) ? d : null;
    } catch (e) { return null; }
  },

  _writeCache(d) {
    try { localStorage.setItem('orangutan-idle/weather', JSON.stringify(d)); } catch (e) { /* bỏ qua */ }
  },

  update(dt) {
    this._timer -= dt;
    if (this._timer <= 0) {
      this._timer = this.REFRESH_MS;
      if (this._coords) this.fetch();
    }
  },
};

/* Ngày/đêm khớp giờ thật của máy. Không có chu kỳ rút gọn: 15h chiều ngoài
   trời thì trong phòng cũng đang nắng xiên, 2h sáng thì tối đen.

   `light` 0..1 là lượng sáng tự nhiên (1 = trưa nắng, 0 = nửa đêm).
   `tint` là màu phủ lên toàn khung để đổi không khí: cam lúc chiều,
   xanh tím lúc đêm. Render đọc hai giá trị này thay vì chỉ lightsOn. */
const DayNight = {
  t: 0.5,                      // 0..1 vị trí trong ngày, suy ra từ giờ hệ thống

  /* Mốc theo giờ thật (0..24). Giữa hai mốc thì nội suy tuyến tính.
     Chọn theo nhịp sáng thật ở vĩ độ Việt Nam: sáng từ ~5h30, tối từ ~18h30. */
  KEYS: [
    { h: 0,    name: 'Nửa đêm',    light: 0.04, tint: [28, 30, 78, 0.34] },
    { h: 5,    name: 'Rạng sáng',  light: 0.10, tint: [58, 60, 122, 0.28] },
    { h: 6.5,  name: 'Bình minh',  light: 0.42, tint: [255, 168, 128, 0.20] },
    { h: 8,    name: 'Buổi sáng',  light: 0.90, tint: [255, 246, 214, 0.07] },
    { h: 12,   name: 'Giữa trưa',  light: 1.00, tint: [255, 252, 232, 0.03] },
    { h: 15.5, name: 'Buổi chiều', light: 0.85, tint: [255, 214, 150, 0.11] },
    { h: 17.5, name: 'Chiều muộn', light: 0.58, tint: [255, 190, 120, 0.16] },
    { h: 18.5, name: 'Hoàng hôn',  light: 0.32, tint: [255, 124, 92, 0.26] },
    { h: 19.5, name: 'Đêm xuống',  light: 0.12, tint: [40, 44, 96, 0.32] },
    { h: 21,   name: 'Buổi đêm',   light: 0.06, tint: [30, 32, 82, 0.34] },
    { h: 24,   name: 'Nửa đêm',    light: 0.04, tint: [28, 30, 78, 0.34] },
  ],

  light: 1,
  tint: [255, 252, 232, 0.03],
  phaseName: 'Buổi sáng',

  /* Đọc đồng hồ máy. dt không dùng nữa nhưng giữ chữ ký cho game loop. */
  update(dt) {
    const d = new Date();
    const h = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
    this.t = h / 24;
    this._sample();
  },

  /* Nội suy light + tint giữa hai keyframe bao quanh giờ hiện tại */
  _sample() {
    const K = this.KEYS;
    const h = this.t * 24;
    let i = 0;
    while (i < K.length - 2 && K[i + 1].h <= h) i++;
    const a = K[i], b = K[i + 1];
    const span = b.h - a.h || 1;
    const u = clamp((h - a.h) / span, 0, 1);

    this.light = lerp(a.light, b.light, u);
    this.tint = [
      lerp(a.tint[0], b.tint[0], u),
      lerp(a.tint[1], b.tint[1], u),
      lerp(a.tint[2], b.tint[2], u),
      lerp(a.tint[3], b.tint[3], u),
    ];
    this.phaseName = u < 0.5 ? a.name : b.name;
  },

  /* Trời đủ tối để pet buồn ngủ và đèn sao có ý nghĩa */
  get isNight() { return this.light < 0.3; },

  /* Nắng xiên qua cửa sổ mạnh nhất quanh 16h, tắt hẳn về đêm */
  get sunbeam() {
    if (this.light < 0.35) return 0;
    const d = Math.abs(this.t * 24 - 16);      // giờ hiện tại cách 16h bao xa
    return clamp(1 - d / 4.5, 0, 1) * this.light;
  },

  /* Nhãn hiện trên thanh trạng thái, kèm icon theo pha */
  get icon() {
    if (this.light > 0.85) return '☀️';
    if (this.light > 0.5) return '🌤️';
    if (this.light > 0.3) return '🌅';
    if (this.light > 0.12) return '🌆';
    return '🌙';
  },

  /* Giờ thật của máy, hiện tới phút */
  get clock() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  },
};

DayNight.update(0);

DayNight._sample();

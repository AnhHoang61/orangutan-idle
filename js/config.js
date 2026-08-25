/* Hằng số, bảng màu, cấu hình hành vi mèo. */
const CFG = {
  W: 1120,
  H: 560,
  FLOOR_Y: 370,          // mép sàn, mèo chỉ đi trong vùng dưới đường này
  WALK_TOP: 396,         // mép trong cùng của sàn (perspective giả)
  MARGIN: 80,
  CAT_SCALE: 1.32,       // mèo to lên cho cân với khung rộng

  // Chỉ số 0..100, trừ dần mỗi giây thực
  // hunger ~15 phút, energy ~22 phút, happy ~18 phút mới cạn từ đầy
  DECAY: { hunger: 0.11, energy: 0.075, happy: 0.09 },
  SLEEP_RECOVER: 2.4,    // energy hồi mỗi giây khi ngủ
  TIRED_AT: 18,          // dưới mức này thì tự đi ngủ
  HUNGRY_AT: 25,

  IDLE_MIN: 1400,        // khoảng nghỉ giữa hai quyết định
  IDLE_MAX: 4200,
};

const PAL = {
  wallTop: '#4a3f63',
  wallBot: '#3a3152',
  floor: '#6b4f3a',
  floorDark: '#5a4130',
  rug: '#7c5c86',
  rugEdge: '#9a74a6',
  furA: '#d9722e',        // lông cam đười ươi
  furB: '#b0561d',        // vệt lông sẫm
  furLight: '#f0a057',
  belly: '#e8945a',       // ngực sáng hơn
  ear: '#c98a63',
  face: '#d9a077',        // đĩa mặt nhạt
  faceDark: '#b57a55',
  snout: '#e0b18d',       // vùng quanh miệng
  nostril: '#7a4a33',
  hoof: '#8a5a3a',        // bàn tay, bàn chân
  eye: '#33221a',
  eyeGlow: '#9be3ff',
  bowl: '#7fb6d8',
  bowlDark: '#5d92b4',
  food: '#c97b48',
  ball: '#d95f8a',
  laser: '#ff4b5c',
  night: 'rgba(14, 12, 30, 0.62)',
};

/* Câu thoại theo trạng thái, hiện ở dòng mood */
const MOODS = {
  idle:   ['đang thư giãn', 'ngó quanh phòng', 'vắt tay suy tư'],
  walk:   ['lê tay đi một vòng', 'lượn lờ', 'sục sạo tìm đồ ăn'],
  sit:    ['ngồi bó tay nghĩ ngợi', 'ngồi ngắm anh'],
  groom:  ['gãi gãi cái đầu', 'bắt chấy cho mình'],
  sleep:  ['đang ngủ, đừng ồn', 'khò khò...'],
  chase:  ['ĐUỔI CÁI ĐỐM ĐỎ!', 'hí hí rượt đốm đỏ'],
  play:   ['vỗ quả bóng', 'chơi hăng lắm'],
  eat:    ['ăn nhiệt tình lắm', 'nhai nhóp nhép'],
  pet:    ['khì khì khoan khoái...', 'thích được vuốt'],
  hungry: ['kêu khẹc đòi ăn', 'đói lắm rồi'],
  tired:  ['buồn ngủ quá...', 'lim dim mắt'],
};

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function rand(a, b) { return a + Math.random() * (b - a); }

/* Ngẫu nhiên tất định theo chỉ số: chi tiết nền không nhấp nháy giữa các frame */
function hash1(n) {
  let h = (n | 0) * 374761393 + 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function lerp(a, b, t) { return a + (b - a) * t; }

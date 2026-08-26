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

  // Con `lazy` (lợn) chỉ đuổi laser/bóng được chừng này rồi ngồi phệt xuống thở
  LAZY_GIVEUP: 2600,
  LAZY_COOLDOWN: 7000,   // hết mệt mới chịu đuổi tiếp
};

/* Khung diáorama: căn phòng là một cái hộp đặt giữa khung, có tường ngoài dày
   và bóng đổ quanh viền, nhìn như nhà búp bê chứ không phải phòng tràn màn hình.
   Mọi thứ vẽ bên trong phải nằm trong vùng INNER. */
const BOX = {
  padY: 13,           // khoảng trống từ mép canvas tới tường ngoài, trên/dưới
  wall: 11,           // độ dày tường ngoài
  radius: 20,         // bo góc hộp

  /* Lề ngang không đặt cứng mà suy ra, sao cho lòng hộp có đúng tỷ lệ
     CFG.W:CFG.H. Nếu đặt cứng cả hai lề thì lòng hộp bị lệch tỷ lệ và phòng
     nằm giữa để hở nền gỗ hai bên. */
  get padX() { return (CFG.W - this.h * (CFG.W / CFG.H)) / 2 - this.wall; },

  get x() { return this.padX + this.wall; },
  get y() { return this.padY + this.wall; },
  get w() { return CFG.W - (this.padX + this.wall) * 2; },
  get h() { return CFG.H - (this.padY + this.wall) * 2; },

  /* Khung ngoài của hộp (mặt gỗ), tính cả tường */
  get ox() { return this.padX; },
  get oy() { return this.padY; },
  get ow() { return CFG.W - this.padX * 2; },
  get oh() { return CFG.H - this.padY * 2; },
  get right() { return this.x + this.w; },
  get bottom() { return this.y + this.h; },

  /* Nội dung phòng vẫn vẽ bằng toạ độ CFG (0..W, 0..H) như trước; transform
     này nén nó vào lòng hộp. Nhờ vậy không phải sửa lại toạ độ trong
     Scenes/Decor/Items/Pets.

     Scale theo CHIỀU CAO, không theo chiều rộng: pet đi lại tới y=520 nên cả
     560px chiều cao phải nhìn thấy được, nếu không chân nó bị viền cắt.
     Thừa ngang thì căn giữa. */
  get scale() { return this.h / CFG.H; },

  /* Lề trái sau khi căn giữa phần thừa ngang */
  get offX() { return this.x + (this.w - CFG.W * this.scale) / 2; },

  /* Toạ độ con trỏ trên canvas -> toạ độ trong phòng */
  toRoom(x, y) {
    const s = this.scale;
    return { x: (x - this.offX) / s, y: (y - this.y) / s };
  },
};

/* Palette hướng cozy night: tối ấm, không phải pastel sáng.
   Đã nâng độ sáng ~10% so với bản đầu cho bớt ảm, nhưng vẫn giữ đủ tối
   để đèn sao và máy chiếu thiên hà nổi rõ về đêm. */
const PAL = {
  wallTop: '#55496f',
  wallBot: '#443a5f',
  floor: '#7a5c44',
  floorDark: '#674c38',
  rug: '#8d6b98',
  rugEdge: '#ab86b6',
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
  bowl: '#7fb6d8',          // bát trái, xanh
  bowlDark: '#5d92b4',
  bowlWarm: '#e0a86a',      // bát phải, cam — để phân biệt hai bát
  bowlWarmDark: '#bd8449',
  food: '#c97b48',
  ball: '#d95f8a',
  laser: '#ff4b5c',
  night: 'rgba(14, 12, 30, 0.62)',
};

/* Hai loài sống chung phòng. Mỗi con có palette, tốc độ, tỉ lệ riêng.
   body: 'ape' dùng bộ vẽ khỉ (thân dọc, tay dài); 'pig' có bộ vẽ riêng. */
const SPECIES = {
  orang: {
    key: 'orang',
    label: 'Đười ươi già',
    petName: 'Ông Ổi',
    body: 'ape',
    scale: 1.07,          // nhỏ lại cho ra tỉ lệ nhà búp bê
    speed: 0.85,          // già rồi, đi chậm rãi
    chaseSpeed: 1.9,      // vẫn đuổi laser nhưng lờ đờ
    startX: 430,
    hasLongArms: true,
    old: true,            // râu bạc, lưng gù, hay ngủ
    decayScale: { hunger: 0.85, energy: 1.35, happy: 0.9 },
    pal: {
      furA: '#bd744a', furB: '#8e5030', furLight: '#daa06c', belly: '#d9a97f',
      ear: '#c99c80', face: '#d6ae93', snout: '#e4c7a9',
      nostril: '#77492f', hoof: '#7b5539', eye: '#33221a',
      grey: '#e2dad0',    // râu và lông bạc quanh mặt
    },
  },
  pig: {
    key: 'pig',
    label: 'Lợn béo 100kg',
    petName: 'Ụt',
    body: 'pig',
    scale: 1.14,          // to ngang nhưng thấp; đã thu nhỏ theo tỉ lệ diáorama
    speed: 0.62,          // 100kg, lết từng bước
    chaseSpeed: 1.15,     // chả buồn đuổi laser
    startX: 730,
    hasLongArms: false,
    weight: 100,
    lazy: true,           // ưu tiên nằm, ngủ, ăn
    decayScale: { hunger: 1.9, energy: 0.7, happy: 0.85 },
    pal: {
      furA: '#eda6b0', furB: '#d4818f', furLight: '#f8c4cb', belly: '#f6c9d0',
      ear: '#e191a0', face: '#f0aeb8', snout: '#e88fa2',
      nostril: '#b5566a', hoof: '#8d5560', eye: '#3a2028',
    },
  },
};

/* Câu thoại cho lợn béo: chậm, thích ăn, thích nằm */
const PIG_MOODS = {
  yawn:   ['ngáp một cái to đùng', 'ngáp muốn trẹo mõm'],
  stretch:['vươn người rung cả bụng', 'duỗi bốn chân'],
  scratch:['cọ tai vào vai', 'gãi bằng chân sau'],
  lie:    ['nằm phơi bụng', 'nằm dài không thèm nhúc nhích'],
  watch:  ['dán mõm vào kính ngắm cá', 'nhìn cá mà thèm'],
  window: ['ngóng ra cửa sổ', 'hít hít mùi ngoài trời'],
  nuzzle: ['ủi mõm vào gấu bông', 'cọ đầu vào gấu bông'],
  climb:  ['trèo lên sofa, khó khăn lắm', 'nằm vắt vẻo trên sofa'],
  idle:   ['đứng thở phì phò', 'nhìn cái bát đầy mong đợi', 'ngẫm nghĩ về bữa sau'],
  walk:   ['lết cái bụng đi', 'đi từng bước nặng trịch', 'ục ịch tới chỗ khác'],
  sit:    ['ngồi bệt xuống nghỉ', 'ngồi mà bụng vẫn rung'],
  groom:  ['cọ lưng vào tường', 'ủi mõm xuống sàn'],
  sleep:  ['ngủ như chết', 'grừ grừ... phì...'],
  chase:  ['ậm ừ đi theo đốm đỏ', 'đuổi được hai bước là mệt'],
  play:   ['ủi quả bóng bằng mõm', 'lăn cùng quả bóng'],
  eat:    ['ĂN! ĂN NỮA!', 'ngốn sạch không chừa', 'ủn ỉn sung sướng'],
  pet:    ['ụt ịt khoan khoái...', 'lăn ra cho xoa bụng'],
  hungry: ['ré lên đòi ăn', 'ĐÓI! CHO ĂN ĐI!', 'gào đòi đồ ăn'],
  tired:  ['nặng mí quá rồi...', 'chỉ muốn nằm'],
  follow: ['ục ịch theo ông Ổi', 'lết tới tìm bạn'],
  greet:  ['hít hít chào bạn', 'ủn ỉn mừng bạn'],
};

/* Câu thoại cho đười ươi già: chậm rãi, hay ngẫm, hay mỏi */
const MOODS = {
  yawn:   ['ngáp dài một cái', 'ngáp, mắt nhoè cả nước'],
  stretch:['vươn hai tay dài rõ dài', 'duỗi lưng nghe rắc một tiếng'],
  scratch:['gãi tai lâu thật lâu', 'gãi sườn khoan khoái'],
  lie:    ['nằm dài trên thảm', 'nằm gối tay ngắm trần nhà'],
  watch:  ['ngồi ngắm cá bơi', 'dí mắt vào bể cá'],
  window: ['ngồi nhìn ra cửa sổ', 'ngắm trời qua ô kính'],
  nuzzle: ['vỗ vỗ con gấu bông', 'ôm gấu bông một cái'],
  climb:  ['leo lên sofa ngồi', 'ngồi tựa lưng sofa'],
  idle:   ['ngồi vắt tay ngẫm chuyện xưa', 'nhìn xa xăm', 'thở dài một cái'],
  walk:   ['chống tay đi chậm rãi', 'lê từng bước', 'đi mà lưng còng xuống'],
  sit:    ['ngồi bó tay nghĩ ngợi', 'ngồi ngắm anh, mắt lim dim'],
  groom:  ['vuốt chòm râu bạc', 'gãi gãi cái đầu hói'],
  sleep:  ['ngủ rồi, đừng ồn', 'khò khò...'],
  chase:  ['lọ mọ rượt đốm đỏ', 'đuổi mà xương kêu răng rắc'],
  play:   ['vỗ quả bóng nhẹ nhẹ', 'chơi được một lúc thôi'],
  eat:    ['nhai chậm, nhai kỹ', 'nhóp nhép từng miếng'],
  pet:    ['khì khì khoan khoái...', 'nhắm mắt hưởng thụ'],
  hungry: ['kêu khẹc đòi ăn', 'bụng réo rồi đấy'],
  tired:  ['già rồi, mỏi lắm...', 'lim dim mắt'],
  follow: ['lọ mọ tới tìm Ụt', 'chống tay đi tìm bạn'],
  greet:  ['vỗ vai bạn một cái', 'khẹc khẹc chào bạn'],
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

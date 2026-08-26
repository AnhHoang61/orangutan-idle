/* Xu tích theo thời gian. Hai đứa càng vui thì càng ra nhiều xu,
   nên chăm pet mới là cách kiếm tiền, không phải bấm nút liên tục. */
const Economy = {
  coins: 40,
  _acc: 0,          // phần thập phân dồn lại, chỉ cộng khi đủ 1 xu

  BASE_RATE: 0.9,   // xu/phút khi hai đứa buồn thiu
  HAPPY_BONUS: 4.2, // xu/phút thêm khi cả hai vui hết mức
  SLEEP_MULT: 0.45, // ngủ vẫn ra xu nhưng ít hơn

  reset() {
    this.coins = 40;
    this._acc = 0;
  },

  /* Xu mỗi phút ở trạng thái hiện tại. Dùng cho cả tích offline. */
  rate() {
    const list = Pets.list;
    if (!list.length) return this.BASE_RATE;

    let sum = 0;
    for (const a of list) {
      const mood = a.happy / 100;
      const mult = a.state === 'sleep' ? this.SLEEP_MULT : 1;
      sum += mood * mult;
    }
    const avg = sum / list.length;
    return this.BASE_RATE + this.HAPPY_BONUS * avg;
  },

  update(dt) {
    this._acc += this.rate() * (dt / 60000);
    if (this._acc >= 1) {
      const n = Math.floor(this._acc);
      this._acc -= n;
      this.coins += n;
    }
  },

  canAfford(n) { return this.coins >= n; },

  spend(n) {
    if (!this.canAfford(n)) return false;
    this.coins -= n;
    return true;
  },

  earn(n) { this.coins += n; },
};

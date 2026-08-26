/* Panel cửa hàng. Dựng lại danh sách mỗi lần mở, và chỉ cập nhật
   trạng thái nút khi số xu đổi — không dựng lại DOM mỗi frame. */
const Shop = {
  open: false,
  els: {},
  _lastCoins: -1,

  init() {
    this.els = {
      panel: document.getElementById('shop'),
      list: document.getElementById('shop-list'),
      purse: document.querySelector('#shop-purse b'),
      close: document.getElementById('shop-close'),
      btn: document.querySelector('[data-act="shop"]'),
    };
    if (!this.els.panel) return;

    this.els.close.addEventListener('click', () => this.hide());

    // mua: bắt ở container để không phải gắn listener từng nút
    this.els.list.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-buy]');
      if (b) this.buy(b.dataset.buy);
    });

    addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.open) { e.preventDefault(); this.hide(); }
    });
  },

  toggle() { this.open ? this.hide() : this.show(); },

  show() {
    if (!this.els.panel) return;
    this.open = true;
    this.els.panel.hidden = false;
    this.els.btn?.setAttribute('aria-expanded', 'true');
    this.render();
    this.els.close.focus();
  },

  hide() {
    if (!this.els.panel) return;
    this.open = false;
    this.els.panel.hidden = true;
    this.els.btn?.setAttribute('aria-expanded', 'false');
  },

  buy(id) {
    const it = Decor.byId(id);
    if (!it || Decor.has(id)) return;

    if (!Decor.tierUnlocked(it.tier)) {
      UI.say('Mua hết đồ hạng trước đã');
      return;
    }
    if (!Economy.spend(it.price)) {
      UI.say(`Còn thiếu ${it.price - Economy.coins} xu nữa`);
      return;
    }

    Decor.buy(id);
    Save.write();
    UI.say(`Đã kê ${it.name} vào phòng`);
    FX.spawn('spark', it.spot ? it.spot.x : 560, 420, 4);
    this.render();      // mua xong có thể mở tier mới
  },

  /* Dựng lại toàn bộ danh sách, nhóm theo tier */
  render() {
    if (!this.open || !this.els.list) return;

    const tiers = [...new Set(Decor.list.map((i) => i.tier))].sort((a, b) => a - b);
    const html = [];

    for (const t of tiers) {
      const unlocked = Decor.tierUnlocked(t);
      const items = Decor.list.filter((i) => i.tier === t);
      const done = items.every((i) => Decor.has(i.id));

      html.push(`<section class="shop-tier${unlocked ? '' : ' locked'}">`);
      html.push(`<h3>Hạng ${t}${done ? ' · đủ bộ' : unlocked ? '' : ' · chưa mở'}</h3>`);

      for (const it of items) {
        const owned = Decor.has(it.id);
        const afford = Economy.canAfford(it.price);
        const dis = !unlocked || !afford;
        html.push(`<div class="shop-row${owned ? ' owned' : ''}">`);
        html.push(`<span class="ico" aria-hidden="true">${it.icon}</span>`);
        html.push('<span class="txt">');
        html.push(`<span class="nm">${it.name}</span>`);
        html.push(`<span class="note">${it.note}</span>`);
        html.push('</span>');
        if (owned) {
          html.push('<span class="have">✓ đã có</span>');
        } else {
          html.push(`<span class="price">🪙 ${it.price}</span>`);
          html.push(`<button type="button" data-buy="${it.id}"${dis ? ' disabled' : ''}>`);
          html.push(unlocked ? 'Mua' : 'Khoá');
          html.push('</button>');
        }
        html.push('</div>');
      }
      html.push('</section>');
    }

    this.els.list.innerHTML = html.join('');
    this._lastCoins = Economy.coins;
    if (this.els.purse) this.els.purse.textContent = Economy.coins;
  },

  /* Gọi mỗi frame: chỉ dựng lại khi số xu thay đổi (nút Mua bật/tắt theo) */
  refresh() {
    if (!this.open) return;
    if (Economy.coins !== this._lastCoins) this.render();
  },
};

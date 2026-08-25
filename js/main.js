/* Vòng lặp game và xử lý input. */
const App = {
  ctx: null,
  last: 0,

  init() {
    const canvas = document.getElementById('scene');
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    UI.init();
    Pets.reset();
    Items.reset();

    this._bindPointer(canvas);
    this._bindButtons();
    this._bindKeys();

    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  },

  /* Quy đổi toạ độ con trỏ theo tỉ lệ canvas bị CSS scale */
  _toScene(e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (CFG.W / r.width),
      y: (e.clientY - r.top) * (CFG.H / r.height),
    };
  },

  _bindPointer(canvas) {
    canvas.addEventListener('pointermove', (e) => {
      const p = this._toScene(e);
      if (Items.laser.on) Items.aim(p.x, p.y);
    });

    canvas.addEventListener('pointerdown', (e) => {
      const p = this._toScene(e);
      if (Items.laser.on) { Items.aim(p.x, p.y); return; }
      const hit = Pets.at(p.x, p.y);
      if (hit) {
        UI.select(hit);
        UI.say(hit.pet());
      } else {
        // click ra sàn: gọi con đang chọn tới chỗ đó
        const a = UI.selected;
        if (a && a.state !== 'sleep') {
          a.target = { x: clamp(p.x, CFG.MARGIN, CFG.W - CFG.MARGIN),
                       y: clamp(p.y, CFG.WALK_TOP + 10, CFG.H - 40) };
          a.setState('walk');
        }
      }
    });

    canvas.addEventListener('pointerleave', () => {
      // laser bay ra khỏi phòng -> cả hai thôi đuổi
      if (Items.laser.on) Pets.each((a) => { if (a.state === 'chase') a.setState('idle'); });
    });
  },

  _bindButtons() {
    document.getElementById('actions').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (btn) this.act(btn.dataset.act);
    });
  },

  _bindKeys() {
    addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      const map = { p: 'pet', f: 'feed', l: 'laser', b: 'ball', ' ': 'light', c: 'scene', x: 'swap' };
      if (map[k]) { e.preventDefault(); this.act(map[k]); }
    });
  },

  act(name) {
    switch (name) {
      case 'pet':
        UI.say(UI.selected.pet());
        break;

      case 'swap':
        UI.select(UI.selected === Pets.orang ? Pets.chimp : Pets.orang);
        UI.say(`Đang chăm ${UI.selected.sp.petName}`);
        break;

      case 'feed':
        if (Items.fill()) {
          UI.say('Anh vừa rót thêm đồ ăn');
          Pets.each((a) => a.callToFood());   // cả hai kéo tới ăn
        } else {
          UI.say('Bát vẫn còn đầy mà');
        }
        break;

      case 'laser': {
        const on = Items.toggleLaser();
        this.canvas.classList.toggle('laser', on);
        if (on) {
          const keen = Pets.list.filter((a) => a.energy >= CFG.TIRED_AT);
          keen.forEach((a) => a.startChase());
          if (!keen.length) UI.say('Cả hai mệt quá, chẳng thèm đuổi');
          else if (keen.length === 2) UI.say('Cả hai lao theo đốm đỏ!');
          else UI.say(`${keen[0].sp.petName} phát hiện đốm đỏ!`);
        } else {
          UI.say('Tắt laser rồi');
        }
        break;
      }

      case 'ball': {
        if (Items.ball.active) { UI.say('Bóng đang ở trong phòng'); break; }
        Items.toss();
        const keen = Pets.list.filter((a) => a.energy >= CFG.TIRED_AT);
        keen.forEach((a) => a.startPlay());
        if (!keen.length) UI.say('Hai đứa lười, nằm nhìn quả bóng');
        else if (keen.length === 2) UI.say('Hai đứa tranh nhau quả bóng');
        else UI.say(`${keen[0].sp.petName} lao theo quả bóng`);
        break;
      }

      case 'scene': {
        const nm = Scenes.next();
        const lbl = document.getElementById('scene-label');
        if (lbl) lbl.textContent = nm;
        UI.say(`Bối cảnh: ${nm}`);
        break;
      }

      case 'light':
        Render.lightsOn = !Render.lightsOn;
        if (!Render.lightsOn) {
          UI.say('Tắt đèn, hai đứa dễ ngủ hơn');
          Pets.each((a) => {
            if (a.energy < 60 && a.state !== 'chase') a.setState('sleep');
          });
        } else {
          UI.say('Bật đèn lên');
          Pets.each((a) => {
            if (a.state === 'sleep' && a.energy > CFG.TIRED_AT) a.setState('idle');
          });
        }
        break;
    }
  },

  frame(now) {
    const dt = Math.min(60, now - this.last);   // kẹp dt để không nhảy khi tab ẩn
    this.last = now;

    Items.update(dt);
    Pets.update(dt);
    FX.update(dt);
    Render.draw(this.ctx);
    UI.refresh(dt);

    requestAnimationFrame((t) => this.frame(t));
  },
};

addEventListener('DOMContentLoaded', () => App.init());

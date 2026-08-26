/* Vòng lặp game và xử lý input. */
const App = {
  ctx: null,
  last: 0,

  init() {
    const canvas = document.getElementById('scene');
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // Pets phải có trước UI.init: UI.select() cần Pets.orang tồn tại,
    // không thì selected = null và refresh() thoát sớm mỗi frame.
    Pets.reset();
    Items.reset();
    UI.init();
    Shop.init();
    Decor.reset();
    Economy.reset();
    Rare.reset();
    Sky.reset();
    Weather.init();      // xin quyền vị trí rồi gọi Open-Meteo, không chặn game

    // nạp save (nếu có) rồi báo lại thời gian vắng mặt
    if (Save.load()) {
      const msg = Save.welcomeText();
      if (msg) UI.say(msg);
    }
    // lưu nốt khi đóng tab, không chờ autosave
    addEventListener('beforeunload', () => Save.write());
    addEventListener('visibilitychange', () => { if (document.hidden) Save.write(); });

    this._bindPointer(canvas);
    this._bindButtons();
    this._bindKeys();

    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  },

  /* Quy đổi toạ độ con trỏ: bù tỉ lệ CSS của canvas, rồi bù transform
     của hộp diáorama để ra toạ độ trong phòng. */
  _toScene(e) {
    const r = this.canvas.getBoundingClientRect();
    const cx = (e.clientX - r.left) * (CFG.W / r.width);
    const cy = (e.clientY - r.top) * (CFG.H / r.height);
    return BOX.toRoom(cx, cy);
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
      const map = { p: 'pet', f: 'feed', l: 'laser', b: 'ball', ' ': 'light', c: 'scene', x: 'swap', s: 'shop' };
      if (map[k]) { e.preventDefault(); this.act(map[k]); }
    });
  },

  act(name) {
    switch (name) {
      case 'pet':
        UI.say(UI.selected.pet());
        break;

      case 'swap':
        UI.select(UI.selected === Pets.orang ? Pets.pig : Pets.orang);
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
        Save.write();
        break;
      }

      case 'shop':
        Shop.toggle();
        break;

      case 'light':
        Render.lightsOn = !Render.lightsOn;
        Render.lightManual = true;      // người chơi đã can thiệp, đừng tự đổi nữa
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

  /* Đèn tự bật khi trời tối, tự tắt khi sáng — cho tới khi người chơi
     tự bấm nút Đèn, lúc đó nhường quyền cho họ tới hết phiên. */
  _autoLight() {
    if (Render.lightManual) return;
    const night = DayNight.isNight;
    if (night !== Render._wasNight) {
      Render._wasNight = night;
      Render.lightsOn = night;
    }
  },

  frame(now) {
    const dt = Math.min(60, now - this.last);   // kẹp dt để không nhảy khi tab ẩn
    this.last = now;

    DayNight.update(dt);
    this._autoLight();
    Weather.update(dt);
    Sky.update(dt);
    Items.update(dt);
    Rare.update(dt);
    Pets.update(dt);
    FX.update(dt);
    Economy.update(dt);
    Save.update(dt);
    Render.draw(this.ctx);
    UI.refresh(dt);
    Shop.refresh();

    requestAnimationFrame((t) => this.frame(t));
  },
};

addEventListener('DOMContentLoaded', () => App.init());

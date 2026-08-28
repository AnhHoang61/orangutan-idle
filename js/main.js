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
    Chat.init();      // chat độc lập với game loop, không cần update mỗi frame
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

    /* Co-op sau Save.load(): host phát trạng thái đã nạp, chứ không phát
       trạng thái mặc định rồi mới nạp đè lên. Chat.init() ở trên mở khoá
       Room sẵn nếu đã lưu mật khẩu, nên Net.start() có khoá mà dùng.
       Không await: nếu broker chậm thì game vẫn chạy solo trong lúc chờ. */
    Net.start();

    /* Lưu nốt khi đóng tab, không chờ autosave. Máy khách chỉ lưu SAU khi đã
       nhận trạng thái đầu tiên — lưu sớm hơn là ghi đè save cũ của mình bằng
       trạng thái trước lúc vào phòng, mất cả hai đằng. */
    const saveNow = () => { if (!Net.isGuest() || Net._gotSnap) Save.write(); };
    addEventListener('beforeunload', saveNow);
    addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });

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
      Net.aim(p.x, p.y);          // gửi con trỏ cho người kia thấy (tiết chế)
      if (!Items.laser.on) return;
      // chủ phòng ngắm trực tiếp; máy khách chờ chủ phòng dội lại qua snapshot
      if (!Net.isGuest()) { Net.takeAim(); Items.aim(p.x, p.y); }
    });

    canvas.addEventListener('pointerdown', (e) => {
      const p = this._toScene(e);
      if (Items.laser.on) { Items.aim(p.x, p.y); return; }
      const hit = Pets.at(p.x, p.y);
      if (hit) {
        UI.select(hit);                          // chọn: view state riêng máy này
        this.act('pet', { pet: hit.sp.key });
      } else if (UI.selected) {
        // click ra sàn: gọi con đang chọn tới chỗ đó
        this.act('walk', { pet: UI.selected.sp.key, x: p.x, y: p.y });
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

  /* Tầng input: người này bấm nút. Tách khỏi apply() để co-op có thể gửi ý
     định sang máy kia mà không phải viết bản luật thứ hai — host xử ý định
     bằng cách gọi đúng apply() này.

     Máy khách KHÔNG tự sửa thế giới: nó gửi ý định rồi chờ snapshot. Chấp
     nhận trễ một vòng (~60-200ms qua broker) thay vì đoán trước, vì đoán sai
     thì người chơi THẤY rõ — mua xong hiện rồi mất là đọc như bug. Với lại
     nửa số hành động do rand() quyết (toss, callToFood) nên không đoán nổi. */
  act(name, arg) {
    arg = arg || {};

    if (Net.isGuest()) {
      // hai thứ này là view state riêng máy, không đụng tới thế giới
      if (name === 'swap' || name === 'shop') { this.apply(name, arg); return; }
      Net.intent(name, arg);
      return;
    }

    this.apply(name, arg);
    if (Net.isHost()) Net.afterAct(name, arg);
  },

  /* Tầng mutation: đổi trạng thái game thật. arg.pet là key loài ('orang' /
     'pig') — bắt buộc tường minh khi lệnh tới từ máy khác, vì UI.selected là
     view state riêng của mỗi máy, hai người chọn hai con khác nhau. */
  apply(name, arg) {
    arg = arg || {};
    const who = arg.pet ? Pets.list.find((a) => a.sp.key === arg.pet) : UI.selected;

    switch (name) {
      case 'pet':
        if (who) UI.say(who.pet());
        break;

      // click ra sàn: gọi con đó tới chỗ đó
      case 'walk':
        if (who && who.state !== 'sleep') {
          who.target = { x: clamp(arg.x, CFG.MARGIN, CFG.W - CFG.MARGIN),
                         y: clamp(arg.y, CFG.WALK_TOP + 10, CFG.H - 40) };
          who.setState('walk');
        }
        break;

      // đổi con đang chăm: view state thuần, không đụng tới thế giới
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
    /* Máy khách không tự quyết đèn: nó chỉ gác bằng lightManual, nên nếu máy
       khách có lightManual = false thì tới ranh giới ngày/đêm nó sẽ tự đảo
       lightsOn rồi đánh nhau với snapshot mỗi frame. */
    if (Net.isGuest()) return;
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

    // Máy khách lấy giờ từ snapshot của chủ phòng, không đọc đồng hồ mình:
    // hai người lệch múi giờ vẫn thấy cùng ánh sáng, cùng lúc pet buồn ngủ.
    if (!Net.isGuest()) DayNight.update(dt);
    this._autoLight();
    Weather.update(dt);
    Sky.update(dt);
    Net.update(dt);

    /* Máy khách KHÔNG chạy mô phỏng: hành vi pet đầy Math.random() và phụ
       thuộc frame rate nên hai máy tự chạy sẽ lệch nhau. Nó chỉ nội suy vị
       trí nhận được (trong Net.update) rồi vẽ.

       Items.update thì vẫn chạy: nó chỉ tích phân bóng và kéo laser về đích,
       cả hai được snapshot chỉnh lại 5 lần/giây, mà chạy cục bộ thì đốm laser
       trôi 60fps thay vì giật từng nhịp. */
    Items.update(dt);
    if (!Net.isGuest()) {
      Rare.update(dt);
      Pets.update(dt);
      Economy.update(dt);
      Save.update(dt);
    } else if (Net._gotSnap) {
      Save.update(dt);      // vẫn lưu để máy này khởi động solo được sau này
    }
    FX.update(dt);
    Render.draw(this.ctx);
    UI.refresh(dt);
    Shop.refresh();

    requestAnimationFrame((t) => this.frame(t));
  },
};

addEventListener('DOMContentLoaded', () => App.init());
